import type { Tool } from "@modelcontextprotocol/sdk/types.js";

import type { ExtApiClient } from "./ext-api-client.js";

export const SOLUTION_DISCOVERY_TOOLS: Tool[] = [
  {
    name: "anydb_discover_types",
    description:
      "Retrieve semantically plausible reusable AnyDB type candidates before designing a new type. For authoring, search source=workspace first; search source=builtin only when no workspace candidate is compatible. Candidate names, descriptions, categories, and ranking are hints, not proof of compatibility: call anydb_get_type_definition for plausible candidates and compare their complete fields, schema, relationships, formulas, and behavior with the requested role before reuse or import. Use source=all only for general exploration.",
    inputSchema: {
      type: "object",
      properties: {
        teamid: { type: "string", description: "The team ID" },
        adbid: { type: "string", description: "The database ID" },
        search: {
          type: "string",
          description:
            "One concise type concept or a comma-separated set of related names and synonyms. Discovery returns candidates to inspect; it does not confirm schema compatibility.",
        },
        source: {
          type: "string",
          enum: ["workspace", "builtin", "all"],
          description: "Catalogs to search; defaults to all",
          default: "all",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 50,
          description: "Maximum candidates per source; defaults to 20",
          default: 20,
        },
      },
      required: ["teamid", "adbid", "search"],
    },
  },
  {
    name: "anydb_get_type_definition",
    description:
      "Get the latest complete definition of a workspace or built-in type by its stable name. Use it to judge reuse from semantic content and behavior, not the candidate name, description, or search score. Use the candidate name returned by anydb_discover_types, never a version-specific template ID.",
    inputSchema: {
      type: "object",
      properties: {
        teamid: { type: "string", description: "The team ID" },
        adbid: { type: "string", description: "The database ID" },
        templateName: {
          type: "string",
          description: "The stable candidate name returned by discovery",
        },
        source: {
          type: "string",
          enum: ["workspace", "builtin"],
          description: "The candidate source returned by discovery",
        },
      },
      required: ["teamid", "adbid", "templateName", "source"],
    },
  },
  {
    name: "anydb_list_workflows",
    description:
      "List normalized workflow graphs in a database before creating automation, so an existing workflow can be reused and duplicate behavior avoided.",
    inputSchema: {
      type: "object",
      properties: {
        teamid: { type: "string", description: "The team ID" },
        adbid: { type: "string", description: "The database ID" },
      },
      required: ["teamid", "adbid"],
    },
  },
  {
    name: "anydb_get_workflow",
    description:
      "Get one workflow's normalized trigger/action graph and retained execution records, including per-artifact status, outputs, and errors. Each action's stored config is returned, so an action_script entry exposes its current source at config.script; read it before reviewing or revising that script rather than inferring behavior from the workflow name. Use this to diagnose whether a workflow fired and what happened, including script diagnostics at executionHistory[].artifactExecutions[].output.logLines. Use a workflowId returned by anydb_list_workflows or anydb_create_workflow.",
    inputSchema: {
      type: "object",
      properties: {
        teamid: { type: "string", description: "The team ID" },
        adbid: { type: "string", description: "The database ID" },
        workflowId: {
          type: "string",
          description: "The workflow ID returned by discovery or creation",
        },
      },
      required: ["teamid", "adbid", "workflowId"],
    },
  },
  {
    name: "anydb_get_workflow_execution_history",
    description:
      "Get the retained execution records for one workflow, including per-artifact status, outputs, and errors. Returns an empty array when the workflow has not run. Use a workflowId returned by anydb_list_workflows or anydb_create_workflow.",
    inputSchema: {
      type: "object",
      properties: {
        teamid: { type: "string", description: "The team ID" },
        adbid: { type: "string", description: "The database ID" },
        workflowId: {
          type: "string",
          description: "The workflow ID returned by discovery or creation",
        },
      },
      required: ["teamid", "adbid", "workflowId"],
    },
  },
];

const DISCOVERY_TOOL_NAMES = new Set(
  SOLUTION_DISCOVERY_TOOLS.map((tool) => tool.name),
);

export function isSolutionDiscoveryTool(name: string): boolean {
  return DISCOVERY_TOOL_NAMES.has(name);
}

function requiredString(
  args: Record<string, unknown> | undefined,
  name: string,
): string {
  const value = args?.[name];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function textResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}

export async function callSolutionDiscoveryTool(
  name: string,
  args: Record<string, unknown> | undefined,
  client: ExtApiClient,
) {
  const teamid = requiredString(args, "teamid");
  const adbid = requiredString(args, "adbid");

  switch (name) {
    case "anydb_discover_types": {
      const search = requiredString(args, "search");
      const source = args?.source as
        | "workspace"
        | "builtin"
        | "all"
        | undefined;
      const limit = args?.limit as number | undefined;
      if (source && !["workspace", "builtin", "all"].includes(source)) {
        throw new Error("source must be workspace, builtin, or all");
      }
      if (
        limit !== undefined &&
        (!Number.isInteger(limit) || limit < 1 || limit > 50)
      ) {
        throw new Error("limit must be an integer from 1 to 50");
      }
      return textResult(
        await client.discoverTypes({ teamid, adbid, search, source, limit }),
      );
    }
    case "anydb_get_type_definition": {
      const templateName = requiredString(args, "templateName");
      const source = requiredString(args, "source");
      if (source !== "workspace" && source !== "builtin") {
        throw new Error("source must be workspace or builtin");
      }
      return textResult(
        await client.getTypeDefinition({
          teamid,
          adbid,
          templateName,
          source,
        }),
      );
    }
    case "anydb_list_workflows":
      return textResult(await client.listWorkflows(teamid, adbid));
    case "anydb_get_workflow": {
      const workflowId = requiredString(args, "workflowId");
      return textResult(await client.getWorkflow(teamid, adbid, workflowId));
    }
    case "anydb_get_workflow_execution_history": {
      const workflowId = requiredString(args, "workflowId");
      return textResult(
        await client.getWorkflowExecutionHistory(teamid, adbid, workflowId),
      );
    }
    default:
      throw new Error(`Unknown solution discovery tool: ${name}`);
  }
}
