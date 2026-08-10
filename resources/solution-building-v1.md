# AnyDB Solution Building Contract v1

Read this guide before the first type- or solution-authoring call in a task. An authoring task may produce one standalone type or a coordinated solution of multiple types, relationships, formulas, and workflows. Match the implementation scope to the request; never invent related types or workflows merely to turn a standalone type into a solution. Discover reusable types first, create dependencies in order when they exist, and create workflows last only when automation is required.

## Authoring Scope

- **Standalone type**: one independently useful type with its own fields, layout, formulas, badges, and optional references to existing types. The type itself is the complete deliverable.
- **Solution**: multiple coordinated types with ownership or reference relationships and optional workflows.

For a standalone type, perform discovery for that type, inspect compatible candidates, then reuse, import, or define exactly that type. Do not require child types, relationships, or workflows when the requested type does not need them. A standalone type can later participate in a larger solution without being redesigned.

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
- `lookup` mirrors a field through a `ref`; provide `lookup.fromField` and `lookup.targetField`.
- `attachments` embeds child records and requires the child `targetType`. Give it enough space, normally full width and 6-7 rows high.
- `select` and `multi-select` require stable `options`.
- Computed fields use `formula` and should normally be `locked`.
- Use `description`, `required`, and format-specific semantic properties instead of raw internal `props`.
- Layout positions match `^[A-Z]+[1-9][0-9]*$`; `colspan` and `rowspan` are positive integers. Occupied grid areas must not overlap.

Use heading cells to organize dense forms. Put identity and status fields first, related fields together, computed summaries near their source data, and child attachment areas after the parent's own fields. Badges should expose a small number of fields useful when scanning records.

## Relationships

Keep these concerns separate:

1. Ownership attaches a child record to one or more parents.
2. An `attachments` cell controls embedded child display.
3. `childPolicy.allowOnly` restricts allowed child types.
4. `childPolicy.autoCreate` creates required children.
5. A `ref` points to an independent record; `lookup` fields read through it.

Use a reference for shared master data. Use a child for a detail that belongs to the parent's lifecycle. A child may have multiple parents when the same detail legitimately participates in more than one aggregate.

## Formulas

Prefer stable key references:

```text
{{Field Key}}
SEQNUM("Sequence", 1000)
DYNREF(<ref position>, {{Target Field}}, "GO")
C@CURRREC!N@Child Type!{{Amount}}
A@CURRREC!N@Parent Type!{{Field}}[0]
SUM(...), COUNT(...), MAX(...)
MAXBY(...), FILTER(...), GROUPBYSUM(...)
M@CREATED, M@CREATEDBY
```

Only use a positional reference where required, notably the first argument to `DYNREF`. Create referenced types and finalize field keys before formulas that depend on them. Use journal children with packed object values plus `MAXBY` or `FILTER` when the parent needs current state derived from history.

## Workflows

A workflow has exactly one trigger and a directed graph of actions. Common triggers are record create, update, delete, form submit, schedule, and manual. Actions include create/update/find/move/copy record, email, notification, export, webhook, AI, and script.

- Build workflows only after referenced type names and field keys are final.
- Give every trigger/action a unique client alias and connect aliases in an acyclic graph.
- Every action must be reachable from the trigger; reject disconnected nodes and cycles.
- Scope triggers by exact type and field keys, and validate filters against those fields.
- Script and webhook actions may be license-gated.
- Create disabled by default. Enable only when explicitly requested and the complete graph is ready.

## Construction Procedure

1. Read this guide and `anydb://schemas/solution-authoring/v1`.
2. Classify the request as a standalone type or multi-type solution, and do not broaden its scope without user direction.
3. Privately model the requested types, roles, fields, layouts, and formulas. Include relationships and workflows only when required.
4. Run `anydb_discover_types` for each proposed type across workspace and built-in sources.
5. Inspect promising definitions. Reuse a compatible workspace type or import a compatible built-in type before defining a duplicate.
6. Fix stable type names and field keys.
7. For a standalone type, create or import it now and stop after validating it unless more work was requested.
8. For a multi-type solution, create independent reference types first, child types next, and master/container types after their dependencies.
9. Update only where relationships could not be resolved during creation.
10. Re-check every formula and target. Discover existing workflows and create workflows last only when automation is part of the request.

Use a stable idempotency key for every mutation. On partial failure, inspect current state and resume; do not blindly recreate successful artifacts.

Use stable template names in all MCP inputs. Templates are versioned, and a stored template ID can refer to an obsolete or deleted revision. The AnyDB backend resolves each name to the latest available template ID; IDs returned in discovery or mutation results are informational and must not be reused as authoring inputs.

## Compact Example

A standalone `Meeting Note` type can contain `Subject`, `Meeting Date`, `Attendees`, `Summary`, `Decisions`, and `Follow-ups`. It needs no child type or workflow unless the requested process requires one. Discover existing meeting-note types, then reuse, import, or create this single type and validate its layout.

For a multi-type example, an order solution uses three types:

- `Product`: reference type with `SKU`, `Name`, and `Unit Price`.
- `Order Item`: line-item child with `Product` (`ref` targeting `Product`), `SKU` (`lookup` from `Product`), `Quantity`, and locked `Total = {{Unit Price}} * {{Quantity}}`.
- `Order`: master type with `Order Number = SEQNUM("Order", 1000)`, an `attachments` field targeting `Order Item`, and locked `Total = SUM(C@CURRREC!N@Order Item!{{Total}})`.

Create `Product`, then `Order Item`, then `Order`. Finally create a disabled record-update workflow scoped to `Order Item` if status automation is required.
