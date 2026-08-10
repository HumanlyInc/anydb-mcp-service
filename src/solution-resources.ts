import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const SOLUTION_BUILDING_GUIDE_URI =
  "anydb://guides/solution-building/v1";
export const SOLUTION_AUTHORING_SCHEMA_URI =
  "anydb://schemas/solution-authoring/v1";

const RESOURCES = [
  {
    uri: SOLUTION_BUILDING_GUIDE_URI,
    name: "AnyDB solution-building guide",
    description:
      "Canonical rules for designing AnyDB types, cells, relationships, formulas, and workflows.",
    mimeType: "text/markdown",
    filename: "solution-building-v1.md",
  },
  {
    uri: SOLUTION_AUTHORING_SCHEMA_URI,
    name: "AnyDB solution-authoring schemas",
    description:
      "Machine-readable semantic contracts for AnyDB cells and solution-authoring tools.",
    mimeType: "application/schema+json",
    filename: "solution-authoring-v1.schema.json",
  },
] as const;

export function listSolutionResources() {
  return RESOURCES.map(({ filename: _filename, ...resource }) => resource);
}

export function readSolutionResource(uri: string) {
  const resource = RESOURCES.find((candidate) => candidate.uri === uri);
  if (!resource) {
    throw new Error(`Unknown AnyDB resource: ${uri}`);
  }

  const path = fileURLToPath(
    new URL(`../resources/${resource.filename}`, import.meta.url),
  );
  return {
    uri: resource.uri,
    mimeType: resource.mimeType,
    text: readFileSync(path, "utf8"),
  };
}
