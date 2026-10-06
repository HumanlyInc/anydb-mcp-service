import type { Tool } from "@modelcontextprotocol/sdk/types.js";

import type { ExtApiClient } from "./ext-api-client.js";
import { toolJson } from "./result-format.js";

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
      "Get the latest complete definition of a workspace or built-in type by its stable name. Use it to judge reuse from semantic content and behavior, not the candidate name, description, or search score. Use templateId for the exact stored workspace schema referenced by agent chips or creation scope; it is mutually exclusive with templateName and only accepts workspace source. Otherwise use the candidate name returned by anydb_discover_types. A workspace definition also returns revision, the value anydb_update_type takes as expectedRevision.",
    inputSchema: {
      type: "object",
      properties: {
        teamid: { type: "string", description: "The team ID" },
        adbid: { type: "string", description: "The database ID" },
        templateName: {
          type: "string",
          description: "The stable candidate name returned by discovery",
        },
        templateId: {type:"string",description:"Exact stored workspace type ID from an authorized prompt binding or saved creation rule; excludes templateName"},
        source: {
          type: "string",
          enum: ["workspace", "builtin"],
          description: "The candidate source returned by discovery",
        },
      },
      required: ["teamid", "adbid"],
      oneOf: [{required:["templateId"],not:{required:["templateName"]}},{required:["templateName","source"],not:{required:["templateId"]}}],
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
      "Get one workflow's normalized trigger/action graph and its most recent execution records, including per-artifact status, outputs, and errors. Runs are newest first; by default only the latest 3 are returned, because each can carry script log lines and a workflow that has run is otherwise tens of KB. Pass historyLimit (0-10) for more or none - 0 when you only need the definition, e.g. before revising a script. executionHistoryTotal says how many runs are retained; anydb_get_workflow_execution_history returns them all. Each action's stored config is returned, so an action_script entry exposes its current source at config.script; read it before reviewing or revising that script rather than inferring behavior from the workflow name. Use this to diagnose whether a workflow fired and what happened, including script diagnostics at executionHistory[].artifactExecutions[].output: logLines holds the script's own log() lines, and a failed run also carries error (a timeout names the anydb call it was waiting on) and trace (its last anydb.* calls, recorded even when the script never called log()). Use a workflowId returned by anydb_list_workflows or anydb_create_workflow.",
    inputSchema: {
      type: "object",
      properties: {
        teamid: { type: "string", description: "The team ID" },
        adbid: { type: "string", description: "The database ID" },
        workflowId: {
          type: "string",
          description: "The workflow ID returned by discovery or creation",
        },
        historyLimit: {
          type: "integer",
          minimum: 0,
          maximum: 10,
          description:
            "Optional. How many of the newest runs to include in executionHistory, 0-10. Defaults to 3.",
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

// ISSUE - 387: every retained run (up to 10, with script log lines) made this
// answer tens of KB - over a client's result cap - for one small workflow.
const DEFAULT_WORKFLOW_HISTORY_LIMIT = 3;

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

function textResult(origin: string | undefined, value: unknown) {
  return {
    content: [{ type: "text" as const, text: toolJson(value, origin) }],
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
      return textResult(client.getOriginClient?.(), 
        await client.discoverTypes({ teamid, adbid, search, source, limit }),
      );
    }
    case "anydb_get_type_definition": {
      const templateId=args?.templateId === undefined ? undefined : requiredString(args,"templateId");
      if(templateId && args?.templateName !== undefined) throw new Error("templateId and templateName are mutually exclusive");
      const templateName=templateId ? undefined : requiredString(args,"templateName");
      const source=templateId && args?.source === undefined ? "workspace" : requiredString(args,"source");
      if (source !== "workspace" && source !== "builtin") throw new Error("source must be workspace or builtin");
      if(templateId && source !== "workspace") throw new Error("templateId requires workspace source");
      return textResult(client.getOriginClient?.(),await client.getTypeDefinition({teamid,adbid,...(templateId ? {templateId} : {templateName}),source}));
    }
    case "anydb_list_workflows":
      return textResult(client.getOriginClient?.(), await client.listWorkflows(teamid, adbid));
    case "anydb_get_workflow": {
      const workflowId = requiredString(args, "workflowId");
      const historyLimit = args?.historyLimit ?? DEFAULT_WORKFLOW_HISTORY_LIMIT;
      if (
        typeof historyLimit !== "number" ||
        !Number.isInteger(historyLimit) ||
        historyLimit < 0 ||
        historyLimit > 10
      ) {
        throw new Error("historyLimit must be an integer from 0 to 10");
      }
      return textResult(
        client.getOriginClient?.(),
        await client.getWorkflow(teamid, adbid, workflowId, historyLimit),
      );
    }
    case "anydb_get_workflow_execution_history": {
      const workflowId = requiredString(args, "workflowId");
      return textResult(client.getOriginClient?.(), 
        await client.getWorkflowExecutionHistory(teamid, adbid, workflowId),
      );
    }
    default:
      throw new Error(`Unknown solution discovery tool: ${name}`);
  }
}
