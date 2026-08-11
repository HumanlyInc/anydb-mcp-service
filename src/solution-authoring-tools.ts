import type { Tool } from "@modelcontextprotocol/sdk/types.js";

import type {
  CreateShareRequest,
  CreateTypeRequest,
  CreateViewRequest,
  CreateWorkflowRequest,
  ExtApiClient,
  UpdateViewRequest,
  UpdateWorkflowRequest,
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
    createViewInput: Record<string, unknown>;
    updateViewInput: Record<string, unknown>;
    createShareInput: Record<string, unknown>;
    listTeamGroupsInput: Record<string, unknown>;
    updateTypeInput: Record<string, unknown>;
    createWorkflowInput: Record<string, unknown>;
    updateWorkflowInput: Record<string, unknown>;
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

const createViewInputSchema = {
  ...authoringSchema.$defs.createViewInput,
  $defs: authoringSchema.$defs,
};

const updateViewInputSchema = {
  ...authoringSchema.$defs.updateViewInput,
  $defs: authoringSchema.$defs,
};

const createShareInputSchema = {
  ...authoringSchema.$defs.createShareInput,
  $defs: authoringSchema.$defs,
};

const listTeamGroupsInputSchema = {
  ...authoringSchema.$defs.listTeamGroupsInput,
  $defs: authoringSchema.$defs,
};

const createWorkflowInputSchema = {
  ...authoringSchema.$defs.createWorkflowInput,
  $defs: authoringSchema.$defs,
};

const updateWorkflowInputSchema = {
  ...authoringSchema.$defs.updateWorkflowInput,
  $defs: authoringSchema.$defs,
};

const workflowCatalogInputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["teamid", "adbid"],
  properties: {
    teamid: authoringSchema.$defs.objectId,
    adbid: authoringSchema.$defs.objectId,
  },
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
    description: `Call anydb_get_authoring_guide before the first authoring call in a task. Before creating a standalone AnyDB type or a type in a larger solution, search workspace types and inspect complete definitions. Compare semantic content and behavior, not names or descriptions: fields, types/formats, relationships, formulas/lookups, and workflow-facing keys. Reuse compatible workspace content first; only if none exists, inspect and import a compatible built-in. Define a new type only when neither source can fulfill the use case. For new definitions, use the guide's canonical type-layout rules and provide every field's position, colspan, and rowspan.`,
    inputSchema: createTypeInputSchema as unknown as Tool["inputSchema"],
  },
  {
    name: "anydb_update_type",
    description: `Read the authoring guide (call anydb_get_authoring_guide) before the first authoring call in a task. Patch the latest revision of one workspace type by stable template name. Existing records are migrated automatically after persistence; destructive changes require explicit data-loss confirmation.`,
    inputSchema: updateTypeInputSchema as unknown as Tool["inputSchema"],
  },
  {
    name: "anydb_create_workflow",
    description: `Read the authoring guide, then call anydb_list_workflow_triggers and anydb_list_workflow_actions before authoring. Create one supported trigger followed by an ordered chain of registered actions. Prefer one script action when the team license permits it and that is the simplest design. Use action keys and symbolic output bindings; the server generates runtime artifact IDs and connections. After creation, run one representative case and inspect anydb_get_workflow or anydb_get_workflow_execution_history before considering the automation verified.`,
    inputSchema: createWorkflowInputSchema as unknown as Tool["inputSchema"],
  },
  {
    name: "anydb_update_workflow",
    description:
      "Update an existing workflow's name, description, or enabled state through the standard workflow service. Use the workflowId returned by workflow discovery or creation.",
    inputSchema: updateWorkflowInputSchema as unknown as Tool["inputSchema"],
  },
  {
    name: "anydb_list_workflow_triggers",
    description:
      "List server-supported workflow triggers with descriptions, output schemas, and whether each trigger is accepted by anydb_create_workflow. Each inputSchema is the exact object shape accepted at workflow.trigger.config; use those property names directly. Call before choosing a workflow trigger.",
    inputSchema: workflowCatalogInputSchema as Tool["inputSchema"],
  },
  {
    name: "anydb_list_workflow_actions",
    description:
      "List registered workflow actions with descriptions, exact input/output schemas, trigger compatibility, and whether each action is accepted by anydb_create_workflow. The action_script entry includes authoritative script runtime APIs and authoring rules.",
    inputSchema: workflowCatalogInputSchema as Tool["inputSchema"],
  },
  {
    name: "anydb_create_view",
    description:
      "Create a filtered View using stable workspace type names. Use scope workspace to attach the View to the database root and show selected root-level types. Use scope children with parentRecordId to show matching direct children of one record. Each target can define structured cell, meta, or badge filters; the server resolves type IDs and stores the native View criteria.",
    inputSchema: createViewInputSchema as unknown as Tool["inputSchema"],
  },
  {
    name: "anydb_update_view",
    description:
      "Update an existing filtered View by viewId. Change its name and/or replace its complete targets and filter set using stable workspace type names. Omit changes.targets to preserve existing criteria. View placement is immutable; create another View to change between workspace and children scope.",
    inputSchema: updateViewInputSchema as unknown as Tool["inputSchema"],
  },
  {
    name: "anydb_list_team_groups",
    description:
      "List team groups available to the authenticated user for private sharing. Use the returned stable group names in anydb_create_share; do not guess names or pass internal group IDs.",
    inputSchema: listTeamGroupsInputSchema as unknown as Tool["inputSchema"],
  },
  {
    name: "anydb_create_share",
    description:
      "Create a public or private share for a record or form through standard AnyDB sharing policy. Public shares omit recipients and return publicUrl. Private shares require email addresses and/or stable group names from anydb_list_team_groups. Forms use a stable templateName and default to the database root unless parentRecordId is supplied. role and withAttachments apply only to record shares.",
    inputSchema: createShareInputSchema as unknown as Tool["inputSchema"],
  },
];

export function isSolutionAuthoringTool(name: string): boolean {
  return SOLUTION_AUTHORING_TOOLS.some((tool) => tool.name === name);
}

function normalizeStructuredArgument(
  args: Record<string, unknown>,
  field: "type" | "changes" | "workflow" | "view" | "share",
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
  } else if (name === "anydb_update_workflow") {
    const normalized = normalizeStructuredArgument(args, "changes", name);
    result = await client.updateWorkflow(
      normalized as unknown as UpdateWorkflowRequest,
    );
  } else if (name === "anydb_create_view") {
    const normalized = normalizeStructuredArgument(args, "view", name);
    result = await client.createView(
      normalized as unknown as CreateViewRequest,
    );
  } else if (name === "anydb_update_view") {
    const normalized = normalizeStructuredArgument(args, "changes", name);
    result = await client.updateView(
      normalized as unknown as UpdateViewRequest,
    );
  } else if (name === "anydb_list_team_groups") {
    result = await client.listTeamGroups(String(args.teamid || ""));
  } else if (name === "anydb_create_share") {
    const normalized = normalizeStructuredArgument(args, "share", name);
    result = await client.createShare(
      normalized as unknown as CreateShareRequest,
    );
  } else if (name === "anydb_list_workflow_triggers") {
    result = await client.listWorkflowTriggers(
      String(args.teamid || ""),
      String(args.adbid || ""),
    );
  } else if (name === "anydb_list_workflow_actions") {
    result = await client.listWorkflowActions(
      String(args.teamid || ""),
      String(args.adbid || ""),
    );
  } else {
    throw new Error(`Unknown solution authoring tool: ${name}`);
  }
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
  };
}
