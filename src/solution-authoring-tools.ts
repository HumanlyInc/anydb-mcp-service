import type { Tool } from "@modelcontextprotocol/sdk/types.js";

import type {
  CreateTypeRequest,
  CreateWorkflowRequest,
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
    createWorkflowInput: Record<string, unknown>;
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

const createWorkflowInputSchema = {
  ...authoringSchema.$defs.createWorkflowInput,
  $defs: authoringSchema.$defs,
};

export const SOLUTION_AUTHORING_TOOLS: Tool[] = [
  {
    name: "anydb_get_authoring_guide",
    description:
      "Fetch the canonical AnyDB solution-building guide for designing types, cells, relationships, formulas, and workflows. Call this once before any authoring work to understand rules for standalone types, multi-type solutions, relationships, formulas, and workflow creation.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "anydb_create_type",
    description: `Call anydb_get_authoring_guide before the first authoring call in a task. Use its canonical type-layout rules to design every field's position, colspan, and rowspan, then submit that complete structure here. Create one standalone AnyDB type, define one type in a larger solution, or import one selected built-in type. Discover reusable types first and do not invent related types or workflows when the requested type is standalone.`,
    inputSchema: createTypeInputSchema as unknown as Tool["inputSchema"],
  },
  {
    name: "anydb_update_type",
    description: `Read the authoring guide (call anydb_get_authoring_guide) before the first authoring call in a task. Patch the latest revision of one workspace type by stable template name. Existing records are migrated automatically after persistence; destructive changes require explicit data-loss confirmation.`,
    inputSchema: updateTypeInputSchema as unknown as Tool["inputSchema"],
  },
  {
    name: "anydb_create_workflow",
    description: `Read the authoring guide (call anydb_get_authoring_guide) before authoring. Create exactly one supported trigger connected directly to exactly one script action. The server resolves stable form/type names, generates runtime artifact IDs, and automatically binds record-producing trigger output to script input.recordId.`,
    inputSchema: createWorkflowInputSchema as unknown as Tool["inputSchema"],
  },
];

export function isSolutionAuthoringTool(name: string): boolean {
  return SOLUTION_AUTHORING_TOOLS.some((tool) => tool.name === name);
}

function normalizeStructuredArgument(
  args: Record<string, unknown>,
  field: "type" | "changes" | "workflow",
  toolName: string,
): Record<string, unknown> {
  const value = args[field];
  if (typeof value !== "string") return args;

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(
      `${toolName}.${field} must be an object or valid JSON object string`,
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${toolName}.${field} must resolve to an object`);
  }
  return { ...args, [field]: parsed };
}

export async function callSolutionAuthoringTool(
  name: string,
  args: Record<string, unknown> | undefined,
  client: ExtApiClient,
) {
  if (name === "anydb_get_authoring_guide") {
    const guide = readSolutionResource(SOLUTION_BUILDING_GUIDE_URI);
    return {
      content: [{ type: "text" as const, text: guide.text }],
    };
  }

  if (!args) throw new Error(`${name} arguments are required`);
  let result;
  if (name === "anydb_create_type") {
    const normalized = normalizeStructuredArgument(args, "type", name);
    result = await client.createType(
      normalized as unknown as CreateTypeRequest,
    );
  } else if (name === "anydb_update_type") {
    const normalized = normalizeStructuredArgument(args, "changes", name);
    result = await client.updateType(
      normalized as unknown as UpdateTypeRequest,
    );
  } else if (name === "anydb_create_workflow") {
    const normalized = normalizeStructuredArgument(args, "workflow", name);
    result = await client.createWorkflow(
      normalized as unknown as CreateWorkflowRequest,
    );
  } else {
    throw new Error(`Unknown solution authoring tool: ${name}`);
  }
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
  };
}
