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
    expect(resource.text).toContain("## Cells");
    expect(resource.text).toContain("## Construction Procedure");
  });

  it("reads a valid machine-readable authoring schema", () => {
    const resource = readSolutionResource(SOLUTION_AUTHORING_SCHEMA_URI);
    const schema = JSON.parse(resource.text);

    expect(resource.mimeType).toBe("application/schema+json");
    expect(schema.$id).toBe(SOLUTION_AUTHORING_SCHEMA_URI);
    expect(schema.$defs.field.properties.format.enum).toContain("lookup");
    expect(schema["x-anydb-tool-input-schemas"]).toHaveProperty(
      "anydb_create_type",
    );
  });

  it("rejects unknown resources", () => {
    expect(() => readSolutionResource("anydb://unknown")).toThrow(
      "Unknown AnyDB resource",
    );
  });
});
