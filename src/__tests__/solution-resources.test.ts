import { describe, expect, it } from "@jest/globals";

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
      "Its ID is `created.id` (the new adoid), not `created.adoid`",
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
    expect(resource.text).toContain("## Sharing");
    expect(resource.text).toContain("anydb_list_views");
    expect(resource.text).toContain("anydb_delete_view");
    expect(resource.text).toContain("native JSON string, number, or boolean");
    expect(resource.text).toContain(
      "`fieldType` is optional and may be `string`, `number`, `boolean`, `date`, or `array`",
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
    expect(resource.text).not.toContain("## Example User Requests");
  });

  it("reads a valid machine-readable authoring schema", () => {
    const resource = readSolutionResource(SOLUTION_AUTHORING_SCHEMA_URI);
    const schema = JSON.parse(resource.text);

    expect(resource.mimeType).toBe("application/schema+json");
    expect(schema.$id).toBe(SOLUTION_AUTHORING_SCHEMA_URI);
    expect(schema.$defs.field.properties.format.enum).toContain("lookup");
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
    expect(schema.$defs.updateTypeInput.properties).toHaveProperty(
      "templateName",
    );
    expect(schema.$defs.updateTypeInput.properties).not.toHaveProperty(
      "templateid",
    );
    expect(
      schema.$defs.updateTypeInput.properties.changes.properties,
    ).toHaveProperty("icon", { type: "string" });
    expect(
      schema.$defs.createWorkflowInput.properties.workflow.properties,
    ).toHaveProperty("actions");
    expect(
      schema.$defs.updateWorkflowInput.properties.changes.properties,
    ).toHaveProperty("enabled");
    expect(schema["x-anydb-tool-input-schemas"]).toHaveProperty(
      "anydb_update_workflow",
    );
    expect(schema["x-anydb-tool-input-schemas"]).toHaveProperty(
      "anydb_create_view",
    );
    expect(schema.$defs.createViewInput.properties.view.$ref).toBe(
      "#/$defs/viewDefinition",
    );
    expect(
      schema.$defs.createViewInput.properties.clientRequestId.description,
    ).toContain("Required idempotency key");
    expect(schema.$defs.viewDefinition.properties.scope.enum).toEqual([
      "workspace",
      "children",
    ]);
    expect(schema.$defs.viewDefinition.allOf[0].then.required).toContain(
      "parentRecordId",
    );
    expect(schema["x-anydb-tool-input-schemas"]).toHaveProperty(
      "anydb_update_view",
    );
    expect(schema["x-anydb-tool-input-schemas"]).toHaveProperty(
      "anydb_list_views",
    );
    expect(schema["x-anydb-tool-input-schemas"]).toHaveProperty(
      "anydb_get_view",
    );
    expect(schema["x-anydb-tool-input-schemas"]).toHaveProperty(
      "anydb_delete_view",
    );
    expect(schema.$defs.updateViewInput.required).toEqual([
      "teamid",
      "adbid",
      "viewId",
      "clientRequestId",
      "changes",
    ]);
    expect(
      schema.$defs.updateViewInput.properties.changes.properties.targets.items
        .$ref,
    ).toBe("#/$defs/viewTarget");
    expect(
      schema.$defs.updateViewInput.properties.changes.properties,
    ).not.toHaveProperty("scope");
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
    expect(schema.$defs.deleteViewInput.required).toContain("clientRequestId");
    expect(schema.$defs.revokeShareInput.required).toContain("clientRequestId");
    expect(schema.$defs.viewFilter.properties.value.description).toContain(
      "does not coerce",
    );
    expect(schema.$defs.viewFilter.properties.fieldType.description).toContain(
      "not required",
    );
  });

  it("rejects unknown resources", () => {
    expect(() => readSolutionResource("anydb://unknown")).toThrow(
      "Unknown AnyDB resource",
    );
  });
});
