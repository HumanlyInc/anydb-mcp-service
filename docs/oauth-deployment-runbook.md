# OAuth 2.1 — Production Deployment and Test Runbook

**For:** first deployment of the MCP OAuth authorization server · **Date:** 2026-08-26

Follow this in order. Every step has a check that tells you whether to continue.
Substitute your real hosts for `app.anydb.com` and `mcp.anydb.com`.

Design background is in [`oauth2-plan.md`](./oauth2-plan.md); the claim set is
frozen in [`token-contract.md`](./token-contract.md).

**Nothing turns on until step 3.** `OAUTH_AS_ENABLED` defaults to false, so you
can deploy the code first and verify it changed nothing.

---

## Phase L — Run it locally first

Verified on this dev machine on 2026-08-27. Do this before touching production —
it exercises the same code paths in about ten minutes.

### L1. Prerequisites

```bash
cd anydb-server
docker compose up -d          # mongo, redis, dynamodb-local, nats, opensearch
docker ps | grep dynamodb     # must be running AND healthy
```

> If DynamoDB has been up a long time, check `docker logs dynamodb-local | tail`.
> A `SQLiteException: unable to open database file` loop means it is wedged and
> every request will hang; `docker restart dynamodb-local` fixes it without data
> loss. This had happened on this machine.

### L2. Branches

| Repo | Branch |
| --- | --- |
| `anydb-server` | `feat/ext-bearer-scopes-phase-3` |
| `anydb-mcp-service` | `feat/mcp-http-oauth-phase-0-1` |

### L3. Configure and start the API

Add to `anydb-server/.env` and use your normal workflow — no inline variables
needed. `Settings` loads `.env` on boot.

```bash
OAUTH_AS_ENABLED=true
OAUTH_ISSUER_URL=http://localhost:3000     # must match PORT in the same file
OAUTH_MCP_RESOURCE=http://localhost:3001
```

```bash
cd anydb-server
npm run dev                # terminal 1
npm run dev:worker         # terminal 2, as usual
```

⚠️ **`OAUTH_ISSUER_URL` is what makes local work.** The issuer defaults to
`APP_URL`, which points at the UI dev server (4000), not the API. Without the
override every token fails with "unexpected iss". Set it to whatever port
`npm run dev` actually listens on.

**Workers need nothing.** `src/worker.ts` never calls `loadRoutes`, so it does
not mount the authorization server; the variables are simply unused there.

`OAUTH_JWKS` stays unset locally — the library generates development keys and
says so loudly. Fine here, refused in production.

> `OAUTH_AS_ENABLED=true` in `.env` leaves the authorization server on for all
> your local work. Harmless, but persistent — set it back to `false` if you would
> rather opt in per session.

Check it came up:

```bash
curl -s http://localhost:3000/oauth/.well-known/oauth-authorization-server | jq \
  '{issuer, jwks_uri, registration_endpoint, code_challenge_methods_supported, grant_types_supported}'
```

Expect `issuer: http://localhost:3000/oauth`, PKCE `["S256"]`, and grants
without `implicit`.

### L4. Configure and start the MCP service

`anydb-mcp-service` already has a `.env` and loads it. Add:

```bash
MCP_HTTP_PORT=3001
MCP_HTTP_HOST=127.0.0.1
MCP_RESOURCE_URI=http://localhost:3001
MCP_OAUTH_ISSUER=http://localhost:3000/oauth   # server port, plus /oauth
MCP_OAUTH_ENABLED=true
ANYDB_API_URL=http://localhost:3000/api
```

```bash
cd anydb-mcp-service
npm run start:http         # = npm run build && node dist/http.js
```

There is no watch mode for the HTTP transport — `npm run dev` there is only
`tsc --watch`. For reload-on-change, run `tsc --watch` in one terminal and
re-run `node dist/http.js` as needed.

**Three values must agree across the two files.** This is where local setups
usually break:

| | `anydb-server/.env` | `anydb-mcp-service/.env` |
| --- | --- | --- |
| Issuer | `OAUTH_ISSUER_URL=http://localhost:3000` | `MCP_OAUTH_ISSUER=http://localhost:3000/oauth` |
| Audience | `OAUTH_MCP_RESOURCE=http://localhost:3001` | `MCP_RESOURCE_URI=http://localhost:3001` |

Note the **`/oauth` suffix on the MCP side only** — there the issuer is the
mount path, while on the server side it is the base URL. Any mismatch fails
tokens with "unexpected iss" or an audience error.

Expect on startup:

```
AnyDB MCP HTTP transport 2.1.0 listening on http://127.0.0.1:3001
  auth: bearer (aud http://localhost:3001) + API key
```

Then:

```bash
curl -s http://127.0.0.1:3001/health
curl -s http://127.0.0.1:3001/.well-known/oauth-protected-resource | jq
curl -s -i -X POST http://127.0.0.1:3001/ -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | grep -i 'HTTP/\|www-authenticate'
```

`authorization_servers` must read `["http://localhost:3000/oauth"]`, and the
last call must return 401 with a `WWW-Authenticate` header.

### L5. Register a client and start the flow

```bash
curl -s -X POST http://localhost:3000/oauth/reg \
  -H 'Content-Type: application/json' \
  -d '{"client_name":"Local Test","redirect_uris":["https://example.com/callback"],
       "grant_types":["authorization_code","refresh_token"],"response_types":["code"],
       "token_endpoint_auth_method":"none"}' | jq -r .client_id
```

Generate a PKCE pair:

```bash
V=$(openssl rand -base64 32 | tr -d '=+/' | cut -c1-43)
C=$(printf %s "$V" | openssl dgst -binary -sha256 | openssl base64 | tr '+/' '-_' | tr -d '=')
echo "verifier=$V"; echo "challenge=$C"
```

Open in a browser, substituting `CLIENT_ID` and `$C`:

```
http://localhost:3000/oauth/auth?client_id=CLIENT_ID&response_type=code&redirect_uri=https%3A%2F%2Fexample.com%2Fcallback&scope=openid%20mcp%3Aread&resource=http%3A%2F%2Flocalhost%3A3001&code_challenge=CHALLENGE&code_challenge_method=S256
```

You should get the **AnyDB sign-in page** (verified rendering locally), then a
consent screen, then a redirect to `example.com` carrying `?code=…`. The page
will not load — copy the `code` out of the URL bar.

Sign in with any account that exists in your local database.

### L6. Finish the flow

```bash
curl -s -X POST http://localhost:3000/oauth/token \
  -d grant_type=authorization_code -d code=THE_CODE \
  -d redirect_uri=https://example.com/callback -d client_id=CLIENT_ID \
  -d resource=http://localhost:3001 -d code_verifier=$V | jq
```

Then run **D4 through D7** below against the local hosts — inspect the claims,
call the MCP server, prove `mcp:read` cannot write, and revoke.

### L7. Point a real client at it (optional)

Hosted connectors need a public HTTPS URL. Expose both ports with a tunnel and
restart with the tunnel hostnames in `OAUTH_ISSUER_URL`, `OAUTH_MCP_RESOURCE`,
`MCP_RESOURCE_URI`, and `MCP_OAUTH_ISSUER` — they must match exactly, or
audience and issuer checks will reject the token.

---

## Phase A — Prepare (before any deploy)

### A1. Merge in order

| Order | PR | Repo |
| --- | --- | --- |
| 1 | anydb-server #2072 — authorization server | `anydb-server` |
| 2 | anydb-server #2073 — bearer + scopes (retarget to `main` after #2072) | `anydb-server` |
| 3 | anydb-mcp-service #21 — resource server | `anydb-mcp-service` |

### A2. Generate the signing key

```bash
node scripts/generate-oauth-jwks.cjs
```

One line of JSON containing a **private** key. Put it in your secret store as
`OAUTH_JWKS`. Never commit it.

> Without it the server refuses to mount the authorization server in production,
> because the library would otherwise use development keys that are identical in
> every install — anyone could mint a valid AnyDB token.

### A3. DNS and TLS for `mcp.anydb.com`

Points at the MCP service. It is the token audience and must be HTTPS.

### A4. Set environment variables

**anydb-server:**

```bash
OAUTH_AS_ENABLED=false          # stays false until step C1
OAUTH_MCP_RESOURCE=https://mcp.anydb.com
OAUTH_JWKS=<from A2>
OAUTH_DB_IMPL=DYNAMO            # must match the rest of the deployment
OAUTH_ACCESS_TOKEN_TTL=3600
OAUTH_REFRESH_TOKEN_TTL=2592000
```

**anydb-mcp-service:**

```bash
MCP_HTTP_PORT=3001
MCP_HTTP_HOST=0.0.0.0           # only behind a TLS-terminating proxy
MCP_RESOURCE_URI=https://mcp.anydb.com
MCP_OAUTH_ISSUER=https://app.anydb.com/oauth
MCP_OAUTH_ENABLED=true
```

⚠️ **`MCP_OAUTH_ISSUER` includes `/oauth`.** The issuer is the mount path, not
the bare host. A mismatch fails every token with "unexpected iss".

⚠️ **`OAUTH_DB_IMPL=DYNAMO` also belongs in the `ANYDB_SERVER_DYNAMODB_TEST_ENV`
GitHub secret.** Otherwise the DynamoDB CI job tests OAuth against Mongo and
tells you nothing about production.

### A5. DynamoDB permissions

The server creates its own table on first boot. The deploy role needs
`CreateTable`, `DescribeTable`, `UpdateTable`, `UpdateTimeToLive`, plus
`GetItem`/`PutItem`/`UpdateItem`/`DeleteItem`/`Query` on `oauthstate` and its
indexes.

---

## Phase B — Deploy with OAuth off

### B1. Deploy both services

### B2. Confirm nothing changed

```bash
curl -s https://mcp.anydb.com/health
```

Expect `{"status":"ok","service":"anydb-mcp-service","version":"..."}` with the
**real package version** — if it says `1.0.0`, the Phase 0 fix is not deployed.

Then confirm an existing API-key integration still works. **This is the
regression gate: if anything here is broken, stop and roll back.**

### B3. Confirm the AS is genuinely off

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  https://app.anydb.com/oauth/.well-known/oauth-authorization-server
```

Expect **404** (the SPA catch-all). A 200 means `OAUTH_AS_ENABLED` leaked in.

---

## Phase C — Turn on the authorization server

### C1. Set `OAUTH_AS_ENABLED=true` on anydb-server and restart

### C2. Check the logs

Expect:

```
{OAUTH} Authorization server mounted at /oauth (issuer https://app.anydb.com/oauth, audience https://mcp.anydb.com)
```

Two lines that mean **stop and fix**:

| Log line | Cause |
| --- | --- |
| `OAUTH_JWKS is required in production; not mounting` | A2 not applied |
| `quick start development-only signing keys are used` | `OAUTH_JWKS` unset or unparseable — **do not proceed**, anyone could mint tokens |

`oidc-provider WARNING: Unsupported runtime` is expected and harmless — see
decision 7 in the plan.

### C3. Verify discovery

```bash
curl -s https://app.anydb.com/oauth/.well-known/oauth-authorization-server | jq
```

Check all of:

- `"issuer": "https://app.anydb.com/oauth"` — must match `MCP_OAUTH_ISSUER` exactly
- `"code_challenge_methods_supported": ["S256"]` — **must not contain `plain`**
- `grant_types_supported` — `authorization_code` and `refresh_token`, **no `implicit`**
- `registration_endpoint` present (hosted clients self-register)

And the RFC 8414 alias, which is what a spec-following client actually requests:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -L \
  https://app.anydb.com/.well-known/oauth-authorization-server/oauth
```

Expect **200** after the redirect.

### C4. Verify the signing keys are yours

```bash
curl -s https://app.anydb.com/oauth/jwks | jq '.keys[] | {kid, alg, d}'
```

`kid` must match the one from A2, and `d` must be **null** — a private exponent
here means private key material is being served publicly. Stop immediately.

### C5. Verify the resource server

```bash
curl -s https://mcp.anydb.com/.well-known/oauth-protected-resource | jq
```

`authorization_servers` must be exactly `["https://app.anydb.com/oauth"]`.

Then confirm the challenge that lets a client discover where to authenticate:

```bash
curl -s -i -X POST https://mcp.anydb.com/ \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | grep -i 'HTTP/\|www-authenticate'
```

Expect `401` and a `WWW-Authenticate: Bearer resource_metadata="..."` header.
**No header means no client can ever discover how to authenticate.**

And that a forged token is refused:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://mcp.anydb.com/ \
  -H 'Authorization: Bearer not.a.real.token' \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Expect **401**.

---

## Phase D — First real login (use a test account)

### D1. Register a client by hand

```bash
curl -s -X POST https://app.anydb.com/oauth/reg \
  -H 'Content-Type: application/json' \
  -d '{
    "client_name": "Deployment Smoke Test",
    "redirect_uris": ["https://example.com/callback"],
    "grant_types": ["authorization_code", "refresh_token"],
    "response_types": ["code"],
    "token_endpoint_auth_method": "none"
  }' | jq
```

Expect **201** and a `client_id`. No `client_secret` — these are public clients.

### D2. Walk the browser flow

Open, replacing `CLIENT_ID`:

```
https://app.anydb.com/oauth/auth?client_id=CLIENT_ID&response_type=code&redirect_uri=https%3A%2F%2Fexample.com%2Fcallback&scope=openid%20mcp%3Aread&resource=https%3A%2F%2Fmcp.anydb.com&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256
```

You should see, in order:

1. **AnyDB sign-in** — try a **password account** and a **Google/Microsoft/Apple
   account**; both must work
2. **A consent screen** naming "Deployment Smoke Test" and listing what it can do
3. A redirect to `https://example.com/callback?code=...` (the page will not load —
   that is fine, you only need the `code`)

If you are already signed in to AnyDB, step 1 is skipped by design.

### D3. Exchange the code

Within 60 seconds (codes are short-lived):

```bash
curl -s -X POST https://app.anydb.com/oauth/token \
  -d grant_type=authorization_code \
  -d code=THE_CODE \
  -d redirect_uri=https://example.com/callback \
  -d client_id=CLIENT_ID \
  -d resource=https://mcp.anydb.com \
  -d code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk | jq
```

Expect `access_token`, `refresh_token`, `token_type: "Bearer"`, `expires_in: 3600`.

### D4. Inspect the token

```bash
echo 'ACCESS_TOKEN' | cut -d. -f2 | base64 -d 2>/dev/null | jq
```

Verify every one of these:

| Claim | Expected |
| --- | --- |
| `iss` | `https://app.anydb.com/oauth` |
| `aud` | `https://mcp.anydb.com` |
| `sub` | the test user's AnyDB id |
| `email` | the test user's email |
| `scope` | `openid mcp:read` — **and nothing you did not ask for** |
| `exp − iat` | `3600` |

### D5. Call the MCP server for real

```bash
curl -s -X POST https://mcp.anydb.com/ \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | head -c 400
```

Expect a tool list. **This is the moment the whole chain is proven.**

### D6. Prove scopes actually restrict

The token from D2 has only `mcp:read`. Call a write tool — creating a record —
and expect a **scope error**, not success:

```bash
curl -s -X POST https://mcp.anydb.com/ \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"anydb_create_record","arguments":{}}}' | head -c 400
```

Expect a message containing *"not granted permission to create or change
records"*. **If this succeeds, scope enforcement is not working — stop and
investigate.** Everything else can look right while this is broken.

### D7. Revoke and confirm it takes effect

```bash
curl -s https://app.anydb.com/api/auth/connectedapps \
  -H "Cookie: <your browser session cookie>" | jq
```

"Deployment Smoke Test" should be listed. Revoke it:

```bash
curl -s -X POST https://app.anydb.com/api/auth/connectedapps/revoke \
  -H "Cookie: <session cookie>" \
  -H 'Content-Type: application/json' \
  -d '{"grantid":"THE_GRANT_ID"}' | jq
```

Now repeat D5. It must fail. **Revocation that does not stop a live token is not
revocation.**

---

## Phase E — Real connectors

Only after Phase D passes end to end.

### E1. ChatGPT

Add a connector pointing at `https://mcp.anydb.com`. ChatGPT discovers the
authorization server, registers itself, and opens the AnyDB login.

> Connector requirements have shifted over time — check current OpenAI docs for
> whether your account needs developer mode, and whether specific tools are
> required. If discovery fails, C3's RFC 8414 alias check is the first thing to
> re-verify.

### E2. claude.ai and Claude mobile

Add the same URL as a custom connector. Mobile uses the same flow — nothing
mobile-specific to configure.

### E3. Confirm in the product

Each connector should appear under connected apps, and revoking one there must
stop it working.

---

## Rollback

**Set `OAUTH_AS_ENABLED=false` and restart.** OAuth endpoints disappear; the
API-key path is untouched, so existing integrations keep working. Issued tokens
stop being accepted because the AS no longer serves keys.

Nothing needs to be un-deployed. No data migration is involved — OAuth state
lives in its own `oauthstate` table / `oauth_state` collection and can be dropped
independently.

---

## Watch after launch

- **Registration volume.** DCR is open at launch by design. A spike means abuse —
  the fallback is an allowlist (plan decision 3).
- **Token issuance failures**, which usually mean clock skew or a key problem.
- **`{OAUTH}` warnings**, especially index or TTL messages on first boot.
- **Consent-to-completion drop-off.** A cliff suggests the consent screen is
  scaring people or the redirect is failing.

## Known limitations at launch

- **A workflow run needs only `mcp:write`.** A script action inside a workflow
  can do more than write, so a client with write scope can reach authoring
  behaviour through a workflow someone already authored. Deliberate, flagged for
  review in anydb-server #2073.
- **Consent screens are functional, not branded.** They use the palette from the
  transactional emails; a design pass is worthwhile before wide rollout.
- **Access tokens cannot be revoked mid-life.** Revocation stops refresh
  immediately, but an already-issued access token stays valid until it expires —
  up to 1 hour. Shorten `OAUTH_ACCESS_TOKEN_TTL` if that window is too wide.
