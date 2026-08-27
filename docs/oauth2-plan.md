# OAuth 2.1 Support for the AnyDB MCP Service — Delivery Plan

**Status:** Decisions locked, ready to build · **Date:** 2026-08-26 · **Owner:** TBD

## 1. Why

The header-based API-key auth (`x-anydb-api-key` / `x-anydb-email`) only works for
clients whose configuration the user controls (Claude Code, Cursor, local stdio).
Two client classes cannot use it at all:

1. **Mobile apps** (including Claude mobile) — connectors are configured on the
   hosted platform, which offers no custom-header field.
2. **Hosted clients** (ChatGPT connectors, claude.ai custom connectors) — these
   speak the MCP authorization spec: OAuth 2.1 authorization-code + PKCE,
   discovery via well-known metadata, and `Authorization: Bearer` tokens. Nothing
   else.

Supporting them requires AnyDB to expose a spec-compliant OAuth 2.1 surface. The
API-key path stays for existing config-based clients.

## 2. Current state

| Component | What exists | Gap |
| --- | --- | --- |
| `anydb-server` `/api/auth` (`user.controller.ts`) | OAuth **client** (relying party): passport login via Google / Apple / Microsoft, express-session cookies, JWT signing primitives (`getOauthMobileLoginToken`, `Settings.OTP_JWT_SECRET`), Mongo user store | No authorization-**server** role: no `/authorize`, `/token`, discovery metadata, PKCE, client registration, or consent |
| `anydb-server` `/api/integrations/ext` (`ext.controller.ts`) | Per-request guard `validateApiKeyAccess` resolving header API key → `User` | No bearer-token guard, no scopes |
| `anydb-mcp-service` `src/http.ts` | Stateless Streamable HTTP transport; credentials read from custom headers | No bearer parsing, no `WWW-Authenticate` challenge, no protected-resource metadata, no audience validation |

Key fact shaping the design: **the existing Google/Apple/Microsoft code is
relying-party login, not an authorization server.** It is reused *inside* the new
`/oauth/authorize` endpoint as the way the human authenticates — it does not
replace that endpoint.

**Ruled out:** forwarding anydb session cookies to hosted clients. No hosted MCP
client can capture or replay cookies; cookies are unscoped ambient authority with
no per-client revocation; and adding cookie auth to the ext API would open CSRF
surface that the header design is currently immune to.

## 3. Target architecture

```
ChatGPT / claude.ai / Claude mobile          (MCP client, OAuth client)
        │
        │ 1. GET /.well-known/oauth-protected-resource   ── MCP server
        │ 2. GET /.well-known/oauth-authorization-server ── anydb-server
        │ 3. POST /oauth/register          (dynamic client registration)
        │ 4. Browser: /oauth/authorize  ──▶ passport Google/Apple/Microsoft
        │                                    login + consent screen
        │ 5. POST /oauth/token             (code + PKCE ▶ access/refresh)
        │
        │ 6. Authorization: Bearer <access token, aud = MCP resource>
        ▼
anydb-mcp-service HTTP transport   (resource server: verify sig, exp, aud, scope)
        ▼
anydb-server /api/integrations/ext (bearer guard, scope-checked, resolves User)
```

- **Authorization Server (AS) lives in `anydb-server`.** It already owns
  identity, sessions, passport strategies, the user store, and JWT signing.
  Building the AS in the MCP service would duplicate all of that and create a
  second credential-minting system.
- **The MCP service stays a thin resource server (RS).** Per-request: parse
  bearer, verify, enforce audience, pass identity through to the ext API.

## 4. Design decisions (proposed)

| Decision | Recommendation | Rationale |
| --- | --- | --- |
| Access-token format | **JWT, RS256**, claims `sub`, `aud`, `scope`, `client_id`, `exp`; keys published at a JWKS endpoint on anydb-server. **Decided TTLs: 1 h access / 30 d refresh** | MCP server validates statelessly (no DB hop per request) and cannot mint tokens itself. HS256/shared secret would let any holder of the secret mint. |
| Refresh tokens | Opaque, stored server-side, **rotation on every use**, reuse detection revokes the family | OAuth 2.1 baseline for public clients |
| Audience | **Decided: `https://mcp.anydb.com`**, per RFC 8707 `resource` parameter. The ext API accepts the same audience for requests arriving via the MCP path | The MCP server is a thin proxy over the ext API — same logical resource, both anydb-owned. Avoids token-exchange complexity. Revisit if the ext API ever gets third-party direct-bearer access. |
| PKCE | **S256 mandatory**, no exceptions; `plain` rejected | OAuth 2.1 requirement; all target clients are public clients |
| Client registration | Dynamic (RFC 7591). **Decided: fully open at launch**, rate-limited, registrations recorded and listable by admins, monitored closely with the option to move to an allowlist | Hosted clients generally rely on DCR. ⚠️ Verify against current ChatGPT connector docs at build time — their exact requirements (incl. whether specific `search`/`fetch` tools are needed outside developer mode) have shifted over time. |
| Scopes | `mcp:read` (discovery/read tools), `mcp:write` (record mutations), `mcp:author` (creating/changing types, workflows incl. scripts, and — when they ship — reports) | This server exposes workflow and type mutation; "connected app can rewrite your automations" must be an explicit grant, not the default. Scope strings are extensible: report authoring lands under `mcp:author` without a new grant round. |
| Consent | Per-client consent screen naming the client and requested scopes; grants stored; user-visible list + revocation in AnyDB account settings | Baseline for delegating to third-party AI vendors |
| API-key path | Unchanged, still supported on both MCP server and ext API | Existing integrations (incl. Zapier) keep working |
| AS implementation | **Decided: [`oidc-provider`](https://github.com/panva/node-oidc-provider) v9.11.5 (MIT)**, mounted in `anydb-server` via `provider.callback()`. We write the Mongo adapter, the signing keys, and the interactions handler — nothing protocol-level | OpenID-certified. PKCE enforcement, DCR, discovery, JWKS, refresh rotation with reuse detection, revocation, and RFC 8707 resource indicators all come from the library. Hand-rolling this surface is how confused-deputy and code-replay holes get shipped |
| Node runtime | **Decided: stay on Node 20 for this work.** The Node 22 upgrade is tracked separately, on its own merits | `oidc-provider` v9 runs correctly on Node 20 — verified end-to-end (discovery, JWKS, DCR, S256-only PKCE, `plain` rejected). Its `Unsupported runtime` notice is an advisory LTS-codename check that calls `attention.warn` and gates nothing. **No rollup or bundler change is needed either**: rollup emits `require()` for externals, and Node 20.19 backported `require(esm)` |

## 5. Phased delivery

### Phase 0 — Harden the MCP HTTP transport *(prerequisite, ~0.5 day)*

The fixes from the 2026-08-26 review of `src/http.ts`, required before this
endpoint is internet-reachable:

- Close `Server` + transport on `res.close` (measured leak ~110 KB/request)
- `POST`-only; `405` for GET/DELETE (stateless mode)
- CORS origin allowlist; bind `127.0.0.1` by default outside production
- Dedicated `MCP_HTTP_PORT` (currently collides with `REST_API_PORT`)
- `/health` endpoint; stop logging credential material at startup
- Fix `serverVersion` (hardcoded `1.0.0` in `src/config.ts`)

**Exit:** soak test shows flat RSS; only POST accepted; deployable behind TLS.

### Phase 1 — Resource-server plumbing in `anydb-mcp-service` *(~1–2 days)*

- Parse `Authorization: Bearer`; keep header auth as fallback
- `401` responses carry `WWW-Authenticate: Bearer resource_metadata="…"` and a
  JSON-RPC-shaped body
- Serve `/.well-known/oauth-protected-resource` (points at the anydb-server AS)
- Token verification module: JWKS fetch + cache, `exp`/`aud`/`scope` checks
- Map verified token → the identity the ext client needs; forward bearer to the
  ext API (Phase 3 guard)

Independent of Phase 2 once the token contract (§4) is agreed; testable with a
stub signer.

**Exit:** valid signed JWT reaches tools; wrong-audience token rejected 401;
expired token rejected; discovery doc served; API-key path still green.

### Phase 2 — Authorization Server in `anydb-server` *(the bulk: ~2–3 weeks)*

Built on `oidc-provider` (see §4). The protocol endpoints below are the
library's; our work is the three integration pieces it explicitly requires —
a persistent adapter, real signing keys, and an interactions handler — plus
the consent UI and connected-apps management.

**Runtime:** no prerequisite. Stays on Node 20; `oidc-provider` was verified
working there. Two consequences to expect: the library logs an
`Unsupported runtime` advisory on every boot (harmless, but tell whoever watches
the logs), and any library bug hit on Node 20 will likely be answered upstream
with "upgrade Node", since the maintainer supports current LTS only. The Node 22
upgrade is tracked as separate work.

**What we configure rather than write:**

- `/.well-known/oauth-authorization-server` metadata + JWKS endpoint
- `GET /oauth/authorize`: validates client + PKCE challenge + `resource`;
  authenticates the user via the **existing passport session/login flow** — any
  method that ends in `req.logIn` works unchanged: password (`/login/password`,
  passport `local`), magic link, Google, Apple, Microsoft. The token layer never
  sees which method was used; `sub` is the anydb user ID either way. Renders
  consent; issues short-lived single-use code bound to the challenge. The
  pending authorize request (client, challenge, scopes, redirect URI) must
  survive the login round-trip — extend the existing session-stash pattern
  (`oauthapp` / `oauthredirect`) to carry it, including the multi-redirect
  social case
- `POST /oauth/token`: code exchange (PKCE verify), refresh grant with rotation
  + reuse detection; issues RS256 JWTs per §4
- `POST /oauth/register`: DCR with validation (redirect-URI allowrules, rate
  limits) and admin visibility
- Revocation endpoint (RFC 7009)

**Delivery slices:** 2a (provider mounted, adapter, discovery/DCR/JWKS/revocation)
· 2b (interactions handler wired to passport login) · 2c (consent UI +
connected-apps management).

**What we actually write:**

- **Storage for both backends**, following the repo's per-entity `db/` pattern
  (`interface` / `factory` / `mongo/` / `dynamo/`), selected by `OAUTH_DB_IMPL`.
  **Production runs DynamoDB**, so a Mongo-only adapter would put tokens,
  grants, and revocations in a different store from every other entity. Backs
  client registrations, auth codes, refresh-token families, grants, and sessions
- **Signing keys**: real RS256 JWKS in configuration, sourced from secrets
  rather than the library's dev keys, with a rotation story
- **Interactions handler**: replaces `devInteractions`. Resumes at
  `/oauth/authorize`, delegates to the existing passport login when there is no
  session, renders consent, then calls `interactionFinished`
- **Consent UI** + "Connected apps" management and revocation in account
  settings

**Exit:** full authorize→token→refresh→revoke cycle passes an OAuth 2.1
conformance checklist; MCP Inspector completes the flow end-to-end.

### Phase 3 — Bearer guard + scopes in the ext API *(~2–4 days)*

- `validateBearerAccess` in `ext.controller.ts` as a sibling of
  `validateApiKeyAccess`: verify JWT (shared verification lib with Phase 1),
  resolve `sub` → `User`
- Scope enforcement per route class: read endpoints require `mcp:read`,
  mutations `mcp:write`, type/workflow authoring `mcp:author`
- API-key requests bypass scope checks (unchanged semantics)

**Exit:** scoped tokens can only reach permitted routes; existing API-key and
Zapier integrations unaffected.

### Phase 4 — Client rollout + ops *(~1 week)*

- End-to-end tests: MCP Inspector, ChatGPT (developer-mode connector first),
  claude.ai custom connector, Claude mobile
- Docs: README section, `.env.example`, deployment guide (TLS termination,
  canonical resource URI)
- Ops: rate limiting on AS endpoints, metrics/alerts on token issuance
  failures, audit log lines for consent + revocation
- Decide public rollout (which plans/teams get connector access)

**Exit:** a fresh ChatGPT connector reaches AnyDB tools with only a browser
login; revoking in AnyDB settings kills access within token TTL.

## 6. Security checklist (must hold at ship)

- [ ] PKCE S256 enforced; `plain` and no-PKCE rejected
- [ ] Exact-match redirect URIs; no wildcards
- [ ] Auth codes single-use, ≤60 s TTL, bound to client + PKCE challenge
- [ ] Refresh rotation with family revocation on reuse
- [ ] Access tokens audience-bound; MCP server rejects foreign `aud`
- [ ] Consent names the client and scopes; grants revocable by the user
- [ ] AS endpoints rate-limited; DCR abuse-limited
- [ ] No token, code, or key material in logs (Phase 0 also removes current
      startup credential logging)
- [ ] HTTPS-only in production; HSTS at the edge

## 7. Decisions log (2026-08-26)

All five open questions were resolved on 2026-08-26; the design-decision table
in §4 reflects them.

1. **Canonical MCP URL: `mcp.anydb.com`.** This is the `aud` value and the base
   for both discovery documents.
2. **Scope mapping confirmed:** creating/changing types, workflows (incl.
   scripts), and — when they ship — reports are all `mcp:author`. Record
   mutations are `mcp:write`; discovery/read tools are `mcp:read`.
3. **DCR fully open at launch**, rate-limited and monitored closely, with the
   option to tighten to an allowlist if abused. Monitoring hooks land in
   Phase 4 ops.
4. **Own-brand mobile app stays as-is.** The `anydbmobile://` token hand-off is
   untouched; the AS endpoints are purely additive, so current behavior cannot
   change. Migrating the app onto the AS is a separate future project.
5. **Token TTLs confirmed: 1 h access / 30 d refresh** (with rotation per §4).

Added 2026-08-26 while scoping Phase 2:

6. **AS built on `oidc-provider` v9.11.5 (MIT), not hand-rolled.** Verified it
   instantiates against our exact §4 contract — PKCE S256 required, DCR,
   revocation, resource indicators binding `aud: https://mcp.anydb.com`, JWT
   access tokens, 1 h / 30 d TTLs — and exposes `provider.callback()` for
   Express mounting.
7. **Stay on Node 20; the Node 22 upgrade is decoupled from this project.**
   `oidc-provider` v9 was verified working on Node 20.19.4 end to end: discovery
   served, JWKS served, DCR issued a client for a ChatGPT redirect URI, PKCE
   advertised as `S256` only, and a `plain` challenge rejected. Its
   `Unsupported runtime` notice is an advisory LTS-codename comparison
   (`Iron` < `Jod`) that calls `attention.warn` and gates nothing. The RS256
   signing path is independently proven on Node 20 by the Phase 1 test suite.

   **No rollup or bundler change is required either.** An earlier reading that
   the CJS/ESM boundary would block the import was wrong: rollup emits
   `require()` for external packages and Node 20.19 backported `require(esm)`,
   so it already loads.

   Two consequences accepted: the advisory line appears in production logs on
   every boot, and a library bug encountered on Node 20 will likely be answered
   upstream with "upgrade Node". Worth noting separately that Node 20 is at or
   past end-of-life, which is an argument for scheduling the Node 22 upgrade on
   its own merits — confirm against the current release schedule.

Added 2026-08-26 while building Phase 2a:

8. **`devInteractions` must be explicitly disabled.** The library ships a
   development login screen that authenticates whoever submits it, **enabled by
   default**. Until the Phase 2b interactions handler exists, it is off
   everywhere except local dev, and a test pins the safe value as the default.
9. **`responseTypes` pinned to `["code"]`.** The library derives
   `grant_types_supported` from response types, and the defaults advertised
   `implicit` — a flow OAuth 2.1 removes. Caught by a discovery-document test,
   not by reading the config.
10. **ESM loading needs one escape hatch** (`oauth.import.ts`). A plain
    `await import()` is rewritten into `require()` by both the rollup CJS output
    and jest's transform, and neither can load an ES module. Building the import
    through `new Function` keeps a real native `import()` in every environment,
    so the code under test is the code that ships.
11. **Jest needs `--experimental-vm-modules`.** Added to `test` and
    `test:clean`, matching what `testci`/`testci:clean` already set. CI runs
    `npm run test`, which lacked it.
12. **AS lives at `src/modules/user/oauth/`**, not a new top-level module —
    it is identity work and reuses the passport session, and the repo already
    carries 32 top-level modules.

Added 2026-08-26 while building Phase 2b and the storage layer:

13. **OAuth storage must support both backends, selected by `OAUTH_DB_IMPL`.**
    The first cut was Mongo-only, which would have split OAuth state away from
    the DynamoDB the rest of production uses. The DynamoDB table needs three
    sparse GSIs, because the library looks records up by grant id, session uid,
    and device user code — otherwise those reads are table scans. Two gaps the
    repo had no precedent for: nothing enables DynamoDB **TTL** (so expired
    tokens would accumulate forever), and `ensureTableExists` does not wait for
    a table to go **ACTIVE** (a fresh deploy with three GSIs would fail logins
    until it settled). Expiry is enforced on read in both backends — Mongo's
    sweeper lags about a minute, DynamoDB's up to 48 hours.
14. **Consent grants the resource the request named**, not the configured one.
    Recording scopes against `OAUTH_MCP_RESOURCE` left the requested resource
    still missing, so the provider re-prompted for consent forever. Only the
    full flow exposed this; the code read correctly.
15. **Refresh tokens are issued to any client allowed the grant.** The library
    additionally requires the `offline_access` scope, which OIDC honours only
    when the client sends `prompt=consent`. Hosted MCP clients vary, and
    without a refresh token users would re-authenticate hourly, contradicting
    the 30-day refresh above. The consent screen therefore states staying
    connected unconditionally rather than letting a request parameter decide
    whether the user is told.
16. **Login reuses `/api/auth/login/password`** rather than adding a second
    credential path, so rate limiting and allowlisting still apply. Social
    logins started inside the flow return via a **relative, pattern-matched**
    interaction path — an absolute URL there would turn AnyDB login into an
    open redirect.

## 8. Deployment actions outstanding

These need someone with access; they cannot be done from the repo.

- **`OAUTH_DB_IMPL=DYNAMO`** must be set in every DynamoDB environment, and
  added to the `ANYDB_SERVER_DYNAMODB_TEST_ENV` GitHub secret. Until then the
  DynamoDB CI job exercises OAuth against Mongo.
- **`OAUTH_JWKS`** must hold real RS256 signing keys in production. The server
  refuses to mount without it there, because the library's fallback development
  keys are identical in every install.
- **`OAUTH_AS_ENABLED=true`** to turn the endpoints on at all; off by default.
- **DNS for `mcp.anydb.com`**, the canonical resource identifier and token
  audience.
