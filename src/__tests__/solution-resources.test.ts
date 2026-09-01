import { describe, expect, it } from "@jest/globals";
import { readFileSync } from "node:fs";

import {
  ANYDB_SETUP_GUIDE_URI,
  listSolutionResources,
  readSolutionResource,
  SOLUTION_AUTHORING_SCHEMA_URI,
  SOLUTION_BUILDING_GUIDE_URI,
} from "../solution-resources.js";

describe("solution resources", () => {
  it("lists and reads the solution-building guide", () => {
    expect(listSolutionResources()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ uri: ANYDB_SETUP_GUIDE_URI }),
        expect.objectContaining({ uri: SOLUTION_BUILDING_GUIDE_URI }),
        expect.objectContaining({ uri: SOLUTION_AUTHORING_SCHEMA_URI }),
      ]),
    );

    const resource = readSolutionResource(SOLUTION_BUILDING_GUIDE_URI);
    expect(resource.mimeType).toBe("text/markdown");
    expect(resource.text).toContain("## Authoring Scope");
    expect(resource.text).toContain("## Example User Requests");
    expect(resource.text).toContain(
      "These prompts illustrate supported tasks and useful scope or verification constraints",
    );
    expect(resource.text).toContain(
      "Create this solution, add representative test records, run the workflow once",
    );
    expect(resource.text).toContain("## Completion and Eventual Consistency");
    expect(resource.text).toContain(
      "does not guarantee that every derived or background effect is already visible",
    );
    expect(resource.text).toContain(
      'Formula evaluation can temporarily expose a pending value (`"..."`)',
    );
    expect(resource.text).toContain(
      "An empty execution history means no retained execution is visible yet",
    );
    expect(resource.text).toContain(
      '`migration.status: "queued"` means the new revision is persisted but record migration is not complete',
    );
    expect(resource.text).toContain(
      "Use bounded polling with short increasing intervals and an explicit deadline",
    );
    expect(resource.text).toContain(
      "Never submit a duplicate mutation merely because an asynchronous side effect is still pending",
    );
    expect(resource.text).toContain("## Workspaces");
    expect(resource.text).toContain("anydb_create_workspace");
    expect(resource.text).toContain(
      "The tool does not import samples, create business types, or populate records",
    );
    expect(resource.text).toContain("Standalone type");
    expect(resource.text).toContain("## Cells");
    expect(resource.text).toContain("## Record Titles");
    expect(resource.text).toContain(
      "records of that type are named by evaluating it against the record",
    );
    expect(resource.text).toContain("CONCAT('Meeting: ', {{Subject}})");
    expect(resource.text).toContain(
      "`anydb_update_type` changes it through `changes.titleFormula`",
    );
    expect(resource.text).toContain(
      "do not try to recreate the type, which is rejected as a duplicate name",
    );
    expect(resource.text).toContain(
      "A title formula is a formula expression, not a template string",
    );
    expect(resource.text).toContain(
      "Anything the formula runtime cannot evaluate is rejected **silently**",
    );
    expect(resource.text).toContain("CONCAT({{Name}}, ' (', {{Status}}, ')')");
    expect(resource.text).toContain("`{{Name}} & ' (' & {{Status}}`");
    expect(resource.text).toContain(
      "A field key that does not exist on the type",
    );
    expect(resource.text).toContain("One unknown key discards the whole title");
    expect(resource.text).toContain(
      "that read is the only confirmation that the formula evaluates",
    );
    // Reworded from "avoid special characters such as %" into a table of the
    // actual failure modes, since nothing rejects a bad key yet (ISSUE - 4).
    // The % case is still called out, now with what it really does.
    expect(resource.text).toContain(
      "Field keys must contain only letters, numbers, underscores, and spaces",
    );
    expect(resource.text).toContain("`Discount %`");
    expect(resource.text).toContain(
      "A `heading` field requires `headingLabel`",
    );
    expect(resource.text).toContain(
      "stored in the heading cell's `HEADING_LABEL` prop rather than its `value`",
    );
    expect(resource.text).toContain(
      "A `percentage` field stores a fraction from `0` to `1`",
    );
    expect(resource.text).toContain("Store 25% as `0.25`, not `25`");
    expect(resource.text).toContain(
      "`date`, `datetime`, and `time` record values use integer seconds since the Unix epoch",
    );
    expect(resource.text).toContain("`Math.floor(Date.now() / 1000)`");
    expect(resource.text).toContain("not `Date.now()`");
    expect(resource.text).toContain(
      "Guard aggregations and other relationship-dependent expressions",
    );
    expect(resource.text).toContain(
      "This includes `SUM`, `COUNT`, `MAX`, `FILTER`, `SUMBY`, `MAXBY`",
    );
    expect(resource.text).toContain(
      'normally `0` for numeric results, `[]` for arrays, and `""` for text',
    );
    expect(resource.text).toContain(
      "IFERROR(SUM(C@CURRREC!N@Invoice!{{Amount}}), 0)",
    );
    expect(resource.text).toContain(
      "IFERROR(COUNT(C@CURRREC!N@Invoice!{{Name}}), 0)",
    );
    expect(resource.text).toContain(
      'IFERROR(MAXBY(FILTER(C@CURRREC!N@Invoice!{{Packed Data}}, {type: "Open"}), "total"), 0)',
    );
    expect(resource.text).not.toContain(
      "locked `Total = SUM(C@CURRREC!N@Order Item!{{Total}})`",
    );
    expect(resource.text).toContain("### Canonical Type Layout");
    expect(resource.text).toContain("six-column grid, A-F");
    expect(resource.text).toContain("Build an occupancy map");
    expect(resource.text).toContain("## Construction Procedure");
    expect(resource.text).toContain('source: "workspace"');
    expect(resource.text).toContain('source: "builtin"');
    expect(resource.text).toContain(
      "Create a new type with `anydb_create_type` in define mode only when neither",
    );
    expect(resource.text).toContain(
      "Treat `anydb_discover_types` as candidate retrieval, not compatibility confirmation",
    );
    expect(resource.text).toContain(
      "Names, descriptions, categories, and search ranking are discovery hints",
    );
    expect(resource.text).toContain(
      "field purpose, value type and format, requiredness and options",
    );
    expect(resource.text).toContain(
      "Relationship traversal uses AnyDB-specific references",
    );
    expect(resource.text).toContain(
      "Connected child and parent references return arrays",
    );
    expect(resource.text).toContain(
      "Do not author or modify `childPolicy`, `childPolicy.allowOnly`, or `childPolicy.autoCreate` through MCP",
    );
    expect(resource.text).toContain(
      "Omit child policy from create and update requests",
    );
    expect(resource.text).not.toContain(
      "`childPolicy.allowOnly` restricts allowed child types",
    );
    expect(resource.text).toContain(
      "Parent attachment is a property of the record, not of the type",
    );
    expect(resource.text).toContain(
      "`update_record` sets a record's parents through `meta.attach`",
    );
    expect(resource.text).toContain(
      "This is the tool that attaches one record to several parents",
    );
    expect(resource.text).toContain(
      "replaces the record's complete parent list rather than adding to it",
    );
    expect(resource.text).toContain(
      "`move_record` is a single-parent reassignment",
    );
    expect(resource.text).toContain(
      "`delete_record` with `removefromids` detaches a record from specific parents",
    );
    expect(resource.text).toContain("C@CURRREC!N@Invoice!{{Amount}}");
    expect(resource.text).toContain("A@CURRREC!{{Budget}}[0]");
    expect(resource.text).toContain(
      "define `lookup.fromField`, `lookup.targetField`, and `lookup.mode` instead of manually writing `DYNREF`",
    );
    expect(resource.text).toContain(
      "its first argument is the grid position of the `ref` cell",
    );
    expect(resource.text).toContain("Live lookup propagation is supported");
    expect(resource.text).toContain(
      "Do not assume a corrected template or lookup engine automatically backfills stale computed values",
    );
    expect(resource.text).toContain(
      "can also run during record creation when a monitored field is initially set",
    );
    expect(resource.text).toContain(
      "Do not treat this trigger as proof that the record previously existed",
    );
    expect(resource.text).toContain(
      'config: { "templateName": "Transfer Record", "fieldNames": ["Status"] }',
    );
    expect(resource.text).toContain("Use `log(...)` or `console.log(...)`");
    expect(resource.text).toContain(
      "executionHistory[].artifactExecutions[].output.logLines",
    );
    expect(resource.text).toContain("call `anydb_get_workflow`");
    expect(resource.text).toContain(
      "Its ID is `created.id`, the new adoid, not `created.adoid`",
    );
    expect(resource.text).toContain(
      "replaces the record's complete parent list",
    );
    expect(resource.text).toContain("Omit it to leave attachments unchanged");
    expect(resource.text).toContain(
      "pass its ID as `adoid` to `anydb_execute_workflow`",
    );
    expect(resource.text).toContain(
      "`{{context:meta.*}}` and `{{context:content.*}}`",
    );
    expect(resource.text).toContain("After creating or changing a workflow");
    expect(resource.text).toContain("anydb_get_workflow_execution_history");
    expect(resource.text).toContain(
      "Create workflows only for required automation",
    );
    expect(resource.text).toContain(
      "an event or change on one record must automatically create, update",
    );
    expect(resource.text).toContain(
      "Five or more workflows is a design-review signal",
    );
    expect(resource.text).toContain("It is not a hard limit");
    expect(resource.text).toContain("### Script Actions");
    expect(resource.text).toContain(
      "### Reviewing and Updating a Script Action",
    );
    expect(resource.text).toContain("never wrap the body in an async IIFE");
    expect(resource.text).toContain(
      "`constructor.constructor` escapes are rejected",
    );
    expect(resource.text).toContain(
      "Computed access such as `anydb[methodName](...)` is rejected",
    );
    expect(resource.text).toContain("Never feature-detect an API");
    expect(resource.text).toContain(
      "clamped to the server's script timeout cap, 30000 ms by default",
    );
    expect(resource.text).toContain("const CONFIG = { ... }");
    expect(resource.text).toContain(
      "Listing a field in `CONFIG` is not implementing its condition",
    );
    // A generated script has to be readable by the human who inherits it, so
    // the guide asks for both halves: separated blocks, and comments that stay
    // short. Asserting only the first half lets the second regress silently.
    expect(resource.text).toContain(
      "Keep those stages as separate, ordered blocks",
    );
    expect(resource.text).toContain(
      "Open each block with a short `//` comment naming the concrete condition",
    );
    expect(resource.text).toContain("Keep the comments minimal");
    expect(resource.text).toContain("no line-by-line narration");
    expect(resource.text).toContain(
      "Keep branch selection free of side effects",
    );
    expect(resource.text).toContain(
      "Persist a state transition before sending the email",
    );
    expect(resource.text).toContain(
      "Never swallow a failure in an empty `catch`",
    );
    expect(resource.text).toContain(
      "require `input.recordId`, load it with `await anydb.getRecordById(input.recordId)`",
    );
    expect(resource.text).toContain(
      "accept exactly one type-name selector (`type`, `typeName`, or `templateName`) and never a template ID",
    );
    expect(resource.text).toContain("a single `=` is not an operator");
    // ISSUE - 48 / DEC-1012. This was ruled documentation-only rather than a
    // code fix, which makes the wording the entire mitigation. Both halves are
    // pinned: the hazard, and the pattern that actually works -- an author told
    // only that it fails will reach for a retry loop, which cannot help inside
    // the script timeout.
    expect(resource.text).toContain(
      "does not see records the same execution just created"
    );
    expect(resource.text).toContain(
      "finds nothing and creates duplicates every time"
    );
    expect(resource.text).toContain(
      "track the records you create in memory"
    );
    expect(resource.text).toContain(
      "`record.content`, `record.cells`, and `record.getCellValue(...)` do not exist",
    );
    expect(resource.text).toContain(
      "Iterate cells with `record.getFieldNames()`",
    );
    expect(resource.text).toContain(
      "An unawaited mutation statement is rejected at validation",
    );
    expect(resource.text).toContain(
      "write `SUBMITTED DATE`, not `Submitted Date`",
    );
    expect(resource.text).toContain(
      "A `ref` cell does not accept a raw record ID inside `cellValues`",
    );
    expect(resource.text).toContain(
      "`parentId`, `templateName`, `typeName`, and `id` are not accepted in write payloads",
    );
    expect(resource.text).toContain(
      "A loop whose only `await` sits inside a nested function is rejected",
    );
    expect(resource.text).toContain("^[A-Za-z_][A-Za-z0-9_]*$");
    expect(resource.text).toContain(
      "`scriptSummary`, `cellValue`, `processedRefIds`, `updatedRefIds`, `logLines`, `exported_file`, and `customOutputs`",
    );
    expect(resource.text).toContain(
      "the current source is available at the `action_script` entry's `config.script`",
    );
    expect(resource.text).toContain(
      "does not accept the `workflow.script` shorthand used at creation",
    );
    expect(resource.text).toContain("An omitted binding is dropped silently");
    expect(resource.text).toContain(
      "returns a simulated record whose mutation helpers throw",
    );
    expect(resource.text).toContain("## Sharing");
    expect(resource.text).toContain("anydb_list_views");
    expect(resource.text).toContain("anydb_delete_view");
    expect(resource.text).toContain("**`like` is not available**");
    expect(resource.text).toContain(
      "`fieldType` is the field's format",
    );
    expect(resource.text).toContain("anydb_list_team_groups");
    expect(resource.text).toContain("anydb_list_shares");
    expect(resource.text).toContain("anydb_revoke_share");
    expect(resource.text).toContain(
      'A public share uses `privacy: "public"`, must omit `recipients`',
    );
    expect(resource.text).toContain(
      "Form shares do not accept `role` or `withAttachments`",
    );
    expect(resource.text).toContain(
      "auto-creates a Folder record under the database root",
    );
    expect(resource.text).toContain(
      "Record shares have no submissions destination and do not create a Folder",
    );
    // A formula reference to a file cell shares the file rather than copying
    // it (ISSUE-50). Both the behaviour and the scope are pinned in
    // anydb-server's test/integration/file.cell.reference.test.ts; these
    // assertions keep the guide from quietly losing them.
    expect(resource.text).toContain("### Referencing a File From Another Cell");
    expect(resource.text).toContain(
      "shares the\nunderlying file rather than copying it",
    );
    expect(resource.text).toContain("A@CURRREC!{{Doc}}[0]");
    expect(resource.text).toContain(
      "creates no child record, so anything that finds files by walking the attachment",
    );
  });

  it("lists and reads the MCP setup guide", () => {
    const resource = readSolutionResource(ANYDB_SETUP_GUIDE_URI);

    expect(resource.mimeType).toBe("text/markdown");
    expect(resource.text).toContain("Profile dialog");
    expect(resource.text).toContain("Integration");
    expect(resource.text).toContain("anydb-mcp-service@latest");
    expect(resource.text).toContain("ANYDB_API_URL");
    expect(resource.text).toContain("Do not use `ANYDB_API_BASE_URL`");
    expect(resource.text).toContain("Restart the MCP client");
    expect(resource.text).toContain("List my AnyDB teams");
    // Recognising an account from its team list is what fails when two
    // accounts share a team, so the guide points at anydb_whoami instead.
    expect(resource.text).toContain("anydb_whoami");
    expect(resource.text).not.toContain("## Example User Requests");
  });

  it("reads a valid machine-readable authoring schema", () => {
    const resource = readSolutionResource(SOLUTION_AUTHORING_SCHEMA_URI);
    const schema = JSON.parse(resource.text);

    expect(resource.mimeType).toBe("application/schema+json");
    expect(schema.$id).toBe(SOLUTION_AUTHORING_SCHEMA_URI);
    expect(schema.$defs.field.properties.format.enum).toContain("lookup");
    expect(schema.$defs.field.properties).toHaveProperty("headingLabel");
    expect(schema.$defs.field.allOf[0].then.required).toContain("headingLabel");
    expect(schema.$defs.fieldUpdate.properties).toHaveProperty("headingLabel");
    expect(schema.$defs.field.properties.lookup.properties.mode.enum).toEqual([
      "snapshot",
      "live",
    ]);
    expect(schema.$defs.field.properties.lookup.properties.mode.default).toBe(
      "snapshot",
    );
    expect(schema["x-anydb-tool-input-schemas"]).toHaveProperty(
      "anydb_create_type",
    );
    expect(schema["x-anydb-tool-input-schemas"]).toHaveProperty(
      "anydb_create_workspace",
    );
    expect(schema.$defs.createWorkspaceInput.required).toEqual([
      "teamid",
      "name",
      "clientRequestId",
    ]);
    expect(schema.$defs.createTypeInput.properties).toHaveProperty(
      "builtInTemplateName",
    );
    expect(schema.$defs.typeDefinition.properties).not.toHaveProperty(
      "childPolicy",
    );
    expect(schema.$defs.updateTypeInput.properties).toHaveProperty(
      "templateName",
    );
    expect(
      schema.$defs.typeDefinition.properties.titleFormula.description,
    ).toContain("record-title formula");
    expect(
      schema.$defs.updateTypeInput.properties.changes.properties,
    ).toHaveProperty("titleFormula");
    expect(
      schema.$defs.updateTypeInput.properties.changes.properties.titleFormula
        .description,
    ).toContain("CONCAT is the only supported way to join text");
    expect(schema.$defs.updateTypeInput.properties).not.toHaveProperty(
      "templateid",
    );
    expect(
      schema.$defs.updateTypeInput.properties.changes.properties,
    ).toHaveProperty("icon");
    expect(
      schema.$defs.updateTypeInput.properties.changes.properties,
    ).not.toHaveProperty("replaceChildPolicy");
    expect(
      schema.$defs.updateTypeInput.properties.changes.properties.icon,
    ).toMatchObject({ type: "string" });
    expect(
      schema.$defs.createWorkflowInput.properties.workflow.properties,
    ).toHaveProperty("actions");
    expect(
      schema.$defs.updateWorkflowInput.properties.changes.properties,
    ).toHaveProperty("enabled");
    expect(schema["x-anydb-tool-input-schemas"]).toHaveProperty(
      "anydb_update_workflow",
    );
    // ISSUE - 30 retired the View ADO tools. This schema documents the
    // solution-authoring tools to an LLM, so a leftover entry here would
    // describe anydb_create_view with the arguments of the tool it replaced.
    for (const retired of [
      "anydb_create_view",
      "anydb_update_view",
      "anydb_list_views",
      "anydb_get_view",
      "anydb_delete_view",
    ]) {
      expect(schema["x-anydb-tool-input-schemas"]).not.toHaveProperty(retired);
    }
    for (const orphan of [
      "createViewInput",
      "updateViewInput",
      "listViewsInput",
      "getViewInput",
      "deleteViewInput",
      "viewDefinition",
      "viewTarget",
      "viewFilter",
    ]) {
      expect(schema.$defs).not.toHaveProperty(orphan);
    }
    expect(schema["x-anydb-tool-input-schemas"]).toHaveProperty(
      "anydb_create_share",
    );
    expect(schema["x-anydb-tool-input-schemas"]).toHaveProperty(
      "anydb_list_team_groups",
    );
    expect(schema["x-anydb-tool-input-schemas"]).toHaveProperty(
      "anydb_list_shares",
    );
    expect(schema["x-anydb-tool-input-schemas"]).toHaveProperty(
      "anydb_get_share",
    );
    expect(schema["x-anydb-tool-input-schemas"]).toHaveProperty(
      "anydb_revoke_share",
    );
    expect(schema.$defs.createShareInput.required).toEqual([
      "teamid",
      "adbid",
      "clientRequestId",
      "share",
    ]);
    expect(schema.$defs.shareTarget.oneOf).toHaveLength(2);
    expect(schema.$defs.shareTarget.description).toContain('"kind":"record"');
    expect(
      schema.$defs.shareTarget.oneOf[1].properties.parentRecordId.description,
    ).toContain("creates a Folder under the database root");
    expect(schema.$defs.shareRecipients.anyOf).toEqual([
      { required: ["emails"] },
      { required: ["groupNames"] },
    ]);
    expect(
      schema.$defs.createShareInput.properties.share.properties.role,
    ).not.toHaveProperty("default");
    expect(
      schema.$defs.createShareInput.properties.share.properties.withAttachments,
    ).not.toHaveProperty("default");
    expect(schema.$defs.revokeShareInput.required).toContain("clientRequestId");
  });

  it("rejects unknown resources", () => {
    expect(() => readSolutionResource("anydb://unknown")).toThrow(
      "Unknown AnyDB resource",
    );
  });
});

describe("cell properties and conditional formatting", () => {
  const schema = JSON.parse(
    readFileSync(
      new URL("../../resources/solution-authoring-v1.schema.json", import.meta.url),
      "utf8",
    ),
  ) as any;
  const guide = readFileSync(
    new URL("../../resources/solution-building-v1.md", import.meta.url),
    "utf8",
  );

  it("lets a field carry props on create and update", () => {
    for (const def of ["field", "fieldUpdate"]) {
      expect(schema.$defs[def].properties.props).toBeDefined();
      expect(schema.$defs[def].properties.props.additionalProperties.$ref).toBe(
        "#/$defs/cellProp",
      );
    }
  });

  it("requires a prop to carry a value, an expr, or both", () => {
    const prop = schema.$defs.cellProp;
    expect(prop.minProperties).toBe(1);
    expect(prop.additionalProperties).toBe(false);
    expect(Object.keys(prop.properties).sort()).toEqual(["expr", "value"]);
  });

  it("tells clients which properties the named fields own", () => {
    // Sending these through props is rejected by the server, so the schema has
    // to say so or clients will discover it as a 400.
    for (const owned of [
      "CELL_DESCRIPTION",
      "HEADING_LABEL",
      "CELL_LOCKED",
      "CELL_REQUIRED",
      "SELECT_OPTIONS",
      "ATTACHMENTS_TEMPLATE_NAME",
    ]) {
      expect(schema.$defs.field.properties.props.description).toContain(owned);
    }
  });

  it("tells clients which properties are unavailable", () => {
    for (const restricted of [
      "SCRIPT_SOURCE",
      "VALUE_OVERRIDE",
      "ATTACHMENTS_PARENT",
    ]) {
      expect(schema.$defs.field.properties.props.description).toContain(
        restricted,
      );
    }
    // The access props moved OUT of this list (ISSUE - 3). Naming them here
    // again would pass on a substring match while saying the opposite of what
    // is true, so assert the sentence that grants them instead.
    expect(schema.$defs.field.properties.props.description).toContain(
      "CELL_HIDDEN_ACCESS and CELL_LOCKED_ACCESS control what a particular viewer sees and can be set",
    );
  });

  it("warns that ROLE and HASPERM never fire in an access rule", () => {
    // They parse, so nothing is rejected — the rule just never matches, which
    // for CELL_HIDDEN_ACCESS means the field stays visible to everyone.
    expect(schema.$defs.field.properties.props.description).toContain(
      "always evaluate false",
    );
  });

  it("documents the properties that authorable formats require", () => {
    // `ai` and `button` are offered as formats, so a client must be told how
    // to make them work rather than discovering the props are refused.
    const desc = schema.$defs.field.properties.props.description;
    expect(desc).toContain("AI_PROMPT");
    expect(desc).toContain("BUTTON_ACTION_TYPE");
    expect(guide).toContain("AI_PROMPT");
    expect(guide).toContain("BUTTON_ACTION_VALUE");
  });

  it("documents CURRCELL, which is what makes per-cell conditions work", () => {
    expect(schema.$defs.cellProp.description).toContain("CURRCELL");
    expect(guide).toContain("CURRCELL");
  });

  it("documents that props replaces the whole map on update", () => {
    expect(guide).toContain("replaces the whole map");
    expect(schema.$defs.field.properties.props.description).toContain(
      "replaces the whole map",
    );
  });

  it("says which reference form goes where", () => {
    // A formula written against a grid position silently reads a different
    // field once the layout changes, so clients need this stated, not implied.
    expect(guide).toContain("Referring to a Cell");
    expect(guide).toContain("Only as the first argument to `DYNREF`");
  });

  it("warns that DYNREF and SEQNUM must not be wrapped", () => {
    // The IFERROR advice elsewhere in the guide would otherwise read as
    // applying to these two as well.
    expect(guide).toContain("must stand alone");
    expect(guide).toContain("SEQNUM");
  });

  it("documents the comparison and logic operators", () => {
    // A client wrote IF(CURRCELL='High', ...) and every record took the first
    // branch. Equality was documented only for the separate findRecords
    // condition language, so there was no signal for the formula language.
    expect(guide).toContain("### Operators");
    expect(guide).toContain("`=` is not equality");
    expect(guide).toContain("`!` is factorial");
  });

  it("shows equality against a string literal", () => {
    // Every formula example was truthiness or arithmetic, so there was no
    // correct pattern to copy.
    expect(guide).toContain("CURRCELL == 'High'");
  });

  it("keeps the formula and condition languages distinct", () => {
    expect(guide).toContain("separate, smaller** language");
  });

  it("points clients at the live function reference", () => {
    // The guide cannot stay current with 84-odd functions, so it must send
    // clients somewhere that is, rather than inviting them to guess.
    expect(guide).toContain("anydb.com/support/reference/formulas");
    expect(guide).toContain("Do not invent function names");
    // Per-function pages, so a client can look up one signature directly
    // instead of fetching and scanning the index.
    expect(guide).toContain("formulas/functions/<function_name>");
  });

  it("sets the expectation that writes return evaluated values", () => {
    expect(guide).toContain("When Formulas Evaluate");
    expect(guide).toContain("return the record after evaluation");
  });

  // Verified against the engine in anydb-server
  // test/computed/today.staleness.test.ts: a TODAY()-only cell is not
  // refreshed even by writing another field on the same record, so the guide
  // has to say which field a scheduled workflow must write.
  it("warns that TODAY() and NOW() are snapshots rather than a live clock", () => {
    expect(guide).toContain("`TODAY()` and `NOW()` are read when the formula runs");
    expect(guide).toContain("create no dependency edge");
    expect(guide).toContain("trigger_on_schedule");
  });

  // SEQNUM is async and CONCAT is not, so CONCAT('INV-', SEQNUM(...)) stores
  // "INV-[object Promise]" and reports nothing. The engine is staying that way
  // (ISSUE - 9), so the guide is the only thing standing between an author and
  // that string. It previously carried the standalone-only rule with no
  // CONCAT_A exception, which forbade the one pattern that works.
  it("carves CONCAT_A out of the SEQNUM standalone rule", () => {
    expect(guide).toContain("`CONCAT_A` around `SEQNUM` is the one exception");
    expect(guide).toContain("INV-[object Promise]");
    expect(guide).toContain("TEXT_A");
  });

  // Nothing rejects a bad field key today and blocking is deferred to the UI
  // (ISSUE - 4), so the guide is the only guard. A bare rule is not enough
  // when the penalty is a plausible wrong number, hence the consequences.
  it("warns that a bad field key breaks formulas silently", () => {
    expect(guide).toContain(
      "Field keys must contain only letters, numbers, underscores, and spaces",
    );
    // Underscore works at runtime; the old wording omitted it.
    expect(guide).toContain("`Invoice_Face_Value`");
    // The two failure modes nobody would guess.
    expect(guide).toContain("silently reads a **different field**");
    expect(guide).toContain("the rest of the formula is discarded");
    // IFERROR looks like a safety net here and is not one.
    expect(guide).toContain("`IFERROR` never fires");
  });

  // A ref can point at a different type per record, which the designer has
  // always allowed and this API did not (ISSUE - 2). The guide used to say a
  // ref "requires an exact targetType name", contradicting it outright.
  it("documents an expression-driven ref target", () => {
    expect(guide).toContain("### Polymorphic References");
    // The trap worth stating: only the fixed name can be verified up front.
    expect(guide).toContain(
      "A name that only ever appears inside the `expr` is not",
    );
    // targetType still owns the property; the expr does not go via props.
    expect(guide).toContain("through `targetType`, not through `props`");
  });

  it("documents per-viewer cell access as an advanced feature", () => {
    expect(guide).toContain("### Per-Viewer Cell Access (advanced)");
    // The restricted language is the thing an author will otherwise assume is
    // the formula language.
    expect(guide).toContain("Their `expr` is not the formula language");
    expect(guide).toContain("Use `INGROUP` and `NOTINGROUP`");
    // Setting visibility is not granting access; point at the ACL guide.
    expect(guide).toContain("anydb://guides/permissions/v1");
  });

  it("states that a View filter cannot reference the viewer", () => {
    expect(guide).toContain("A filter cannot reference whoever is viewing");
  });

  // Hand-splicing a comment through update_record forges the author and skips
  // notifications (ISSUE - 14). The guide has to steer off it explicitly.
  it("points comments at the comment tools, not update_record", () => {
    expect(guide).toContain("## Comments");
    expect(guide).toContain(
      "Do not write into a record's `comments` through",
    );
    expect(guide).toContain("[Name](user://<userid>)");
  });

  it("explains how to make a computed cell overridable", () => {
    expect(guide).toContain("VALUE_OVERRIDE_ENABLED");
  });

  it("no longer tells clients to avoid props", () => {
    // The guide previously said to use semantic properties "instead of raw
    // internal props", which is now the opposite of the supported path.
    expect(guide).not.toContain("instead of raw internal `props`");
  });
});
