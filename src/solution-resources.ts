import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const SOLUTION_BUILDING_GUIDE_URI =
  "anydb://guides/solution-building/v1";
export const ANYDB_SETUP_GUIDE_URI = "anydb://guides/setup/v1";
export const ANYDB_PERMISSIONS_GUIDE_URI = "anydb://guides/permissions/v1";
export const SOLUTION_AUTHORING_SCHEMA_URI =
  "anydb://schemas/solution-authoring/v1";

const RESOURCES = [
  {
    uri: ANYDB_SETUP_GUIDE_URI,
    name: "AnyDB MCP setup guide",
    description:
      "API-key retrieval, MCP client configuration, verification, and troubleshooting.",
    mimeType: "text/markdown",
    filename: "setup-guide-v1.md",
  },
  {
    uri: ANYDB_PERMISSIONS_GUIDE_URI,
    name: "AnyDB permissions guide",
    description:
      "How AnyDB access control works: permission types crossed with levels, why attaching a child is OBJECT_ATTACHED/PERM_CREATE on the parent, and which key not to trust.",
    mimeType: "text/markdown",
    filename: "permissions-v1.md",
  },
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
