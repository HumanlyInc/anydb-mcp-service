# AnyDB Solution Building Contract v1

Read this guide before the first type- or solution-authoring call in a task. An authoring task may produce one standalone type or a coordinated solution of multiple types, relationships, formulas, and workflows. Match the implementation scope to the request; never invent related types or workflows merely to turn a standalone type into a solution. Discover reusable types first, create dependencies in order when they exist, and create workflows last only when automation is required.

## Authoring Scope

- **Standalone type**: one independently useful type with its own fields, layout, formulas, badges, and optional references to existing types. The type itself is the complete deliverable.
- **Solution**: multiple coordinated types with ownership or reference relationships and optional workflows.

For a standalone type, search the workspace first and inspect candidate definitions for the required content and behavior. Reuse a compatible workspace type when one exists. Only when none is compatible, search built-in types and inspect their definitions; import a compatible built-in before using it. Create a new type only when neither source contains a compatible definition. Names, descriptions, and search scores are discovery hints, not compatibility evidence. Decide from the complete definition: field purpose, value type and format, requiredness and options, references and ownership, formulas and lookups, and any keys or outputs consumed by workflows. Do not require child types, relationships, or workflows when the requested type does not need them. A standalone type can later participate in a larger solution without being redesigned.

## Type Roles

- **Master**: the primary operational record, such as an order or asset.
- **Reference**: an independent shared record selected by other records, such as a customer or product.
- **Line item**: a repeatable child owned by a master record.
- **Journal**: an append-oriented child recording events or state changes.
- **Container**: a grouping record that primarily displays and aggregates children.

Use a separate type for every repeatable object with its own lifecycle. Do not model an arbitrary number of line items, events, or documents as repeated fields on a parent.

## Cells

A semantic field has a stable `key`, `valueType`, `format`, and non-overlapping grid `layout`. Keys are the public identifiers used by formulas and workflows; positions are presentation details except where the formula runtime explicitly requires a position.

Supported value types are `string`, `number`, `boolean`, `array`, `void`, `file`, `object`, `ref`, and `user`.

Supported authoring formats are `general`, `number`, `currency`, `percentage`, `date`, `datetime`, `time`, `ref`, `signature`, `file`, `checkbox`, `user`, `users`, `select`, `multi-select`, `rich-text`, `attachments`, `comments`, `ai`, `barcode`, `qrcode`, `chart`, `report`, `lookup`, `button`, `timeline`, `dynamic`, and `heading`.

Important format rules:

- `ref` selects an independent record and requires an exact `targetType` name.
- `lookup` mirrors a field through a `ref`; provide `lookup.fromField`, `lookup.targetField`, and an optional `lookup.mode` of `snapshot` or `live`. The default is `snapshot`.
- `attachments` embeds child records and requires the child `targetType`. Give it enough space, normally full width and 6-7 rows high.
- `select` and `multi-select` require stable `options`.
- Computed fields use `formula` and should normally be `locked`.
- Use `description`, `required`, and format-specific semantic properties instead of raw internal `props`.
- Layout positions match `^[A-Z]+[1-9][0-9]*$`; `colspan` and `rowspan` are positive integers. Occupied grid areas must not overlap.

### Canonical Type Layout

When defining a type, the MCP client must design the complete cell layout and send it in each field's `layout`. Use this visual style unless the user explicitly requests another arrangement:

- Treat the form as a six-column grid, A-F, with unlimited rows.
- Preserve the requested field order from top to bottom. Put identity and status fields first, keep related inline fields together, place computed summaries near their source data, and put child attachment areas after the parent's own fields.
- Build an occupancy map while assigning positions. Reserve every coordinate covered by each field's `colspan` and `rowspan`; never overlap cells or extend a span beyond column F.
- Place inline fields (`general`, `number`, `currency`, `percentage`, `date`, `datetime`, `time`, `select`, `multi-select`, `checkbox`, `user`, `users`, `ref`, and `lookup`) left to right. Move to column A of the next row when the field does not fit or begins a new logical group.
- Row-end gaps are acceptable. Do not widen fields or add unrelated fields merely to fill a row.
- Start block fields (`heading`, `rich-text`, `attachments`, notes, and summaries) on a new row. Do not place a block field in unused columns beside inline fields.
- Make headings full width at column A with `colspan: 6` and `rowspan: 1`.
- Give rich-text fields at least `colspan: 3` and `rowspan: 3`, normally starting at column A.
- Give attachments at least `colspan: 3` and `rowspan: 4`. Place two adjacent attachment fields side by side (`A` with `colspan: 3`, then `D` with `colspan: 3`); otherwise use a full-width attachment at A with `colspan: 6`.
- When a file field is the record's hero image, place it at A1 with `colspan: 1` and `rowspan: 4`; inline fields may flow beside it. Start the next block immediately after the occupied hero rows, without blank spacer rows.
- Do not insert empty rows solely for visual spacing.

Reference layout:

```text
A B C D E F
P X X X X .
P X X X . .
P X X X . .
P X X . . .
H H H H H H
B B B B B B
B B B B B B
B B B B B B
B B B B B B
```

`P` is an optional hero image, `X` is an inline field, `H` is a heading, `B` is a block field, and `.` is unused space. Before calling `anydb_create_type`, verify that every field is present exactly once, positions are unique, spans remain inside A-F, and occupied areas do not overlap.

Badges should expose a small number of fields useful when scanning records.

## Relationships

Keep these concerns separate:

1. Ownership attaches a child record to one or more parents.
2. An `attachments` cell controls embedded child display.
3. `childPolicy.allowOnly` restricts allowed child types.
4. `childPolicy.autoCreate` creates required children.
5. A `ref` points to an independent record; `lookup` fields read through it.

Use a reference for shared master data. Use a child for a detail that belongs to the parent's lifecycle. A child may have multiple parents when the same detail legitimately participates in more than one aggregate.

## Views

Use `anydb_create_view` to create a saved filtered listing after its target types exist. A View is a separate object, not part of a type definition.

- `scope: "workspace"` attaches the View to the database root. It displays matching root-level records from the stable type names listed in `targets`.
- `scope: "children"` requires `parentRecordId`. It displays matching direct children of that record from the stable type names listed in `targets`.
- A View can target one or more types. Each target has its own optional `filters` array.
- Use `source: "cell"` for a type field key, `source: "meta"` for record metadata, and `source: "badge"` for a badge key.
- Supported operators are `eq`, `neq`, `gt`, `lt`, `gte`, `lte`, `like`, `contains`, `startswith`, `endswith`, `includes`, and `notincludes`.
- Use stable type names and semantic filter fields. Do not provide template IDs, the predefined View template ID, or encoded `LISTING_VIEWS` data; the server resolves and stores those internals.
- Use `validateOnly: true` to validate scope, parent access, target names, and filters without creating the View.
- Use `anydb_update_view` with the returned `viewId` to rename a View or change its criteria. `changes.targets` replaces the complete existing target/filter set; include every target and filter that should remain. Omit `changes.targets` for a name-only update.
- View placement is immutable during update. To change between workspace and children scope, create a new View in the desired location.

Example child View:

```json
{
  "teamid": "<team id>",
  "adbid": "<database id>",
  "clientRequestId": "location-low-stock-view-v1",
  "view": {
    "name": "Inventory Attention",
    "scope": "children",
    "parentRecordId": "<location record id>",
    "targets": [
      {
        "typeName": "Stock",
        "filters": [
          {
            "source": "cell",
            "field": "Quantity",
            "operator": "lt",
            "value": 10,
            "fieldType": "number"
          },
          {
            "source": "cell",
            "field": "Status",
            "operator": "eq",
            "value": "BROKEN"
          }
        ]
      }
    ]
  }
}
```

## Sharing

Use `anydb_create_share` to share an accessible record or publish a form backed by an existing workspace type. Sharing is a separate artifact created after its target exists.

- A record target uses `target: { "kind": "record", "recordId": "..." }`. It can set `role` to `viewer` or `editor` and can opt into `withAttachments`.
- A form target uses `target: { "kind": "form", "templateName": "..." }`. Use the stable workspace template name, not a template ID. Submissions attach to `parentRecordId` when supplied and otherwise attach to the database root. Form shares do not accept `role` or `withAttachments`.
- A public share uses `privacy: "public"`, must omit `recipients`, and returns `publicUrl` after persistence. Present that URL as the usable result; do not construct it from the share token.
- A private share uses `privacy: "private"` and requires at least one recipient email or team group name. Email recipients are plain email addresses; user IDs are not accepted.
- Before sharing with a group, call `anydb_list_team_groups` and use an exact returned `name`. Do not guess group names or pass `groupId` as an authoring input.
- Use `validateOnly: true` to check target access, template resolution, recipient syntax, and group availability without creating the share or sending invitations.
- If a workflow uses `trigger_on_form_submit`, create the form share first and use the share's stable `name` as the trigger `formName`.

Example public form share:

```json
{
  "teamid": "<team id>",
  "adbid": "<database id>",
  "clientRequestId": "public-safety-report-form-v1",
  "share": {
    "name": "Safety Report Intake",
    "privacy": "public",
    "target": {
      "kind": "form",
      "templateName": "Safety Report"
    }
  }
}
```

Example private record share:

```json
{
  "teamid": "<team id>",
  "adbid": "<database id>",
  "clientRequestId": "incident-review-share-v1",
  "share": {
    "privacy": "private",
    "target": {
      "kind": "record",
      "recordId": "<record id>"
    },
    "recipients": {
      "emails": ["reviewer@example.com"],
      "groupNames": ["Operations"]
    },
    "role": "viewer",
    "withAttachments": true
  }
}
```

## Formulas

Prefer stable key references:

```text
{{Field Key}}
SEQNUM("Sequence", 1000)
DYNREF(<ref position>, {{Target Field}}, "GO")
DYNREF(<ref position>, {{Target Field}})
C@CURRREC!N@Child Type!{{Amount}}
A@CURRREC!N@Parent Type!{{Field}}[0]
SUM(...), COUNT(...), MAX(...)
MAXBY(...), FILTER(...), GROUPBYSUM(...)
M@CREATED, M@CREATEDBY
```

Only use a positional reference where required, notably the first argument to `DYNREF`. Choose lookup mode from the use case: use `snapshot` and the `"GO"` form when the value should be copied as the ref is selected and later source changes should not ripple through referencing records; use `live` and omit `"GO"` when target-field changes must update referencing records. Prefer `snapshot` when ongoing synchronization is not required. Create referenced types and finalize field keys before formulas that depend on them. Use journal children with packed object values plus `MAXBY` or `FILTER` when the parent needs current state derived from history.

## Workflows

A workflow created through MCP has exactly one trigger followed by an ordered chain of one or more actions. Prefer one trigger with one `action_script` when that is the simplest design and the current team license permits it; use registered non-script actions when scripting is unavailable or a native action is clearer. Available triggers are `trigger_on_form_submit`, `trigger_on_record_create`, `trigger_on_record_update`, `trigger_on_schedule`, and `trigger_manual`.

Create workflows only for required automation. A workflow is appropriate when an event or change on one record must automatically create, update, notify about, or otherwise cause a side effect on another record or external system. Do not create workflows merely to make a solution appear complete. When the requirement is only to display or calculate derived data, prefer formulas, lookups, references, and aggregations instead of mutation automation.

Keep the workflow set small and purposeful. Reuse an existing workflow or combine behavior under one compatible trigger and action chain when doing so remains clear and correct. Five or more workflows is a design-review signal: check for duplicates, overlapping triggers, and behavior that can be consolidated or expressed declaratively. It is not a hard limit; retain additional workflows when distinct triggers, permissions, failure boundaries, or business behaviors genuinely require them.

- Call `anydb_list_workflow_triggers` before choosing a trigger. It returns each trigger's description and exact input/output schemas.
- Call `anydb_list_workflow_actions` before writing actions. It returns every registered action, its exact input/output schema, trigger compatibility, structural support by `anydb_create_workflow`, and `availableForCurrentTeam`. Do not select an unavailable action; `unavailableReason` explains the current policy restriction.
- Form submit requires `config.formName`. The server resolves the stable form name to its internal share ID.
- Record create/update can use `config.templateName`, `config.parentRecordId`, and `config.filter`. Record update alone can use `config.fieldNames` to run only when selected fields change.
- To run only when `Transfer Record.Status` changes, use `trigger_on_record_update` with `config: { "templateName": "Transfer Record", "fieldNames": ["Status"] }`. Use these semantic names exactly; native runtime properties such as `typename`, `typeid`, and `cellids` are internal and must not be sent to `anydb_create_workflow`.
- Schedule accepts interval or calendar/time settings. `specificTime` cannot be combined with interval, weekday/month-day, or time-window settings.
- Manual accepts an empty config object.
- Build workflows only after referenced type names and field keys are final.
- Use stable `formName` and `templateName` values; do not provide runtime artifact IDs.
- Send actions in execution order. Each action has a unique client-local `key`, a registered `type`, and `config` matching that action's catalog input schema. The server creates and connects the persisted artifact IDs.
- Map outputs into later action inputs with `{{trigger.outputName}}` or `{{priorActionKey.outputName}}`. A binding may only reference the trigger or an earlier action in the chain. Output names must come from the corresponding catalog output schema.
- Form submit and record create/update triggers automatically pass their `adoid` output to an `action_script` as `recordId` when that input is omitted. Explicit `{{trigger.adoid}}` mappings are also supported.
- Schedule and manual triggers do not receive an automatic record input.
- For a triggering-record script, require `input.recordId`, load it with `await anydb.getRecordById(input.recordId)`, and fail before side effects if it is missing or inaccessible. Use criteria/refIds only for intentional scheduled, manual, or batch workflows.
- Use only APIs and signatures returned in the `action_script` catalog guidance. Do not invent global helpers, capability probes, or compatibility wrappers.
- `await anydb.createRecord(...)` returns the created runtime record. Its ID is `created.id` (the new adoid), not `created.adoid`. Omit `parentid` only when root creation is intentional; if attaching a child, resolve and validate the parent ID before calling `createRecord`.
- `script.runtime.ts` is authoritative for supported script commands. Its catalog guidance exposes `globals`, `anydbApis`, `outputApis`, and record helpers. Use `log(...)` or `console.log(...)` for concise diagnostics around inputs, branch decisions, record IDs, and mutation results; never log credentials, tokens, or sensitive record content.
- After a run, call `anydb_get_workflow` and inspect the script action at `executionHistory[].artifactExecutions[].output.logLines`. An empty execution history means the workflow did not run; a failed artifact also exposes its `error` alongside any captured output.
- Await all data and mutation calls. Begin every explicit loop with `await anydb.yield()`.
- Make update-triggered side effects idempotent or persist a state transition that exits the triggering condition.
- End scripts with explicit `output.set(...)` values and a concise `output.summary(...)`.
- Scripts and some other actions may be license-gated. Create disabled by default and enable only when explicitly requested.
- Use `anydb_update_workflow` to change an existing workflow's name, description, or enabled state. Workflow updates continue to enforce the standard workflow authorization policy.
- After creating or changing a workflow, keep it disabled until practical verification is ready. Trigger one representative run, then call `anydb_get_workflow` (or `anydb_get_workflow_execution_history`) and inspect the workflow-level status plus each artifact's input, output, logs, and error before considering the automation complete.

## Construction Procedure

1. Read this guide and `anydb://schemas/solution-authoring/v1`.
2. Classify the request as a standalone type or multi-type solution, and do not broaden its scope without user direction.
3. Privately model the requested types, roles, fields, layouts, and formulas. Include relationships, Views, shares, and workflows only when required.
4. For each proposed type, call `anydb_discover_types` with `source: "workspace"`. Inspect promising candidates with `anydb_get_type_definition`. Compare semantic content and behavior, not names: field purpose, value type and format, requiredness and options, references and ownership, formulas and lookups, and workflow-facing keys or outputs. If a workspace definition can fulfill the requested use case without changing its meaning, reuse it and do not import or create a duplicate.
5. Only when no content-compatible workspace type exists, call `anydb_discover_types` with `source: "builtin"` and inspect promising built-in definitions by the same criteria. If one fulfills the requested use case, import it with `anydb_create_type` in import mode before referencing or using it.
6. Create a new type with `anydb_create_type` in define mode only when neither the workspace nor built-in catalog contains a content-compatible type. A matching name, description, icon, or search score is never sufficient evidence, and a different name does not make equivalent content incompatible.
7. Fix stable type names and field keys.
8. For a standalone type, reuse, import, or create it now and stop after validating it unless more work was requested.
9. For a multi-type solution, resolve each type through the same workspace-first sequence, then create independent reference types first, child types next, and master/container types after their dependencies. Create requested Views and shares after all target types and parent records exist. Create a required form share before a form-submit workflow that references its name.
10. Update only where relationships could not be resolved during creation.
11. Re-check every formula and target. Identify required cross-record or external side effects, discover existing workflows, and prefer formulas/lookups for derived values that do not require mutation. Call the workflow trigger/action catalog tools and create workflows last only when automation is required. If the design reaches five workflows, review it for duplication or safe consolidation before proceeding; exceed five only when distinct behavior justifies it.

Use a stable idempotency key for every mutation. On partial failure, inspect current state and resume; do not blindly recreate successful artifacts.

Use stable template names in all MCP inputs. Templates are versioned, and a stored template ID can refer to an obsolete or deleted revision. The AnyDB backend resolves each name to the latest available template ID; IDs returned in discovery or mutation results are informational and must not be reused as authoring inputs.

## Compact Example

A standalone `Meeting Note` type can contain `Subject`, `Meeting Date`, `Attendees`, `Summary`, `Decisions`, and `Follow-ups`. It needs no child type or workflow unless the requested process requires one. Discover existing meeting-note types, then reuse, import, or create this single type and validate its layout.

For a multi-type example, an order solution uses three types:

- `Product`: reference type with `SKU`, `Name`, and `Unit Price`.
- `Order Item`: line-item child with `Product` (`ref` targeting `Product`), `SKU` (`lookup` from `Product`), `Quantity`, and locked `Total = {{Unit Price}} * {{Quantity}}`.
- `Order`: master type with `Order Number = SEQNUM("Order", 1000)`, an `attachments` field targeting `Order Item`, and locked `Total = SUM(C@CURRREC!N@Order Item!{{Total}})`.

Create `Product`, then `Order Item`, then `Order`. Finally create a disabled record-update workflow scoped to `Order Item` if status automation is required.
