# AnyDB Solution Building Contract v1

Read this guide before the first type- or solution-authoring call in a task. An authoring task may produce one standalone type or a coordinated solution of multiple types, relationships, formulas, and workflows. Match the implementation scope to the request; never invent related types or workflows merely to turn a standalone type into a solution. Discover reusable types first, create dependencies in order when they exist, and create workflows last only when automation is required.

## Authoring Scope

- **Standalone type**: one independently useful type with its own fields, layout, formulas, badges, and optional references to existing types. The type itself is the complete deliverable.
- **Solution**: multiple coordinated types with ownership or reference relationships and optional workflows.

For a standalone type, search the workspace first and inspect candidate definitions for the required content and behavior. Treat `anydb_discover_types` as candidate retrieval, not compatibility confirmation: pass one concise concept or a small comma-separated set of related names and synonyms, then call `anydb_get_type_definition` for every plausible candidate before deciding. Reuse a compatible workspace type when one exists. Only when none is compatible, search built-in types and inspect their complete definitions; import a compatible built-in before using it. Create a new type only when neither source contains a compatible definition. Names, descriptions, categories, and search ranking are discovery hints, not compatibility evidence. Decide from the complete definition: field purpose, value type and format, requiredness and options, references and ownership, formulas and lookups, and any keys or outputs consumed by workflows. Do not require child types, relationships, or workflows when the requested type does not need them. A standalone type can later participate in a larger solution without being redesigned.

## Example User Requests

Users can describe the outcome in ordinary language. These prompts illustrate supported tasks and useful scope or verification constraints; they are not special commands and do not require tool names.

### Build Types and Solutions

- "Create an inventory management solution with Inventory, Location, Stock, Stock Level History, Transfer Record, and Stock Adjustment Record types. Reuse compatible existing types before creating new ones."
- "Set up a solution for tracking IT assets and their assignments to employees. Check the workspace and built-in catalog first."
- "Create one standalone Meeting Note type with subject, date, attendees, summary, decisions, and follow-ups. Do not add unrelated types or workflows."

### Discover and Reuse Types

- "Before creating anything, check whether compatible Employee, Asset, and Location types already exist. Inspect their fields before deciding."
- "Import the built-in Employee type, then add a Badge Number field."
- "Is there already a compatible type in this workspace for vendor invoices, or do I need a new one?"

### Work with Records

- "Add an Asset record with tag LAP-1001, type Laptop, model MacBook Pro 16, and status In Stock."
- "Show me all Asset records where Status is Repair."
- "Assign asset LAP-1001 to Alice Johnson starting today."

### Automate Work

- "When a Transfer Record's Status changes to Completed, add a Stock Level entry for the destination. Keep the workflow disabled until it has been tested."
- "When a new Assignment Record is created for an asset, update that Asset's status."
- "Run one representative workflow case, then show me its execution status, output, and errors."

### Create Views and Shares

- "Create a View showing all Assets that need repair."
- "Create a filtered View of active assignments for this specific asset."
- "Create a public form so people outside the team can submit asset requests."
- "Share this Employee record privately with the Operations group as view-only."

For non-trivial work, users can request end-to-end verification explicitly: "Create this solution, add representative test records, run the workflow once, and inspect its execution history before calling it complete." Computed values, workflow executions, indexing, and migrations can take time, so verification may require bounded follow-up checks.

## Completion and Eventual Consistency

A successful mutation response confirms the primary request was accepted and, where reported, persisted. It does not guarantee that every derived or background effect is already visible. Formula dependency propagation, cross-record lookups, workflow execution, search indexing, notifications, and queued type migrations may complete later depending on system load.

- Formula evaluation can temporarily expose a pending value (`"..."`) while dependencies are resolved and computed values are saved. Read the affected record again until the expected value appears or a stable error (`"err"`) is returned. Ordinary stored values and many local formulas may already be complete in the mutation response; do not delay when the required state is present.
- A triggered workflow runs asynchronously. Poll `anydb_get_workflow` or `anydb_get_workflow_execution_history` until the expected execution appears and its workflow/artifact statuses are terminal (`success` or `failure`). An empty execution history means no retained execution is visible yet; it is not proof of success or failure.
- For `anydb_update_type`, `migration.status: "queued"` means the new revision is persisted but record migration is not complete. `completed` means the synchronous migration finished, and `enqueue_failed` requires intervention. Do not depend on migrated record shape until representative affected records confirm the new revision and computed values.
- Discovery and indexed search can lag immediately after creation or update. Prefer direct reads by returned ID or stable name for immediate verification, then retry discovery when indexing is required.

Use bounded polling with short increasing intervals and an explicit deadline. Stop as soon as the expected terminal state is visible; on timeout, report the operation as accepted but not yet verified and include the request ID, artifact ID, workflow ID, or migration job ID returned by the mutation. Never submit a duplicate mutation merely because an asynchronous side effect is still pending. Retry the same mutation only with its original stable `clientRequestId`.

## Workspaces

Use `anydb_create_workspace` only when the user explicitly asks for a new workspace. It creates an empty workspace in an existing team and requires the authenticated user to have workspace-creation permission for that team. Provide a stable `clientRequestId`; an identical retry returns the original result, while reusing it with a different team or name is rejected. Use the returned `adbid` in all subsequent workspace-scoped tools. The tool does not import samples, create business types, or populate records.

## Type Roles

- **Master**: the primary operational record, such as an order or asset.
- **Reference**: an independent shared record selected by other records, such as a customer or product.
- **Line item**: a repeatable child owned by a master record.
- **Journal**: an append-oriented child recording events or state changes.
- **Container**: a grouping record that primarily displays and aggregates children.

Use a separate type for every repeatable object with its own lifecycle. Do not model an arbitrary number of line items, events, or documents as repeated fields on a parent.

## Record Titles

A type may carry a `titleFormula`. When it is set, records of that type are named by evaluating it against the record, and the name is recomputed whenever a field the formula reads changes. Use one whenever a record's identity is derived from its own fields — an order number, an asset tag, a subject plus a status — and omit it when people name records themselves. It is stored on the type rather than on a record, and `anydb_get_type_definition` returns the current value.

**A title formula is a formula expression, not a template string.** It uses the same language as the `formula` on a cell, described under Formulas below, so a meeting note titled from its subject is `CONCAT('Meeting: ', {{Subject}})`. Anything the formula runtime cannot evaluate is rejected **silently**: the record keeps whatever name it already had, no error is returned by any tool, and the stored `titleFormula` still reads back correctly from `anydb_get_type_definition`. A title that never appears is almost always a formula the runtime could not evaluate, not a type that failed to save.

These forms work:

| Form                                   | Example                                                           | Resulting name    |
| -------------------------------------- | ----------------------------------------------------------------- | ----------------- |
| A single field                         | `{{Name}}`                                                        | `Widget`          |
| `CONCAT` over fields and literals      | `CONCAT({{Name}}, ' (', {{Status}}, ')')`                         | `Widget (Active)` |
| `CONCAT` with a guard for empty fields | `CONCAT({{Name}}, ' (', IF({{Status}}, {{Status}}, 'None'), ')')` | `Widget (Active)` |
| A quoted literal                       | `'Static Title'`                                                  | `Static Title`    |
| A number, which is stringified         | `{{Count}}`                                                       | `7`               |
| Arithmetic                             | `{{Count}} * 2`                                                   | `14`              |

These produce no name at all:

| Broken form                                           | Example                             |
| ----------------------------------------------------- | ----------------------------------- |
| Template string — parses as a call, not interpolation | `{{Name}} ({{Status}})`             |
| `&` as string concatenation — not supported           | `{{Name}} & ' (' & {{Status}}`      |
| `+` as string concatenation — not supported           | `{{Name}} + ' (' + {{Status}}`      |
| A field key that does not exist on the type           | `CONCAT({{Name}}, ' - ', {{Nope}})` |
| An unknown function                                   | `NOPE({{Name}})`                    |
| A syntax error such as unbalanced parentheses         | `CONCAT({{Name}}, ' ('`             |

- Join text with `CONCAT`. It is the only supported way to combine values into a title; neither `+` nor `&` concatenates strings, and neither reports an error.
- Reference only field keys that exist on the type, using their exact casing. One unknown key discards the whole title, so re-check the formula whenever a field it reads is renamed or removed.
- Guard fields that may be empty with `IF`, as above, so a partly filled record still gets a usable title.
- Verify a new or changed formula by creating one record and reading its `meta.name` back. Because failure is silent, that read is the only confirmation that the formula evaluates.
- `anydb_create_type` accepts it in `type.titleFormula`, and `anydb_update_type` changes it through `changes.titleFormula`. Changing it on an existing type is a normal update — do not try to recreate the type, which is rejected as a duplicate name. Sending an empty string clears it.
- `create_record` still requires a `name`, but a valid formula replaces it as soon as the fields it reads hold values, including in the same `create_record` call that supplies them. Pass a placeholder rather than trying to precompute the title.

## Cells

A semantic field has a stable `key`, `valueType`, `format`, and non-overlapping grid `layout`. Keys are the public identifiers used by formulas and workflows; positions are presentation details except where the formula runtime explicitly requires a position.

Supported value types are `string`, `number`, `boolean`, `array`, `void`, `file`, `object`, `ref`, and `user`.

Supported authoring formats are `general`, `number`, `currency`, `percentage`, `date`, `datetime`, `time`, `ref`, `signature`, `file`, `checkbox`, `user`, `users`, `select`, `multi-select`, `rich-text`, `attachments`, `comments`, `ai`, `barcode`, `qrcode`, `chart`, `report`, `lookup`, `button`, `timeline`, `dynamic`, and `heading`.

Important format rules:

- Field keys referenced by formulas must use only letters, numbers, and spaces. Avoid special characters such as `%` in any key used inside `{{Field Key}}`; use a key such as `Discount Percentage` instead of `Discount %`.
- A `heading` field requires `headingLabel`. The `key` remains the stable field identifier, while `headingLabel` is the displayed text stored in the heading cell's `HEADING_LABEL` prop rather than its `value`. Do not put heading text in a default value or raw props. Example:

  ```json
  {
    "key": "Financial Details Heading",
    "headingLabel": "Financial details",
    "valueType": "string",
    "format": "heading",
    "layout": { "position": "A3", "colspan": 6, "rowspan": 1 }
  }
  ```

- A `percentage` field stores a fraction from `0` to `1`, not a human percentage from `0` to `100`. Store 25% as `0.25`, not `25`; convert user-entered percentage points before writing record values.
- `date`, `datetime`, and `time` record values use integer seconds since the Unix epoch. Do not write ISO date strings or JavaScript millisecond timestamps. In JavaScript, convert the current time with `Math.floor(Date.now() / 1000)`, not `Date.now()`.
- `ref` selects an independent record and requires an exact `targetType` name.
- `lookup` mirrors a field through a `ref`; provide `lookup.fromField`, `lookup.targetField`, and an optional `lookup.mode` of `snapshot` or `live`. The default is `snapshot`.
- `attachments` embeds child records and requires the child `targetType`. Give it enough space, normally full width and 6-7 rows high.
- `select` and `multi-select` require stable `options`.
- Computed fields use `formula` and should normally be `locked`.
- Prefer the named fields — `description`, `headingLabel`, `required`, `locked`, `options`, `targetType` — over `props`. Each owns a cell property, and setting the same property through `props` is rejected. Use `props` for presentation and behaviour the named fields do not cover; see Cell Properties below.
- Layout positions match `^[A-Z]+[1-9][0-9]*$`; `colspan` and `rowspan` are positive integers. Occupied grid areas must not overlap.

### Cell Properties and Conditional Formatting

Anything about a cell that the named fields do not cover — colour, emphasis,
alignment, visibility, display format, validation message, width — is a cell
property, set through the field's `props` map.

Each property takes `value`, `expr`, or both:

```json
{
  "key": "Status",
  "valueType": "string",
  "format": "select",
  "options": ["In Review", "Approved", "Rejected"],
  "layout": { "position": "D16", "colspan": 1, "rowspan": 1 },
  "props": {
    "BACKGROUND_COLOR": {
      "value": "#FFFFFF",
      "expr": "IF(CURRCELL=='In Review', '#FAF3DD', IF(CURRCELL=='Approved', '#EEF3ED', IF(CURRCELL=='Rejected', '#FAECEC', '#FFFFFF')))"
    }
  }
}
```

`expr` is an ordinary AnyDB formula evaluated per record — the same language as
`formula`, and the only way to make a cell's appearance or behaviour depend on
data. `value` is the static fallback shown until the expression first evaluates.
Supply `value` alone for a fixed setting, `expr` alone when it is always
computed, or both.

**`CURRCELL` inside a property expression is the cell's own value.** That is what
makes status colouring and per-cell validation possible without naming the field
from inside itself.

Commonly useful properties:

| Property | Purpose |
| --- | --- |
| `BACKGROUND_COLOR`, `TEXT_COLOR` | Colour, usually driven by `expr` |
| `TEXT_BOLD`, `TEXT_ITALIC`, `TEXT_ALIGN`, `TEXT_SIZE` | Emphasis and alignment |
| `CELL_HIDDEN`, `FORM_HIDDEN`, `KEY_HIDDEN` | Visibility; `FORM_HIDDEN` hides a field on the submission form while keeping it on the record |
| `CELL_DISPLAY_AS` | Render a field as another format, e.g. `select` versus `general`, chosen by `expr` |
| `CELL_ERROR` | Validation. Return `false` when valid, or the message to show when not |
| `DATE_DISPLAY`, `DATETIME_DISPLAY`, `CHECKBOX_DISPLAY`, `SELECT_DISPLAY` | Format-specific presentation |
| `X_SIZE` | Column width in pixels |
| `VALUE_OVERRIDE_ENABLED` | Let a person type over a computed cell. A cell with a `formula` is read-only by default; set this to `true` when the user must be able to override it |
| `AI_PROMPT` | The prompt for an `ai` field, e.g. `"Summarise the file attached in {{My Doc}}"` |
| `BUTTON_ACTION_TYPE`, `BUTTON_ACTION_VALUE` | Wire a `button` field to an automation by name |

An `ai` field needs `AI_PROMPT`, and a `button` field needs the two
`BUTTON_ACTION_*` properties; neither format works without them.

Three rules the server enforces:

- **Do not set a property a named field owns.** `CELL_DESCRIPTION`,
  `HEADING_LABEL`, `CELL_LOCKED`, `CELL_REQUIRED`, `SELECT_OPTIONS`, and
  `ATTACHMENTS_TEMPLATE_NAME` belong to `description`, `headingLabel`, `locked`,
  `required`, `options`, and `targetType`. Sending them in `props` is rejected
  and names the field to use instead.
- **Some properties are not available.** `SCRIPT_SOURCE`,
  `ATTACHMENTS_TEMPLATE_ID`, `ATTACHMENTS_PARENT`, `VALUE_OVERRIDE`,
  `CELL_HIDDEN_ACCESS`, and `CELL_LOCKED_ACCESS` stay editor-only — they are
  unreachable by any authorable format, address records by raw id where a name
  is the supported path, or bind per-role permissions.
- **An unknown property name is rejected**, so a typo fails validation rather
  than being silently ignored. Run `validateOnly` first when unsure.

On `anydb_update_type`, `props` replaces the whole map for that field. Omit it to
leave existing properties untouched; to change one property, read the field with
`anydb_get_type_definition` and resend the full map with your edit applied.

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
3. A `ref` points to an independent record; `lookup` fields read through it.

Do not author or modify `childPolicy`, `childPolicy.allowOnly`, or `childPolicy.autoCreate` through MCP, for either standalone types or multi-type solutions. Omit child policy from create and update requests. Model ownership with parent attachments and embedded child display with `attachments` fields.

Use a reference for shared master data. Use a child for a detail that belongs to the parent's lifecycle. A child may have multiple parents when the same detail legitimately participates in more than one aggregate.

Parent attachment is a property of the record, not of the type, and it is set through the record tools:

- `create_record` and `bulk_create_records` take `attach` as a single parent ID or an array of parent IDs. Omit it to create the record at the database root.
- `update_record` sets a record's parents through `meta.attach`, which also accepts a single ID or an array. This is the tool that attaches one record to several parents.
- `meta.attach` replaces the record's complete parent list rather than adding to it, exactly like `parentid` in the script runtime. Read the record's current parents with `get_record` and resend every parent that must stay attached alongside the new ones. Omit `meta.attach` to leave attachments unchanged, and never send an empty array.
- `move_record` is a single-parent reassignment: the supplied `parentid` becomes the record's only parent and every other parent is detached. Use it for a genuine move in a single-parent hierarchy, not to add a parent.
- `delete_record` with `removefromids` detaches a record from specific parents without deleting it. Passing the null ObjectId deletes the record instead.

## Views

Use `anydb_create_view` to create a saved filtered listing after its target types exist. A View is a separate object, not part of a type definition.

- Call `anydb_list_views` before creation. Compare scope, parent, target type names, and complete filters; reuse or update a compatible View instead of creating a duplicate.
- Use `anydb_get_view` for one View's complete decoded definition. Use `anydb_delete_view` only after confirming the exact `viewId`; deletion is permanent.
- `scope: "workspace"` attaches the View to the database root. It displays matching root-level records from the stable type names listed in `targets`.
- `scope: "children"` requires `parentRecordId`. It displays matching direct children of that record from the stable type names listed in `targets`.
- A View can target one or more types. Each target has its own optional `filters` array.
- Use `source: "cell"` for a type field key, `source: "meta"` for record metadata, and `source: "badge"` for a badge key.
- Supported operators are `eq`, `neq`, `gt`, `lt`, `gte`, `lte`, `like`, `contains`, `startswith`, `endswith`, `includes`, and `notincludes`.
- `value` is a native JSON string, number, or boolean. Send numeric and boolean values in their native JSON types; the server does not coerce strings using `fieldType`.
- `fieldType` is optional and may be `string`, `number`, `boolean`, `date`, or `array`. It is a stored comparison hint, not a conversion instruction. When supplied, match the target field's actual type. Dates remain string values with `fieldType: "date"`; array comparisons use the operator/value shape expected by the stored View engine.
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

- Call `anydb_list_shares` before creation and compare `kind`, target, privacy, and name. Reuse an existing compatible share, especially an existing public link, instead of creating duplicates.
- Use `anydb_get_share` with both `shareId` and `kind` to inspect one record/form facet. One internal share may contain both facets, so `kind` is always explicit.
- Use `anydb_revoke_share` for cleanup. It revokes only the selected record/form facet and preserves another facet on the same internal share.
- A record target uses `target: { "kind": "record", "recordId": "..." }`. It can set `role` to `viewer` or `editor` and can opt into `withAttachments`.
- A form target uses `target: { "kind": "form", "templateName": "..." }`. Use the stable workspace template name, not a template ID. For a form share, submissions attach to `parentRecordId` when supplied. When omitted, the server auto-creates a Folder record under the database root to hold submissions and returns that Folder's ID as `parentRecordId`; submissions do not attach directly to the root. Record shares have no submissions destination and do not create a Folder. Form shares do not accept `role` or `withAttachments`.
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

Most arithmetic, comparison, conditional, text, date, and aggregation formulas are spreadsheet-like. Relationship traversal uses AnyDB-specific references. Prefer stable field keys and do not invent reference syntax.

Guard aggregations and other relationship-dependent expressions that may receive undefined or temporarily unavailable values with `IFERROR`. This includes `SUM`, `COUNT`, `MAX`, `FILTER`, `SUMBY`, `MAXBY`, and similar operations. Choose a fallback compatible with the formula output: normally `0` for numeric results, `[]` for arrays, and `""` for text. Guard the complete expression, including nested operations; for example, use `IFERROR(MAXBY(FILTER(...), "total"), 0)` rather than guarding only `FILTER`.

Use the reference form that matches the relationship:

- Current-record field: `{{Field Key}}`, for example `{{Quantity}} * {{Unit Price}}`. Use the field's stable `key`, spelled exactly as defined, and make sure it resolves to exactly one field — a key that matches two fields is ambiguous and will not evaluate.
- Current-record metadata: `M@NAME`, `M@STATUS`, `M@CREATED`, `M@UPDATED`, `M@CREATEDBY`, or `M@UPDATEDBY`.
- All child values regardless of type: `C@CURRREC!{{Amount}}`.
- Child values for one stable type name: `C@CURRREC!N@Invoice!{{Amount}}`.
- Parent values: `A@CURRREC!{{Budget}}`.
- Independent record selected by a `ref` field: use a semantic `lookup` field; the server compiles it to `DYNREF(<ref cell position>, {{Target Field}})`.

### Referring to a Cell: Key or Position

A cell can be named two ways, and they are not interchangeable.

| Form | Example | Use it |
| --- | --- | --- |
| Field key | `{{Order Total}}` | Everywhere. This is the only form to use in ordinary formulas, in property expressions, and in workflow conditions |
| Grid position | `A1`, `B12` | **Only as the first argument to `DYNREF`.** Nowhere else |

Field keys are stable identifiers; grid positions are presentation details that
move whenever a layout changes, so a formula written against `B12` silently
starts reading a different field after a field is inserted above it. Write
`{{Unit Price}} * {{Quantity}}`, never `C4 * D4`.

The one exception is `DYNREF`, whose first argument must be the grid position of
the `ref` cell — a field key does not work there. Prefer a semantic `lookup`
field so the server writes the `DYNREF` and resolves the position for you; reach
for raw `DYNREF` only when a lookup field cannot express what you need.

Two functions must stand alone and must never be wrapped by another function,
`IFERROR` included: `DYNREF` and `SEQNUM`. Write `DYNREF(A2, {{Email}}, 'GO')`,
not `IFERROR(DYNREF(A2, {{Email}}, 'GO'), "")`. The `IFERROR` guidance above
applies to aggregations, not to these two.

Connected child and parent references return arrays. Pass child arrays to aggregations such as `SUM`, `COUNT`, `MAX`, `FILTER`, `SUMBY`, or `MAXBY`. When exactly one parent or child value is intended, select it explicitly with zero-based `[0]`, for example `A@CURRREC!{{Budget}}[0]`. Do not use `[0]` when all connected values must participate.

Reference examples:

```text
{{Field Key}}
SEQNUM("Sequence", 1000)
IFERROR(SUM(C@CURRREC!N@Invoice!{{Amount}}), 0)
IFERROR(COUNT(C@CURRREC!N@Invoice!{{Name}}), 0)
IFERROR(MAXBY(FILTER(C@CURRREC!N@Invoice!{{Packed Data}}, {type: "Open"}), "total"), 0)
A@CURRREC!{{Budget}}[0]
M@CREATED, M@CREATEDBY
```

For linked independent records, define `lookup.fromField`, `lookup.targetField`, and `lookup.mode` instead of manually writing `DYNREF`. `fromField` is the stable key of a `ref` field and `targetField` is the stable key on its target type; the server resolves the required positional reference. Use `snapshot` when the value should be copied when the reference is selected and later source changes should not ripple through referencing records. Use `live` when target-field changes must update referencing records. Prefer `snapshot` when ongoing synchronization is not required.

Live lookup propagation is supported: after the reference has resolved, changing the target field recomputes dependent live lookups. Snapshot lookups intentionally retain the value captured when the reference was selected. Do not assume a corrected template or lookup engine automatically backfills stale computed values stored on records created before the correction. Inspect affected records and explicitly reselect or update their reference field to trigger lookup evaluation; use a controlled migration or batch update when many records are affected.

Only use a positional reference when raw `DYNREF` is unavoidable: its first argument is the grid position of the `ref` cell, not the ref field key or target record name. Never substitute a template ID or record ID into a formula reference. Create referenced types and finalize stable type names, field keys, and layouts before formulas that depend on them. Use journal children with packed object values plus `MAXBY` or `FILTER` when the parent needs current state derived from history.

## Workflows

A workflow created through MCP has exactly one trigger followed by an ordered chain of one or more actions. Prefer one trigger with one `action_script` when that is the simplest design and the current team license permits it; use registered non-script actions when scripting is unavailable or a native action is clearer. Available triggers are `trigger_on_form_submit`, `trigger_on_record_create`, `trigger_on_record_update`, `trigger_on_schedule`, and `trigger_manual`.

Create workflows only for required automation. A workflow is appropriate when an event or change on one record must automatically create, update, notify about, or otherwise cause a side effect on another record or external system. Do not create workflows merely to make a solution appear complete. When the requirement is only to display or calculate derived data, prefer formulas, lookups, references, and aggregations instead of mutation automation.

Keep the workflow set small and purposeful. Reuse an existing workflow or combine behavior under one compatible trigger and action chain when doing so remains clear and correct. Five or more workflows is a design-review signal: check for duplicates, overlapping triggers, and behavior that can be consolidated or expressed declaratively. It is not a hard limit; retain additional workflows when distinct triggers, permissions, failure boundaries, or business behaviors genuinely require them.

- Call `anydb_list_workflow_triggers` before choosing a trigger. It returns each trigger's description and exact input/output schemas.
- Call `anydb_list_workflow_actions` before writing actions. It returns every registered action, its exact input/output schema, trigger compatibility, structural support by `anydb_create_workflow`, and `availableForCurrentTeam`. Do not select an unavailable action; `unavailableReason` explains the current policy restriction.
- Form submit requires `config.formName`. The server resolves the stable form name to its internal share ID.
- Record create/update can use `config.templateName`, `config.parentRecordId`, and `config.filter`. Record update alone can use `config.fieldNames` to run only when selected fields change.
- `trigger_on_record_update` with `config.fieldNames` can also run during record creation when a monitored field is initially set, because creation reports those fields as changed. Do not treat this trigger as proof that the record previously existed. Add an idempotent state/value guard in the action when behavior must apply only to a genuine later transition, or use `trigger_on_record_create` when creation is the intended event.
- To run only when `Transfer Record.Status` changes, use `trigger_on_record_update` with `config: { "templateName": "Transfer Record", "fieldNames": ["Status"] }`. Use these semantic names exactly; native runtime properties such as `typename`, `typeid`, and `cellids` are internal and must not be sent to `anydb_create_workflow`.
- Schedule accepts interval or calendar/time settings. `specificTime` cannot be combined with interval, weekday/month-day, or time-window settings.
- Manual accepts an empty config object.
- Build workflows only after referenced type names and field keys are final.
- Use stable `formName` and `templateName` values; do not provide runtime artifact IDs.
- Send actions in execution order. Each action has a unique client-local `key`, a registered `type`, and `config` matching that action's catalog input schema. The server creates and connects the persisted artifact IDs.
- Map outputs into later action inputs with `{{trigger.outputName}}` or `{{priorActionKey.outputName}}`. A binding may only reference the trigger or an earlier action in the chain. Output names must come from the corresponding catalog output schema.
- Form submit and record create/update triggers automatically pass their `adoid` output to an `action_script` as `recordId` when that input is omitted. Explicit `{{trigger.adoid}}` mappings are also supported.
- Schedule and manual triggers do not receive an implicit record input. To execute a manual workflow against a record, pass its ID as `adoid` to `anydb_execute_workflow`; the runtime then exposes that record through `{{context:meta.*}}` and `{{context:content.*}}` action bindings. Omit `adoid` only when the manual workflow is intentionally record-independent.
- Scripts and some other actions may be license-gated. Create disabled by default and enable only when explicitly requested.
- After creating or changing a workflow, keep it disabled until practical verification is ready. Trigger one representative run, then call `anydb_get_workflow` (or `anydb_get_workflow_execution_history`) and inspect the workflow-level status plus each artifact's input, output, logs, and error before considering the automation complete.

### Script Actions

`action_script` runs a JavaScript body inside an async workflow runtime. Call `anydb_list_workflow_actions` and read the `action_script` entry's `guidance` before writing or changing script source: its `globals`, `anydbApis`, `outputApis`, `recordShape`, and `rules` are generated from the server runtime and are authoritative over any example below. `script.runtime.ts` is that surface; an API absent from it does not exist.

Execution shape and validation:

- Provide an executable statement body only. The runtime already wraps it in an async function, so use top-level `await` and never wrap the body in an async IIFE.
- The body is validated before persistence, so `anydb_create_workflow` and `anydb_update_workflow` reject an invalid script instead of storing it. `validateOnly: true` checks a draft on creation without persisting it.
- `import`, `export`, `require(...)`, `eval(...)`, `Function(...)`, `process`, `globalThis`, `global`, `module`, `exports`, `__dirname`, `__filename`, and `constructor.constructor` escapes are rejected.
- `setTimeout`, `setInterval`, and `setImmediate` are unavailable. Use `await anydb.yield()` to yield and `fetch(url, options)` for external HTTP.
- Only documented `anydb.*` and `output.*` members are callable, and only by literal name. Computed access such as `anydb[methodName](...)` is rejected. `base` is an alias of `anydb`.
- Never feature-detect an API (`typeof anydb.updateRecord === "function"`), never write compatibility wrappers, and never call guessed globals such as `getRecord(...)`, `searchRecords(...)`, or a bare `sendEmail(...)`. Use the documented name or fail.
- A supplied `timeoutMs` is clamped to the server's script timeout cap, 30000 ms by default. Design each run to finish inside that budget: filter or page large sets instead of scanning a whole type.

Structure and requirement coverage:

- Open with a top-level `const CONFIG = { ... }` block holding the source type and field names, plus `target` and `defaults` when the script writes to another type. Reference `CONFIG.*` in the logic instead of repeating literals. Do not add a `CONFIG.output` section; `output.set(...)` keys are plain string literals.
- Place execution logic next, and end with explicit `output.set(...)` values and a concise `output.summary(...)`.
- Derive a checklist of every condition, mutation, side effect, ordering constraint, and output in the request, then confirm the finished script covers it. Listing a field in `CONFIG` is not implementing its condition.
- Bind each condition to the exact field it names. Do not substitute a different field because its values look similar.
- Implement each requested action only inside the branch its conditions govern, and preserve ordering where one action depends on another.
- Preserve operation semantics: an append retains existing content, a clear writes the schema-valid empty value, and a lock or unlock request calls the corresponding awaited record helper.
- Do not add mutations the request did not ask for.
- Include short `//` comments naming the concrete condition, field, or cell each block handles, covering at least setup/guard, fetch/process, and output.

Execution integrity:

- Keep branch selection free of side effects. Select the matching branch first, then validate only the inputs and capabilities that branch uses. Never abort a run because data belonging to an unselected branch is missing.
- Preflight every mandatory record, recipient, and identifier before the first mutation, email, notification, share change, or lock change. When a mandatory action cannot be expressed with documented APIs, fail before any side effect rather than part way through.
- Apply value changes in the fewest writes, skip unchanged fields, and perform one cumulative write per append target rather than one write per entry.
- Script-runtime writes already override cell locks. Do not unlock a cell to write it; change lock state only when requested, and only after the value writes succeed.
- Persist a state transition before sending the email or notification that announces it.
- Make update-triggered side effects idempotent, either by transitioning the record out of the triggering condition or by persisting an idempotency marker. An in-memory check does not survive a retried run.
- Never swallow a failure in an empty `catch`. Recover completely, report an explicit partial outcome, or rethrow with operation context, and report success only when every mandatory action completed.
- Report state after the writes, not the pre-update values, and escape record-derived values before interpolating them into an HTML email body.
- Never invent an identifier. `anydb.updateShare(...)` resolves the existing share from `adoid`; supply `shareId` only when an actual share ID was returned or provided.

Data access contracts:

- For a triggering-record script, require `input.recordId`, load it with `await anydb.getRecordById(input.recordId)`, and fail before side effects when it is missing or inaccessible. Use `input.refIds` or query criteria only for intentional scheduled, manual, or batch workflows.
- `anydb.findRecords(...)` and `anydb.findRecordsPage(...)` accept exactly one type-name selector (`type`, `typeName`, or `templateName`) and never a template ID. In `condition`, equality is `==`; a single `=` is not an operator. Supported comparisons are `==`, `!=`, `<`, `<=`, `>`, and `>=`.
- Use `anydb.findRecordsPage(...)` with `limit` and `cursor` for large sets, `anydb.getRecordsByType(...)` only for an unfiltered scan, and `anydb.getChildren(parentid, ...)` for parent-child hierarchy instead of reading IDs out of a cell.
- Read values with `record.cellValues[field]`, `record.fields[field]`, `record.getCell(refOrKey)`, `await record.getRefCellValue(refPath)`, and `record.meta.*`. `record.content`, `record.cells`, and `record.getCellValue(...)` do not exist.
- Iterate cells with `record.getFieldNames()`. `Object.keys(record.fields)` also contains grid-position aliases and double-counts every cell.
- Traverse references with `await record.getRefCellValue("Manager->Department->Name")` or its array form. Traversal stays inside the workflow's own team and database.
- Await every data call and every mutation helper: `setCell`, `setCellProps`, `setCellRefValue`, `lock`, `unlock`, `lockCell`, `unlockCell`, `hideCell`, and `unhideCell`. An unawaited mutation statement is rejected at validation.
- Use exact schema casing for type and field names. When the type declares `SUBMITTED DATE`, write `SUBMITTED DATE`, not `Submitted Date`.
- Write `select` values as declared option literals, normalizing a user's case variant to the schema literal rather than matching on substrings; write `checkbox` values as booleans; write `date`, `datetime`, and `time` values as integer epoch seconds. When reading a numeric date cell, treat a value above `1e12` as milliseconds before converting.
- A `ref` cell does not accept a raw record ID inside `cellValues`. Use `await record.setCellRefValue(refOrKey, targetAdoid)`, or copy an existing normalized ref payload unchanged.
- Write APIs take object parameters with exact lowercase keys: `anydb.createRecord({ name, parentid?, typeid?, typename?, cellValues? })` and `anydb.updateRecord({ adoid, cellValues?, parentid? })`. Use one create target selector, `typename` or `typeid`. `parentId`, `templateName`, `typeName`, and `id` are not accepted in write payloads, and positional forms such as `anydb.updateRecord(adoid, fields)` are not supported.
- `await anydb.createRecord(...)` returns the created runtime record. Its ID is `created.id`, the new adoid, not `created.adoid`. Omit `parentid` only when root creation is intentional; when attaching a child, resolve and validate the parent ID before the call.
- Supplying `parentid` to `anydb.createRecord(...)` or `anydb.updateRecord(...)` accepts one parent ID or an array and replaces the record's complete parent list, so include every existing parent that must remain attached. Omit it to leave attachments unchanged, and never pass an empty list.
- When schema field names, formats, and select options are known, treat them as authoritative. Do not add regex or `Object.keys(...)` discovery to rediscover a field the type already declares.

Loops and output:

- Every loop in async context must contain an `await` in its own body; begin each loop with `await anydb.yield()`. A loop whose only `await` sits inside a nested function is rejected.
- `while (true)`, `while (1)`, and `for (;;)` are rejected. Prefer one top-level scan loop, avoid nested loops, and keep explicit loops out of non-async helper functions.
- `output.set(key, value)` keys must match `^[A-Za-z_][A-Za-z0-9_]*$` and must avoid the reserved names `scriptSummary`, `cellValue`, `processedRefIds`, `updatedRefIds`, `logLines`, `exported_file`, and `customOutputs`, which the runtime populates itself.
- Use `log(...)` or `console.log(...)` for concise diagnostics around inputs, branch decisions, record IDs, and mutation results. Never log credentials, tokens, or sensitive record content.
- Report whether a branch matched, which actions completed, and the resulting state through `output.set(...)` and `output.summary(...)` so later actions can bind to them.

### Reviewing and Updating a Script Action

- `anydb_get_workflow` returns each action's stored `config`, so the current source is available at the `action_script` entry's `config.script`. Read it before proposing a change; never rewrite a script from the workflow name or description alone.
- Review the stored source against the contracts above and the current `action_script` catalog guidance. The runtime surface changes between releases, so re-read the catalog instead of trusting a previously generated script.
- `anydb_update_workflow` replaces the complete ordered action chain and does not accept the `workflow.script` shorthand used at creation. To change one script, resend every action in its final order as `{ key, type: "action_script", config: { script } }` with the corrected source. Omit `changes.actions` entirely when only the name, description, or enabled state changes.
- Preserve each action's other config values and every `{{trigger.*}}` or `{{priorActionKey.*}}` binding when resending the chain. An omitted binding is dropped silently.
- Verify with `anydb_execute_workflow` using `simulate: true`, then a real run against test data, and inspect `executionHistory[].artifactExecutions[].output.logLines` before considering the change complete.
- A simulated run reads real records but persists nothing, and `anydb.createRecord(...)` returns a simulated record whose mutation helpers throw. A script that writes back to a record it just created must be verified with a real run.
- After a run, `anydb_get_workflow` or `anydb_get_workflow_execution_history` shows per-artifact status, output, and error. An empty execution history means the workflow never fired: check that it is enabled and that the trigger matched.

## Construction Procedure

1. Read this guide and `anydb://schemas/solution-authoring/v1`.
2. Classify the request as a standalone type or multi-type solution, and do not broaden its scope without user direction.
3. Privately model the requested types, roles, fields, layouts, and formulas. Include relationships, Views, shares, and workflows only when required.
4. For each proposed type, call `anydb_discover_types` with `source: "workspace"`. Inspect promising candidates with `anydb_get_type_definition`. Compare semantic content and behavior, not names: field purpose, value type and format, requiredness and options, references and ownership, formulas and lookups, and workflow-facing keys or outputs. If a workspace definition can fulfill the requested use case without changing its meaning, reuse it and do not import or create a duplicate.
5. Only when no content-compatible workspace type exists, call `anydb_discover_types` with `source: "builtin"` and inspect promising built-in definitions by the same criteria. If one fulfills the requested use case, import it with `anydb_create_type` in import mode before referencing or using it.
6. Create a new type with `anydb_create_type` in define mode only when neither the workspace nor built-in catalog contains a content-compatible type. A matching name, description, icon, or search score is never sufficient evidence, and a different name does not make equivalent content incompatible.
7. Fix stable type names and field keys.
8. For a standalone type, reuse, import, or create it now and stop after validating it unless more work was requested.
9. For a multi-type solution, resolve each type through the same workspace-first sequence, then create independent reference types first, child types next, and master/container types after their dependencies. Call `anydb_list_views` and `anydb_list_shares`, then create only missing requested Views and shares after all target types and parent records exist. Create a required form share before a form-submit workflow that references its name.
10. Update only where relationships could not be resolved during creation.
11. Re-check every formula and target. Identify required cross-record or external side effects, discover existing workflows, and prefer formulas/lookups for derived values that do not require mutation. Call the workflow trigger/action catalog tools and create workflows last only when automation is required. If the design reaches five workflows, review it for duplication or safe consolidation before proceeding; exceed five only when distinct behavior justifies it.

Use a stable idempotency key for every mutation. On partial failure, inspect current state and resume; do not blindly recreate successful artifacts.

Use stable template names in all MCP inputs. Templates are versioned, and a stored template ID can refer to an obsolete or deleted revision. The AnyDB backend resolves each name to the latest available template ID; IDs returned in discovery or mutation results are informational and must not be reused as authoring inputs.

## Compact Example

A standalone `Meeting Note` type can contain `Subject`, `Meeting Date`, `Attendees`, `Summary`, `Decisions`, and `Follow-ups`. It needs no child type or workflow unless the requested process requires one. Discover existing meeting-note types, then reuse, import, or create this single type and validate its layout.

For a multi-type example, an order solution uses three types:

- `Product`: reference type with `SKU`, `Name`, and `Unit Price`.
- `Order Item`: line-item child with `Product` (`ref` targeting `Product`), `SKU` (`lookup` from `Product`), `Quantity`, and locked `Total = {{Unit Price}} * {{Quantity}}`.
- `Order`: master type with `Order Number = SEQNUM("Order", 1000)`, an `attachments` field targeting `Order Item`, and locked `Total = IFERROR(SUM(C@CURRREC!N@Order Item!{{Total}}), 0)`.

Create `Product`, then `Order Item`, then `Order`. Finally create a disabled record-update workflow scoped to `Order Item` if status automation is required.
