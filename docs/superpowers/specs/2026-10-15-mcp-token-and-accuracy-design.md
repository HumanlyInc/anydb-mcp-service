# MCP token cost, accuracy and permission authoring

Status: design approved 2026-10-15. Not implemented. Tracked by the backlog issues listed under
"Work items".

## Goal

Make the MCP service cheaper to load for clients that list every tool up front (ChatGPT, Cursor
and others without tool deferral) without making any client less effective, and keep what the
tools say accurate as the server changes. Extra turns are acceptable; lost capability or
silently wrong results are not.

What the user said:

- Clients that matter: Claude.ai and Claude Code, plus ChatGPT, Cursor and others that load every
  tool. Optimise for the clients without deferral.
- Do not reduce effectiveness to save tokens. Being a little slower because of extra turns is fine.
- Tools must be accurate (current with the server) and informative enough that a client picks the
  best tool for its task.
- The service is listed in the Anthropic and OpenAI directories; changes must not create
  approval problems.
- MCP clients should be able to build complex permission structures, not only read them.

## Measured baseline (main at 469453b)

Measured by listing tools through an in-memory MCP client against `createMcpServer`.

| Surface | Tools | tools/list size | Instructions |
| --- | --- | --- | --- |
| `/` (full) | 135 | 207,895 chars, about 58k tokens | 1,115 chars |
| `/reviewed` | 122 | 182,444 chars, about 51k tokens | 784 chars |

Largest tools by description plus input schema (chars): `anydb_update_type` 17,362,
`anydb_create_type` 9,708, `anydb_save_agent` 9,324, `update_record` 7,489, `anydb_create_share`
5,769, `anydb_update_share` 5,153, `anydb_create_workflow` 4,622. The twelve
`anydb_workflow_set_*_step` tools add about 15k chars between them. Most of the bulk is
per-property prose inside input schemas, not the top-level descriptions.

Resources: `resources/solution-building-v1.md` is 116 KB in one file and
`resources/solution-authoring-v1.schema.json` is 51 KB. `anydb_get_authoring_guide` already
answers single topics (ISSUE - 324), but the full-profile server instructions still tell clients to
read the whole `anydb://guides/solution-building/v1` resource and the whole schema before
authoring.

The `/reviewed` instructions (`REVIEWED_WORKFLOW_GUIDE`) carry only workflow guidance: the rule
to pass `fields` with `values: true` on record reads is absent there, so the OpenAI surface never
receives it.

## Directory constraints

Checked 2026-10-15.

OpenAI app submission guidelines:

- Each model-callable operation is its own tool with a clear description, input schema and
  annotations.
- No discovery, operation selection or schema fetching behind a generic executor to reach
  operations that were not individually exposed.
- Descriptions must match the schema and actual behaviour; an unclear description can be rejected.
- `readOnlyHint`, `destructiveHint` and `openWorldHint` are explicit booleans on every tool.
- Same-endpoint tool fixes normally ship as deploy plus Rescan (see
  `docs/issue-564-resubmission.md`).

Anthropic Software Directory Policy (replaced the MCP Directory Policy on 2026-04-15):

- 2A/2B: narrow, unambiguous descriptions that precisely match functionality.
- 2F: do not direct Claude to dynamically pull behavioural instructions from external sources.
- 2G: no hidden, obfuscated or encoded instructions.
- 5B: MCP servers must be frugal with tokens.
- 5C: tool names at most 64 characters.
- Ongoing review: future changes must stay compliant.

Neither source says whether renaming or adding tools triggers a new review. Treat any tool-list
change as needing a rescan and batch changes accordingly.

## Decision

Keep every tool one-to-one with its operation, with its current name and annotations. Reduce
cost by making descriptions and schemas contract-length and moving the remaining detail into
guide topics one call away. Rejected:

- A generic gateway (`anydb_call(op, args)`) and per-domain `read`/`write` tools with an `action`
  enum. Both are the operation-selection pattern OpenAI rejects, and both lose per-tool argument
  validation and per-tool allow/deny in clients, which reduces effectiveness.
- Dynamic tool groups enabled at runtime with `tools/list_changed`. The streamable-HTTP transport
  builds a server per POST and holds no session state to remember an enabled group.
- Renaming tools. It breaks AnyBot prompts, saved agent prompts, `reviewed-workflow-actions.json`
  and client allowlists for no token gain.

## Design

### 1. Contract-length tool descriptions and schemas

Each tool description states: what it does, when to use it instead of its neighbours, the one or
two rules whose violation fails silently, and the guide topic that holds the rest
(`see anydb_get_authoring_guide topic "cells"`). Per-property schema descriptions state the
value's meaning and format only; worked examples, background and multi-paragraph rules move to
the guide topic.

Rules for what must stay in the tool text, because a client that never reads the guide must still
not do damage:

- Anything that sends email, notifies people, locks a record or is irreversible (for example
  `meta.assignees`, `meta.followup`, `meta.locked` on `update_record`).
- Anything that fails silently: stale `pos` writes, ref cells written by id instead of token,
  rich text that must be HTML, unknown keys being a no-op.
- The projection rule on read tools.

Target, corrected after measuring (ISSUE - 670): the whole tools/list answer
(annotations and output schemas included) was 248,723 chars on the full profile.
It splits into 72k top-level descriptions, 65k property descriptions, 60k schema
structure and 28k annotations, output schemas and titles. What remains of the
prose is mostly the silent-failure rules this section says must stay, pinned by
270 assertions, so a 25k-token target is not reachable without losing
effectiveness. The first cut instead gates the eight workflow-agent run tools to
connections that carry the run capability (-11%); further trims wait for the
Dev1 task set to show they cost nothing. A test pins the
measured total so it cannot creep back unnoticed (a size budget, not wording).

Annotations do not change unless the review in section 4 finds one wrong.

### 2. Guidance that arrives when it is needed

- Full-profile instructions point at `anydb_get_authoring_guide` with topics instead of telling
  clients to read the whole guide resource and schema. The resources stay available.
- `/reviewed` instructions gain the record-read projection rule and the guide-topic pointer.
- Write results can be compacted: one `create_record` on the backlog Issue type returned about
  15 KB (whole record with `toUI.authorization` and `depends`). Offer `fields`/compact output on
  write tools so a caller can exclude what it does not need (Anthropic 5B).
- Validation errors name the rule broken and the topic to read (for example an unguarded
  aggregation names topic `formulas`; a bad cell shape names `cells`). A client that skipped the
  guide loses one turn, not correctness.
- Guide topics stay static, versioned files in this repo. Nothing is served from AnyDB data, so
  the guidance stays reviewable and clear of Anthropic 2F.

### 3. New guide topics

- `reading-and-analysis`: projection with `fields` plus `values: true`; choosing between
  `get_record`, `list_records`, `search_records`, `search_team_records`, `anydb_semantic_search`
  and reports; paging limits; using `anydb_run_script` for joins, filters, aggregation and
  pre-processing over many records and returning only the summary; `anydb_simulate_script` first.
  `anydb_run_script` is absent on `/reviewed`, so that profile's copy names reports and paged
  projected reads instead.
- `permissions` (extends `permissions-v1.md`): roles, how grants inherit (`inherit_down`,
  `override`), users versus groups, designing a multi-role structure, and verifying it with
  `anydb_check_permissions`. Lands with section 5.

### 4. Accuracy: keep tools current with the server

- Coverage matrix test: every route in anydb-server's `src/modules/integrations/ext/ext.controller.ts`
  (as listed in `EXT_API_OPENAPI.yaml`) maps to an MCP tool, or to a recorded reason it has
  none. A new route without a decision fails the test.
- Schema drift test: each tool's input parameters agree with the OpenAPI parameters of the route
  it calls (names, required, enums).
- Description consistency test: every parameter name a description mentions exists in that
  tool's schema.
- One-time review of each tool against the server implementation, one domain per PR (records,
  types, workflows, shares and forms, reports, docgen, webhooks, agents, communications,
  versions, comments, files, apps, permissions). Each finding that is a server defect becomes its
  own backlog issue.

The OpenAPI file lives in anydb-server; the test reads a vendored copy refreshed by a script, so
the MCP suite does not need a server checkout. The refresh is part of every server PR that changes
an ext route.

### 5. Permission authoring

Today the ext API exposes `GET /permissions`, `POST /permissions/check` and `GET /team-groups`
only. The UI server has `/api/roles` (list/create/delete), `/api/acl/set` and `/api/acl/unset`
(user or group, `roleids`, `inherit_down`, `override`, on team, workspace or record),
`/api/acl/whocanaccess`, `/api/acl/getresourcepermissions`, `/api/groups` (CRUD, `adduser`,
`removeuser`, `assignments`) and team members.

Add ext routes for these through `AclService`, `RoleService`, `GroupService` and `TeamService`
with the caller's identity, then one MCP tool per operation with explicit annotations. Each route
needs regression tests that an unauthorized caller cannot grant, revoke, read grants on, or change
membership of resources it does not administer.

Blocked by ISSUE - 663 (a non-member can be given a role on a team or workspace) and ISSUE - 661
(the built-in Write Only role grants admin areas). Exposing ACL writes to MCP before those are fixed
widens both defects to every MCP client.

These are new tools on both surfaces: ship them as one batch with annotation justifications for the
OpenAI rescan.

## Rollout

1. Section 4 tests first, so the trim in section 1 is checked against the server rather than
   against memory.
2. Sections 1 to 3 together, one PR per domain, released in one batch and rescanned once on
   `/reviewed`.
3. Section 5 after ISSUE - 663 and ISSUE - 661 are fixed, as one batch.

Before and after each batch, run a fixed task set against Dev1 through a client without deferral
and record tokens and outcome: build a three-role permission structure (after section 5), analyse
a type with a few thousand records, author a type with formulas, author and run a workflow, fill a
shared form. A batch that saves tokens but fails a task that passed before is not shipped.

## Verification limits

The tests above check the MCP service against the server's declared contract and the MCP
service's own text. They do not prove a client chooses the right tool; only the Dev1 task set
does, and only for those tasks. Directory acceptance is a separate outcome: passing tests do not
predict a review.

## Work items

Backlog (Engineering ADB on Dev1), opened 2026-10-15, all Medium:

| Issue | Covers |
| --- | --- |
| ISSUE - 672 | Section 4: coverage matrix, schema drift and description tests, per-domain review. First. |
| ISSUE - 670 | Section 1: contract-length descriptions and schemas, size-budget test. |
| ISSUE - 671 | Sections 2 and 3: instructions on both profiles, reading-and-analysis topic, errors that name a topic, compact write results. |
| ISSUE - 673 | Section 5: permission authoring routes and tools. Blocked by ISSUE - 663 and ISSUE - 661. |
