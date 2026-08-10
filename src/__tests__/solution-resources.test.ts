import { describe, expect, it } from "@jest/globals";

import {
  listSolutionResources,
  readSolutionResource,
  SOLUTION_AUTHORING_SCHEMA_URI,
  SOLUTION_BUILDING_GUIDE_URI,
} from "../solution-resources.js";

describe("solution resources", () => {
  it("lists and reads the solution-building guide", () => {
    expect(listSolutionResources()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ uri: SOLUTION_BUILDING_GUIDE_URI }),
        expect.objectContaining({ uri: SOLUTION_AUTHORING_SCHEMA_URI }),
      ]),
    );

    const resource = readSolutionResource(SOLUTION_BUILDING_GUIDE_URI);
    expect(resource.mimeType).toBe("text/markdown");
    expect(resource.text).toContain("## Authoring Scope");
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
      "Names, descriptions, and search scores are discovery hints",
    );
    expect(resource.text).toContain(
      "field purpose, value type and format, requiredness and options",
    );
    expect(resource.text).toContain(
      'config: { "templateName": "Transfer Record", "fieldNames": ["Status"] }',
    );
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
      schema.$defs.createWorkflowInput.properties.workflow.properties,
    ).toHaveProperty("actions");
    expect(
      schema.$defs.updateWorkflowInput.properties.changes.properties,
    ).toHaveProperty("enabled");
    expect(schema["x-anydb-tool-input-schemas"]).toHaveProperty(
      "anydb_update_workflow",
    );
  });

  it("rejects unknown resources", () => {
    expect(() => readSolutionResource("anydb://unknown")).toThrow(
      "Unknown AnyDB resource",
    );
  });
});
