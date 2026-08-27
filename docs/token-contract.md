# AnyDB MCP — OAuth Token Contract v1

**Status:** Frozen for Phase 1 / Phase 2 implementation · **Date:** 2026-08-26

This is the interface between the Authorization Server (`anydb-server`) and the
Resource Server (`anydb-mcp-service`). Both sides code against this document;
changes require bumping the version and updating both repos together.

See [`oauth2-plan.md`](./oauth2-plan.md) for the delivery plan this supports.

## 1. Identifiers

| Name | Value |
| --- | --- |
| Resource (audience) | `https://mcp.anydb.com` |
| Authorization Server issuer | `https://app.anydb.com/oauth` |
| AS metadata | `https://app.anydb.com/oauth/.well-known/oauth-authorization-server` (also served at the RFC 8414 path `/.well-known/oauth-authorization-server/oauth`) |
| JWKS | `https://app.anydb.com/oauth/jwks` |
| RS metadata | `https://mcp.anydb.com/.well-known/oauth-protected-resource` |

All are configurable in the MCP service via environment variables (§6) so that
staging and local development can point elsewhere. Production values are the
table above.

## 2. Access token

A signed JWT, `alg: RS256`, `typ: at+jwt`. Verified statelessly by the MCP
service against the AS's JWKS. The MCP service never mints tokens.

```json
{
  "iss": "https://app.anydb.com",
  "sub": "6512f1c0a3b4d5e6f7a8b9c0",
  "aud": "https://mcp.anydb.com",
  "client_id": "mcp_c_9f2b1e77",
  "scope": "mcp:read mcp:write",
  "email": "jsmith@anydb.com",
  "iat": 1756224000,
  "exp": 1756227600,
  "jti": "0d9c1a2b3c4d5e6f"
}
```

| Claim | Required | Notes |
| --- | --- | --- |
| `iss` | yes | Must equal the configured issuer exactly |
| `sub` | yes | AnyDB user id (Mongo ObjectId string). Stable across login methods — password, magic link, Google, Apple, Microsoft all yield the same `sub` for the same user |
| `aud` | yes | Must equal `https://mcp.anydb.com`. String or single-element array. **A token whose audience is anything else is rejected** |
| `client_id` | yes | Registered OAuth client that the token was issued to; logged for audit |
| `scope` | yes | Space-delimited (RFC 8693 style), from the set in §3 |
| `email` | yes | The user's AnyDB email. Lets the ext API resolve identity without a token-introspection round-trip |
| `iat` / `exp` | yes | **TTL: 3600 s (1 h).** Clock skew tolerance: 60 s |
| `jti` | yes | Unique token id, for revocation lists and audit correlation |

### Refresh tokens

Opaque, server-side, never seen by the MCP service. TTL 30 days, rotated on
every use, reuse revokes the family. Entirely an AS concern.

## 3. Scopes

| Scope | Grants |
| --- | --- |
| `mcp:read` | Discovery and read tools — type/record lookup, search, workflow inspection, execution history, guides |
| `mcp:write` | Record mutation — create, update, bulk operations, file upload |
| `mcp:author` | Creating or changing types, workflows (including scripts), and reports |

Scopes are cumulative, not hierarchical: a client needing to read and write
requests `mcp:read mcp:write`. Enforcement lives in the ext API (Phase 3); the
MCP service checks that at least `mcp:read` is present and passes the token
through.

## 4. Discovery documents

### `GET https://mcp.anydb.com/.well-known/oauth-protected-resource` (RS — Phase 1)

```json
{
  "resource": "https://mcp.anydb.com",
  "authorization_servers": ["https://app.anydb.com"],
  "scopes_supported": ["mcp:read", "mcp:write", "mcp:author"],
  "bearer_methods_supported": ["header"],
  "resource_documentation": "https://www.anydb.com/support/integrations/mcp-claude"
}
```

Served unauthenticated, `Content-Type: application/json`, CORS-open (clients
fetch it cross-origin before they hold any credential).

### `GET https://app.anydb.com/.well-known/oauth-authorization-server` (AS — Phase 2)

Must advertise at minimum:

```json
{
  "issuer": "https://app.anydb.com",
  "authorization_endpoint": "https://app.anydb.com/oauth/authorize",
  "token_endpoint": "https://app.anydb.com/oauth/token",
  "registration_endpoint": "https://app.anydb.com/oauth/register",
  "revocation_endpoint": "https://app.anydb.com/oauth/revoke",
  "jwks_uri": "https://app.anydb.com/oauth/jwks",
  "scopes_supported": ["mcp:read", "mcp:write", "mcp:author"],
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "code_challenge_methods_supported": ["S256"],
  "token_endpoint_auth_methods_supported": ["none"]
}
```

`code_challenge_methods_supported` must **not** include `plain`.

## 5. Authentication on the MCP endpoint

Request:

```
POST / HTTP/1.1
Host: mcp.anydb.com
Authorization: Bearer <access token>
Content-Type: application/json
Accept: application/json, text/event-stream
```

Unauthenticated or invalid-token response — the `WWW-Authenticate` header is how
clients discover where to authenticate, so it is mandatory on every 401:

```
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer resource_metadata="https://mcp.anydb.com/.well-known/oauth-protected-resource", error="invalid_token", error_description="..."
Content-Type: application/json
```

```json
{
  "jsonrpc": "2.0",
  "id": null,
  "error": { "code": -32001, "message": "Unauthorized: <reason>" }
}
```

| Condition | Status | `error` |
| --- | --- | --- |
| No credentials at all | 401 | `invalid_request`(omitted per RFC 6750 for missing creds) |
| Malformed / bad signature / expired | 401 | `invalid_token` |
| Wrong `aud`, `iss` | 401 | `invalid_token` |
| Valid token, scope insufficient | 403 | `insufficient_scope` (+ `scope="..."`) |

**Legacy API-key auth** (`x-anydb-api-key` + `x-anydb-email`) remains accepted on
the same endpoint. When both are present, the bearer token wins. The API-key
path is not scope-checked — it keeps today's full-access semantics.

## 6. MCP service configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `MCP_HTTP_PORT` | `3001` | Listen port (replaces the `REST_API_PORT` collision with the REST server) |
| `MCP_HTTP_HOST` | `127.0.0.1` | Bind address. Set `0.0.0.0` only behind a TLS-terminating proxy |
| `MCP_RESOURCE_URI` | `https://mcp.anydb.com` | Canonical resource identifier; the expected `aud` |
| `MCP_OAUTH_ISSUER` | `https://app.anydb.com` | Expected `iss`; base for AS metadata |
| `MCP_OAUTH_JWKS_URI` | `<issuer>/jwks` | Verification keys. The AS publishes here, not at the RFC 8414 `.well-known/jwks.json` path |
| `MCP_ALLOWED_ORIGINS` | *(unset — no CORS)* | Comma-separated browser origin allowlist |
| `MCP_OAUTH_ENABLED` | `true` when a JWKS URI resolves | Set `false` to run API-key-only |

## 7. Verification rules (Phase 1, normative)

The MCP service must, in order:

1. Reject if `Authorization` is present but not a well-formed `Bearer` scheme.
2. Fetch and cache the JWKS (cache keyed on `kid`, refetch on unknown `kid`, with
   a floor between refetches so an unknown-`kid` flood cannot become a DoS on
   the AS).
3. Verify signature with `RS256` only — never accept `alg: none`, and never
   accept an HMAC alg where a public key is expected.
4. Verify `iss` equals the configured issuer.
5. Verify `aud` contains the configured resource URI **exactly**.
6. Verify `exp` / `iat` within 60 s clock skew.
7. Require at least one recognized `mcp:*` scope.
8. On success, forward the bearer token verbatim to the ext API and carry
   `sub` / `email` / `scope` for logging.

Failures never leak token contents. Log `jti`, `client_id`, and `sub` only.
