import type { Tool } from "@modelcontextprotocol/sdk/types.js";

import type {
  CreateShareRequest,
  CreateTypeRequest,
  CreateViewRequest,
  CreateWorkspaceRequest,
  CreateWorkflowRequest,
  DeleteViewRequest,
  ExecuteWorkflowRequest,
  ExtApiClient,
  RevokeShareRequest,
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
    createWorkspaceInput: Record<string, unknown>;
    createTypeInput: Record<string, unknown>;
    createViewInput: Record<string, unknown>;
    updateViewInput: Record<string, unknown>;
    listViewsInput: Record<string, unknown>;
    getViewInput: Record<string, unknown>;
    deleteViewInput: Record<string, unknown>;
    createShareInput: Record<string, unknown>;
    listSharesInput: Record<string, unknown>;
    getShareInput: Record<string, unknown>;
    revokeShareInput: Record<string, unknown>;
    listTeamGroupsInput: Record<string, unknown>;
    updateTypeInput: Record<string, unknown>;
    getTypeMigrationStatusInput: Record<string, unknown>;
    createWorkflowInput: Record<string, unknown>;
    updateWorkflowInput: Record<string, unknown>;
    executeWorkflowInput: Record<string, unknown>;
  };
};

function inlineLocalSchemaRefs(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(inlineLocalSchemaRefs);
  if (!schema || typeof schema !== "object") return schema;

  const object = schema as Record<string, unknown>;
  const ref = object.$ref;
  if (typeof ref === "string" && ref.startsWith("#/$defs/")) {
    const path = ref.slice("#/$defs/".length).split("/");
    let resolved: unknown = authoringSchema.$defs;
    for (const segment of path) {
      resolved = (resolved as Record<string, unknown>)?.[segment];
    }
    if (!resolved)
      throw new Error(`Unknown authoring schema reference: ${ref}`);
    const { $ref: _ref, ...siblings } = object;
    return inlineLocalSchemaRefs({
      ...(resolved as Record<string, unknown>),
      ...siblings,
    });
  }

  return Object.fromEntries(
    Object.entries(object)
      .filter(([key]) => key !== "$defs")
      .map(([key, value]) => [key, inlineLocalSchemaRefs(value)]),
  );
}

function exposedInputSchema(name: string): Record<string, unknown> {
  return inlineLocalSchemaRefs(authoringSchema.$defs[name]) as Record<
    string,
    unknown
  >;
}

const createTypeInputSchema = exposedInputSchema("createTypeInput");

const createWorkspaceInputSchema = exposedInputSchema("createWorkspaceInput");

const updateTypeInputSchema = exposedInputSchema("updateTypeInput");

const getTypeMigrationStatusInputSchema = exposedInputSchema(
  "getTypeMigrationStatusInput",
);

const createViewInputSchema = exposedInputSchema("createViewInput");

const updateViewInputSchema = exposedInputSchema("updateViewInput");

const listViewsInputSchema = exposedInputSchema("listViewsInput");

const getViewInputSchema = exposedInputSchema("getViewInput");

const deleteViewInputSchema = exposedInputSchema("deleteViewInput");

const createShareInputSchema = exposedInputSchema("createShareInput");

const listSharesInputSchema = exposedInputSchema("listSharesInput");

const getShareInputSchema = exposedInputSchema("getShareInput");

const revokeShareInputSchema = exposedInputSchema("revokeShareInput");

const listTeamGroupsInputSchema = exposedInputSchema("listTeamGroupsInput");

const createWorkflowInputSchema = exposedInputSchema("createWorkflowInput");

const updateWorkflowInputSchema = exposedInputSchema("updateWorkflowInput");

const executeWorkflowInputSchema = exposedInputSchema("executeWorkflowInput");

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
    name: "anydb_get_type_migration_status",
    description:
      "Poll a queued type migration by the jobId returned from anydb_update_type. Returns processed, total, and remaining record counts from cached job progress without rescanning workspace records.",
    inputSchema:
      getTypeMigrationStatusInputSchema as unknown as Tool["inputSchema"],
  },
  {
    name: "anydb_create_workflow",
    description: `Read the authoring guide, then call anydb_list_workflow_triggers and anydb_list_workflow_actions before authoring. Create one supported trigger followed by an ordered chain of registered actions. Prefer one script action when the team license permits it and that is the simplest design. Use action keys and symbolic output bindings; the server generates runtime artifact IDs and connections. After creation, run one representative case and inspect anydb_get_workflow or anydb_get_workflow_execution_history before considering the automation verified.`,
    inputSchema: createWorkflowInputSchema as unknown as Tool["inputSchema"],
  },
  {
    name: "anydb_update_workflow",
    description:
      "Update an existing workflow's metadata and/or replace its complete ordered action chain. Call anydb_list_workflow_actions first and follow each action inputSchema.required list plus its contextual guidance. Omit changes.actions to preserve actions. To add, update, remove, or reorder actions, provide the desired final chain using registered action types and symbolic bindings, then execute a simulation to verify it.",
    inputSchema: updateWorkflowInputSchema as unknown as Tool["inputSchema"],
  },
  {
    name: "anydb_execute_workflow",
    description:
      "Execute an existing workflow. Set simulate=true to dry-run without side effects, or simulate=false for normal execution. Supply adoid when the workflow requires record context. Inspect the returned latest execution for artifact outputs and errors.",
    inputSchema: executeWorkflowInputSchema as unknown as Tool["inputSchema"],
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
      "Create a filtered View using stable workspace type names. Call anydb_list_views first and reuse or update a compatible View instead of creating a duplicate. Use scope workspace to attach the View to the database root and scope children with parentRecordId for matching direct children.",
    inputSchema: createViewInputSchema as unknown as Tool["inputSchema"],
  },
  {
    name: "anydb_update_view",
    description:
      "Update an existing filtered View by viewId. Change its name and/or replace its complete targets and filter set using stable workspace type names. Omit changes.targets to preserve existing criteria. View placement is immutable; create another View to change between workspace and children scope.",
    inputSchema: updateViewInputSchema as unknown as Tool["inputSchema"],
  },
  {
    name: "anydb_list_views",
    description:
      "List accessible Views in a database with decoded scope, parent, stable target type names, and structured filters. Call before creating a View to avoid duplicates.",
    inputSchema: listViewsInputSchema as unknown as Tool["inputSchema"],
  },
  {
    name: "anydb_get_view",
    description:
      "Get one accessible View by viewId with its complete decoded targets and filters.",
    inputSchema: getViewInputSchema as unknown as Tool["inputSchema"],
  },
  {
    name: "anydb_delete_view",
    description:
      "Permanently delete a View by viewId through standard record authorization. Use for cleanup only after confirming the exact View with anydb_get_view.",
    inputSchema: deleteViewInputSchema as unknown as Tool["inputSchema"],
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
      'Create a public or private share for a record or form through standard AnyDB sharing policy. Use target {kind: "record", recordId: "<adoid>"} for an existing record, or {kind: "form", templateName: "<stable type name>"} for a form (optionally with parentRecordId). Call anydb_list_shares first to reuse an existing compatible share. Public shares omit recipients and return publicUrl. Private shares require emails and/or stable group names from anydb_list_team_groups. role and withAttachments apply only to records.',
    inputSchema: createShareInputSchema as unknown as Tool["inputSchema"],
  },
  {
    name: "anydb_list_shares",
    description:
      "List accessible shares in a database as semantic record/form facets, including target, privacy, recipient counts/groups, and publicUrl where applicable. Call before creating a share to avoid duplicate public links.",
    inputSchema: listSharesInputSchema as unknown as Tool["inputSchema"],
  },
  {
    name: "anydb_get_share",
    description:
      "Get one accessible record or form share facet by shareId and kind. The kind is required because one internal share can contain both facets.",
    inputSchema: getShareInputSchema as unknown as Tool["inputSchema"],
  },
  {
    name: "anydb_revoke_share",
    description:
      "Revoke one record or form share facet by shareId and kind. This removes its access/public link and preserves a different facet on the same internal share. Use after anydb_get_share confirms the exact target.",
    inputSchema: revokeShareInputSchema as unknown as Tool["inputSchema"],
  },
  {
    name: "anydb_create_workspace",
    description:
      "Create a new empty AnyDB workspace in an existing team. Use only when the user explicitly requests a new workspace. The authenticated user must have permission to create workspaces in the team. Use the returned adbid in subsequent type, View, share, workflow, and record tools.",
    inputSchema: createWorkspaceInputSchema as unknown as Tool["inputSchema"],
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
  if (name === "anydb_create_workspace") {
    result = await client.createWorkspace(
      args as unknown as CreateWorkspaceRequest,
    );
  } else if (name === "anydb_create_type") {
    const normalized = normalizeStructuredArgument(args, "type", name);
    result = await client.createType(
      normalized as unknown as CreateTypeRequest,
    );
  } else if (name === "anydb_update_type") {
    const normalized = normalizeStructuredArgument(args, "changes", name);
    result = await client.updateType(
      normalized as unknown as UpdateTypeRequest,
    );
  } else if (name === "anydb_get_type_migration_status") {
    result = await client.getTypeMigrationStatus(
      String(args.teamid || ""),
      String(args.adbid || ""),
      Number(args.jobId),
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
  } else if (name === "anydb_execute_workflow") {
    result = await client.executeWorkflow(
      args as unknown as ExecuteWorkflowRequest,
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
  } else if (name === "anydb_list_views") {
    result = await client.listViews(
      String(args.teamid || ""),
      String(args.adbid || ""),
    );
  } else if (name === "anydb_get_view") {
    result = await client.getView(
      String(args.teamid || ""),
      String(args.adbid || ""),
      String(args.viewId || ""),
    );
  } else if (name === "anydb_delete_view") {
    result = await client.deleteView(args as unknown as DeleteViewRequest);
  } else if (name === "anydb_list_team_groups") {
    result = await client.listTeamGroups(String(args.teamid || ""));
  } else if (name === "anydb_create_share") {
    const normalized = normalizeStructuredArgument(args, "share", name);
    result = await client.createShare(
      normalized as unknown as CreateShareRequest,
    );
  } else if (name === "anydb_list_shares") {
    result = await client.listShares(
      String(args.teamid || ""),
      String(args.adbid || ""),
    );
  } else if (name === "anydb_get_share") {
    result = await client.getShare(
      String(args.teamid || ""),
      String(args.adbid || ""),
      String(args.shareId || ""),
      String(args.kind || "") as "record" | "form",
    );
  } else if (name === "anydb_revoke_share") {
    result = await client.revokeShare(args as unknown as RevokeShareRequest);
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
