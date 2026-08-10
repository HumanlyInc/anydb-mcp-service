import type { Tool } from "@modelcontextprotocol/sdk/types.js";

import type {
  CreateTypeRequest,
  ExtApiClient,
  UpdateTypeRequest,
} from "./ext-api-client.js";
import {
  readSolutionResource,
  SOLUTION_AUTHORING_SCHEMA_URI,
  SOLUTION_BUILDING_GUIDE_URI,
} from "./solution-resources.js";

const authoringSchema = JSON.parse(
  readSolutionResource(SOLUTION_AUTHORING_SCHEMA_URI).text,
) as {
  $defs: Record<string, unknown> & {
    createTypeInput: Record<string, unknown>;
    updateTypeInput: Record<string, unknown>;
  };
};

const createTypeInputSchema = {
  ...authoringSchema.$defs.createTypeInput,
  $defs: authoringSchema.$defs,
};

const updateTypeInputSchema = {
  ...authoringSchema.$defs.updateTypeInput,
  $defs: authoringSchema.$defs,
};

export const SOLUTION_AUTHORING_TOOLS: Tool[] = [
  {
    name: "anydb_create_type",
    description: `Read ${SOLUTION_BUILDING_GUIDE_URI} before the first authoring call in a task. Create one standalone AnyDB type, define one type in a larger solution, or import one selected built-in type. Discover reusable types first and do not invent related types or workflows when the requested type is standalone.`,
    inputSchema: createTypeInputSchema as unknown as Tool["inputSchema"],
  },
  {
    name: "anydb_update_type",
    description: `Read ${SOLUTION_BUILDING_GUIDE_URI} before the first authoring call in a task. Patch the latest revision of one workspace type by stable template name. Existing records are migrated automatically after persistence; destructive changes require explicit data-loss confirmation.`,
    inputSchema: updateTypeInputSchema as unknown as Tool["inputSchema"],
  },
];

export function isSolutionAuthoringTool(name: string): boolean {
  return SOLUTION_AUTHORING_TOOLS.some((tool) => tool.name === name);
}

export async function callSolutionAuthoringTool(
  name: string,
  args: Record<string, unknown> | undefined,
  client: ExtApiClient,
) {
  if (!args) throw new Error(`${name} arguments are required`);
  let result;
  if (name === "anydb_create_type") {
    result = await client.createType(args as unknown as CreateTypeRequest);
  } else if (name === "anydb_update_type") {
    result = await client.updateType(args as unknown as UpdateTypeRequest);
  } else {
    throw new Error(`Unknown solution authoring tool: ${name}`);
  }
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
  };
}
