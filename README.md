# AnyDB MCP Service

[![npm version](https://img.shields.io/npm/v/anydb-mcp-service.svg)](https://www.npmjs.com/package/anydb-mcp-service)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An MCP server that lets AI clients work with AnyDB records and build complete
AnyDB solutions. It supports record and file operations, semantic type
authoring, filtered Views, record and form sharing, and event-driven workflows.

## Capabilities

- Discover, create, inspect, update, search, copy, move, and delete records.
- Search record content by meaning with authorized hybrid semantic search.
- Discover reusable workspace and built-in types before creating new ones.
- Define or import types with fields, layouts, formulas, badges, and child policies.
- Create and manage filtered workspace or child Views.
- Create public or private record and form shares.
- Discover workflow capabilities and create or manage workflow graphs.
- Upload small files inline or large files through presigned URLs.
- Design a standalone type or coordinated multi-type solution with packaged
  MCP prompts, a canonical guide, and machine-readable authoring schemas.

Solution creation is intentionally composed from focused tools rather than one
opaque `create_solution` operation. This lets clients discover and reuse
existing artifacts, validate mutations, resume safely after partial failure,
and inspect each result.

## Installation

[View `anydb-mcp-service` on npm](https://www.npmjs.com/package/anydb-mcp-service).

```bash
npm install anydb-mcp-service
```

For a global installation:

```bash
npm install -g anydb-mcp-service
```

## Configuration

### Prerequisites

- Node.js 16 or later
- An [AnyDB](https://www.anydb.com) account
- An AnyDB API key and its associated email address

Get your API key from **Profile > Integration** in the
[AnyDB application](https://app.anydb.com). Keep it private.

For the complete MCP-specific installation and Claude configuration guide, see
[AnyDB MCP integration](https://www.anydb.com/support/integrations/mcp-claude).

### Environment Variables

| Variable                   | Required | Default                     | Description                       |
| -------------------------- | -------: | --------------------------- | --------------------------------- |
| `ANYDB_DEFAULT_API_KEY`    |      Yes | -                           | AnyDB integration API key         |
| `ANYDB_DEFAULT_USER_EMAIL` |      Yes | -                           | Email associated with the API key |
| `ANYDB_API_URL`            |       No | `https://app.anydb.com/api` | AnyDB API base URL                |

### Claude Desktop

Add the server to the Claude Desktop configuration:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "anydb": {
      "command": "npx",
      "args": ["-y", "anydb-mcp-service@latest"],
      "env": {
        "ANYDB_DEFAULT_API_KEY": "your_api_key_here",
        "ANYDB_DEFAULT_USER_EMAIL": "your_email@example.com",
        "ANYDB_API_URL": "https://app.anydb.com/api"
      }
    }
  }
}
```

Restart Claude Desktop after changing its configuration.

Use the exact variable name `ANYDB_API_URL`. `ANYDB_API_BASE_URL` is not
recognized and causes the service to fall back to the default production URL.

### Other MCP Clients

Run the stdio server with:

```bash
npx -y anydb-mcp-service
```

Configure environment variables in the MCP host rather than passing credentials
through a conversation.

## HTTP Transport

Alongside the default stdio transport, the server runs over MCP Streamable HTTP
for clients that connect to a URL rather than spawning a process:

```bash
npm run start:http
```

The endpoint is stateless: every request builds its own MCP server, so no
session state is carried between requests. `POST /` is the only MCP method;
`GET` and `DELETE` return 405. `GET /health` reports liveness and version.

| Variable | Default | Purpose |
| ------------------- | ----------------------- | ----------------------------------------------------- |
| `MCP_HTTP_PORT` | `3001` | Listen port, separate from the REST server's port |
| `MCP_HTTP_HOST` | `127.0.0.1` | Bind address; widen only behind a TLS proxy |
| `MCP_ALLOWED_ORIGINS` | *(unset)* | Comma-separated browser origins; unset emits no CORS |
| `MCP_RESOURCE_URI` | `https://mcp.anydb.com` | Canonical resource id and expected token audience |
| `MCP_OAUTH_ISSUER` | `https://app.anydb.com` | Authorization server that issues access tokens |
| `MCP_OAUTH_JWKS_URI` | `<issuer>/.well-known/jwks.json` | Token verification keys |
| `MCP_OAUTH_ENABLED` | `true` | Set `false` to run API-key-only |

### Authentication

Requests authenticate with either an OAuth 2.1 bearer token or the API-key
headers. A bearer token wins when both are present, so an OAuth session never
silently falls back to a differently-scoped API key.

```
Authorization: Bearer <access token>
```

```
x-anydb-api-key: <key>
x-anydb-email: <email associated with the key>
```

Bearer tokens are verified against the authorization server's JWKS: RS256 only,
with issuer, audience, and expiry all checked. A token minted for a different
audience is rejected. Unauthorized responses carry a `WWW-Authenticate` header
pointing at `/.well-known/oauth-protected-resource`, which is how a client
discovers where to authenticate.

The token claims, scopes (`mcp:read`, `mcp:write`, `mcp:author`), and discovery
documents are specified in [docs/token-contract.md](docs/token-contract.md); the
rollout is planned in [docs/oauth2-plan.md](docs/oauth2-plan.md).

## Solution Building

The server supports either one standalone type or a coordinated solution with
multiple types, relationships, Views, shares, and workflows.

Recommended sequence:

1. Read `anydb://guides/solution-building/v1` and the authoring schema.
2. Search workspace types with `anydb_discover_types` and inspect promising
   definitions with `anydb_get_type_definition`.
3. Search built-in types only when no compatible workspace type exists.
4. Reuse, import, or define each required type. Create dependencies first.
5. List existing Views, shares, and workflows before creating duplicates.
6. Create requested Views and shares after their targets exist.
7. Create workflows last, only when an event must cause a side effect.
8. Validate results and inspect representative workflow execution history.

Mutation tools accept a stable `clientRequestId`. Reuse the same value when
retrying the same intended mutation. Most authoring mutations also support
`validateOnly: true` for validation without persistence.

Use stable type names and field keys in authoring inputs. Template IDs are
version-specific implementation details, not semantic identifiers.

## MCP Tools

The service exposes 44 tools.

### Setup

| Tool                    | Description                                                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `anydb_get_setup_guide` | Return API-key, MCP client configuration, verification, and troubleshooting guidance without requiring configured credentials |
| `anydb_whoami`          | Report which AnyDB account this connection is authenticated as, how, and with what scopes — also without requiring configured credentials |

### Solution Discovery

| Tool                                   | Description                                                              |
| -------------------------------------- | ------------------------------------------------------------------------ |
| `anydb_get_authoring_guide`            | Return the canonical solution-building guide before authoring            |
| `anydb_discover_types`                 | Search reusable workspace, built-in, or all type catalogs                |
| `anydb_get_type_definition`            | Get a complete type definition by stable name and source                 |
| `anydb_list_workflows`                 | List normalized workflow graphs in a database                            |
| `anydb_get_workflow`                   | Get one workflow graph and retained execution details                    |
| `anydb_get_workflow_execution_history` | Get retained executions for one workflow                                 |
| `anydb_list_workflow_triggers`         | List supported triggers and exact schemas                                |
| `anydb_list_workflow_actions`          | List available actions, schemas, compatibility, and license availability |

### Type Authoring

| Tool                     | Description                                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| `anydb_create_workspace` | Create a new empty AnyDB workspace                                                             |
| `anydb_create_type`      | Define a new type or import a compatible built-in type                                         |
| `anydb_update_type`      | Patch type metadata (icon, title formula), fields, badges, or child policy and migrate records |

`anydb_create_type` supports semantic fields, a six-column form layout,
formulas, lookups, badges, and child policies. Destructive type updates require
explicit data-loss confirmation and an expected revision.

A type's `titleFormula` names its records from their own fields and recomputes
when a field it reads changes. Set it at creation through `type.titleFormula` or
on an existing type through `anydb_update_type`'s `changes.titleFormula`. It must
be an expression returning a string, so use `CONCAT('Meeting: ', {{Subject}})` —
a template string such as `{{Name}} ({{Status}})` is not valid and silently
leaves record names unwritten.

### Views

| Tool                | Description                                         |
| ------------------- | --------------------------------------------------- |
| `anydb_list_views`  | List Views with decoded scope, targets, and filters |
| `anydb_get_view`    | Get one View's complete definition                  |
| `anydb_create_view` | Create a filtered workspace or direct-child View    |
| `anydb_update_view` | Rename a View or replace its targets and filters    |
| `anydb_delete_view` | Permanently delete a confirmed View                 |

A workspace View is attached to the database root. A children View is attached
to a specific parent and lists matching direct children. Targets use stable type
names; filters can address cell fields, metadata, or badges.

### Sharing

| Tool                     | Description                                                |
| ------------------------ | ---------------------------------------------------------- |
| `anydb_list_team_groups` | List stable team group names available for private sharing |
| `anydb_list_shares`      | List semantic record and form share facets                 |
| `anydb_get_share`        | Get one share facet by `shareId` and `kind`                |
| `anydb_create_share`     | Create a public or private record or form share            |
| `anydb_revoke_share`     | Revoke one facet while preserving another facet            |

Public shares omit recipients and return a usable `publicUrl`. Private shares
require recipient emails and/or exact group names. Record shares may specify a
`viewer` or `editor` role and include attachments. Form shares use a stable
template name and may specify the parent that receives submissions.

### Workflows

| Tool                    | Description                                                        |
| ----------------------- | ------------------------------------------------------------------ |
| `anydb_create_workflow` | Create one trigger followed by an ordered action chain             |
| `anydb_update_workflow` | Change a workflow's metadata and/or replace its whole action chain |

Always query the trigger and action catalogs before creating automation. They
contain authoritative schemas, compatibility rules, script runtime guidance,
and current-team license availability. Create workflows disabled by default,
run a representative case, and inspect its execution history before enabling it.

For a script action, `anydb_list_workflow_actions` returns the running server's
script runtime surface under the `action_script` entry's `guidance`, and the
solution-building guide's Script Actions section carries the authoring rules the
server enforces at validation. To revise an existing script, read its stored
source from `anydb_get_workflow` at the `action_script` entry's `config.script`,
then resend the complete action chain through `anydb_update_workflow`.

### Records and Templates

| Tool                      | Description                                                  |
| ------------------------- | ------------------------------------------------------------ |
| `anydb_semantic_search`   | Search authorized records by content meaning                 |
| `list_teams`              | List accessible teams as id, name, and plan                  |
| `anydb_get_permissions`   | What a user may do with a team, database, or record          |
| `anydb_check_permissions` | Check specific permission type/level pairs for a user        |
| `list_databases_for_team` | List databases in a team                                     |
| `list_templates`          | List workspace templates/types                               |
| `get_template`            | Get a template schema by stable `templatename`               |
| `list_records`            | List records with pagination and structured filters          |
| `get_record`              | Get one complete record                                      |
| `create_record`           | Create a record, optionally from a template or under parents |
| `bulk_create_records`     | Create up to 100 records with per-item results               |
| `update_record`           | Update record metadata, parents, and partial cell content    |
| `bulk_update_records`     | Update up to 100 records with per-item results               |
| `delete_record`           | Delete a record, or detach it from specific parents          |
| `copy_record`             | Copy a record with configurable attachment handling          |
| `move_record`             | Reassign a record to a single new parent                     |
| `search_records`          | Search records in one database                               |
| `search_team_records`     | Search each accessible database in a team                    |

Bulk operations use bounded concurrency and partial-failure semantics. A
successful item is not rolled back when another item fails. Use `clientref` to
correlate results.

AnyDB records can have more than one parent. `create_record` takes `attach`, and
`update_record` takes `meta.attach`, either as a single parent ID or an array of
parent IDs — `update_record` is how a record is attached to several parents. The
value replaces the record's complete parent list, so resend every parent that
must stay attached. `move_record` is a single-parent reassignment that detaches
the record from all of its current parents, and `delete_record` with
`removefromids` detaches from specific parents without deleting the record.

Structured `list_records` filters support metadata, badges, and template fields:

```json
{
  "teamid": "team-id",
  "adbid": "database-id",
  "templatename": "Tasks",
  "filter": [
    { "type": "cell", "field": "{{Status}}", "op": "eq", "value": "Done" }
  ]
}
```

### Files

| Tool                   | Description                                               |
| ---------------------- | --------------------------------------------------------- |
| `download_file`        | Return a temporary download or preview URL                |
| `upload_file`          | Upload a small inline payload in one call                 |
| `prepare_file_upload`  | Create a child File record and return a presigned PUT URL |
| `complete_file_upload` | Finalize a successful presigned upload                    |

Both upload workflows create a separate child File record attached to the
supplied parent. They do not overwrite the parent's content. The optional
`cellpos` identifies the file cell on the child File record.

Use `upload_file` for small base64 or UTF-8 payloads. For large files, call
`prepare_file_upload`, PUT the exact bytes to its URL, and then call
`complete_file_upload` with the returned child File ID and exact size.

Normal download URLs expire after approximately 60 seconds. Fetch them
immediately and request a new URL instead of caching an expired one.

## MCP Resources

| URI                                     | Content                                                                                        |
| --------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `anydb://guides/setup/v1`               | API-key retrieval, MCP client configuration, verification, and troubleshooting                 |
| `anydb://guides/solution-building/v1`   | Design and construction rules for types, relationships, formulas, Views, shares, and workflows |
| `anydb://schemas/solution-authoring/v1` | JSON Schema contracts used by solution-authoring tools                                         |

The guide is also available through `anydb_get_authoring_guide` for clients that
do not expose MCP resource reading directly.

## MCP Prompts

| Prompt                         | Purpose                                                      |
| ------------------------------ | ------------------------------------------------------------ |
| `design_anydb_type`            | Plan one standalone type without inventing a larger solution |
| `design_anydb_solution`        | Plan a coordinated multi-type solution before mutation       |
| `author_anydb_workflow_script` | Author, or review and revise, a workflow script action       |

Every prompt requires a `goal` and accepts optional `constraints`.
`author_anydb_workflow_script` also accepts a `workflowId` to review and revise
an existing workflow's script instead of writing a new one.

## Troubleshooting

- Confirm `ANYDB_API_URL` points to the AnyDB API and is reachable.
- Confirm the API key belongs to `ANYDB_DEFAULT_USER_EMAIL`.
- Restart the MCP host after changing environment variables or package version.
- Read the guide before diagnosing rejected authoring requests; these tools
  enforce semantic validation and authorization.
- Use `validateOnly: true` to diagnose authoring requests without persistence.
- Inspect workflow execution history when automation does not appear to run.

## Support

- [AnyDB MCP and Claude integration guide](https://www.anydb.com/support/integrations/mcp-claude)
- [AnyDB documentation](https://www.anydb.com/support)
- [AnyDB website](https://www.anydb.com)

## License

MIT. See [LICENSE](LICENSE).
