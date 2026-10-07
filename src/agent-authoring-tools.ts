import type { Tool } from "@modelcontextprotocol/sdk/types.js";

import type { ExtApiClient } from "./ext-api-client.js";
import { toolJson } from "./result-format.js";

/**
 * ISSUE - 506. Authoring custom workflow agents (ISSUE - 485) from MCP.
 *
 * These are the same operations the browser's Custom Agents tab performs, over the same service, so every
 * rule still applies on the server: workspace admin access, a Business or Enterprise plan, AI credits, and the
 * mandatory exact-revision validation and trial before an agent can be published. They add no capability:
 * what an agent may DO is only what its saved scope allows (recipients, reports, document templates).
 *
 * Not to be confused with the anydb_agent_* tools, which are what a RUNNING agent calls.
 */
const id = { type: "string", description: "A MongoDB ObjectId." } as const;
const teamid = { ...id, description: "The team ID (MongoDB ObjectId)." } as const;
const adbid = { ...id, description: "The workspace (database) ID (MongoDB ObjectId)." } as const;
const agentid = { type: "string", format: "uuid", description: "The agent id (a UUID), from anydb_list_agents or anydb_save_agent." } as const;

const lifecycle =
  "Lifecycle: anydb_save_agent (draft) -> anydb_validate_agent -> anydb_test_agent -> anydb_publish_agent, then run or enable it with the workflow tools using the agent's workflowId (anydb_execute_workflow, anydb_update_workflow). Editing any behaviour-changing setting creates a new draft revision that must be validated and tested again.";

const recipients = {
  type: "array",
  maxItems: 25,
  items: { type: "string", format: "email" },
  description: "The ONLY people the agent may email, any address. The agent cannot email anyone else whatever its prompt says.",
} as const;

export const AGENT_AUTHORING_TOOLS: Tool[] = [
  {
    name: "anydb_save_agent",
    description:
      "Create or update a custom workflow agent DRAFT in a workspace. A custom agent is an AI that runs on a trigger, reads data through AnyDB tools, and can only do what its saved scope allows. Omit configuration.id to create; to update pass the id and the version from the last read (a stale version is refused with a conflict, so nothing is overwritten). Saving never runs the agent and never spends AI tokens. Requires workspace admin access and a Business or Enterprise plan. The agent runs as YOU (the saver), with your access. " +
      "promptReferences bind a person, record, type or field to the prompt by id, as an @mention does in the browser; send the draft's promptReferences back unchanged when you update it: a prompt that keeps its [[ref:]] markers without them is refused. mutationScope is the whole of what the agent may change or send: fields (writable cell positions), recordIds (records it may target), emailRecipients (who it may email) and artifacts {reports, docgenTemplates} (the only reports and document templates it may email). An agent with no mutationScope can only read. To email a plain-text summary it wrote itself, set emailRecipients; to email a report export set artifacts.reports too (see anydb_email_report for the rules). " +
      lifecycle,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        teamid,
        adbid,
        configuration: {
          type: "object",
          additionalProperties: false,
          description: "The agent's settings. Unknown settings are refused; identity, model and mode cannot be set here.",
          properties: {
            id: { ...agentid, description: "Only to update an existing draft; omit to create one." },
            version: { type: "integer", minimum: 1, description: "Required with id: the draft version you last read." },
            displayName: { type: "string", maxLength: 200, description: "A short name." },
            prompt: { type: "string", maxLength: 20000, description: "What the agent should do, in plain business language. It may not override the safety contract. The workspace ids and record ids are supplied by the runtime; give the exact type and cell names it should use, what each group or outcome means, how to stop if something fails, and, if it emails, to send exactly once. See the solution guide, Writing the prompt." },
            promptReferences: {
              type: "array",
              maxItems: 50,
              description:
                "What the prompt mentions, bound by id (the browser's @mentions). Each entry has a fresh UUID key that appears in the prompt exactly once as [[ref:<key>]] where the mention belongs; every marker needs an entry and every entry a marker. kind user takes userid, record takes adoid, type takes templateId, field takes templateId and position (such as A1), triggering_record takes nothing. label is the text shown for it. Omit when the prompt mentions nothing; on update, send the list from anydb_get_agent back; markers left without their entries are refused with \"Prompt reference markers and unique bindings must match\".",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  key: { type: "string", format: "uuid" },
                  kind: { type: "string", enum: ["user", "record", "type", "field", "triggering_record"] },
                  label: { type: "string", maxLength: 200 },
                  userid: { type: "string" },
                  adoid: { type: "string" },
                  templateId: { type: "string" },
                  position: { type: "string", pattern: "^[A-Z]+[1-9][0-9]*$" },
                },
                required: ["key", "kind"],
              },
            },
            authoringTrigger: {
              type: "object",
              additionalProperties: false,
              description: "When it runs. trigger_manual runs only when executed; trigger_on_schedule needs inputProperties for the schedule.",
              properties: {
                triggerType: {
                  type: "string",
                  enum: ["trigger_manual", "trigger_on_schedule", "trigger_on_record_create", "trigger_on_record_update", "trigger_on_form_submit", "trigger_plugin_event"],
                },
                inputProperties: { type: "object", additionalProperties: true, description: "The trigger's own settings; {} for trigger_manual." },
              },
              required: ["triggerType", "inputProperties"],
            },
            mutationScope: {
              type: "object",
              additionalProperties: false,
              description: "What the agent may change or send. Omit for a read-only agent.",
              properties: {
                fields: { type: "array", maxItems: 100, items: { type: "string", pattern: "^[A-Z]+[1-9][0-9]*$" }, description: "Writable cell positions such as A1. [] = none." },
                emailRecipients: recipients,
                recordIds: { type: "array", maxItems: 25, items: { type: "string" }, description: "Records the agent may target besides its triggering record." },
                artifacts: {
                  type: "object",
                  additionalProperties: false,
                  description: "The only reports and document templates the agent may email (up to 10 each).",
                  properties: {
                    reports: { type: "array", maxItems: 10, items: { type: "string" }, description: "Report ids, from anydb_list_reports." },
                    docgenTemplates: { type: "array", maxItems: 10, items: { type: "string" }, description: "Document template ids, from anydb_list_docgen_templates." },
                  },
                },
                createRecords: { type: "array", maxItems: 10, description: "Rules for the typed child records the agent may create (advanced; see the authoring guide).", items: { type: "object", additionalProperties: true } },
              },
              required: ["fields", "emailRecipients"],
            },
            requiredTools: { type: "array", maxItems: 20, items: { type: "string" }, description: "Tools the agent must have; validation fails if one is unsupported." },
            limits: {
              type: "object",
              additionalProperties: false,
              description: "Bounds on one run. Defaults: 25 model turns, 30 tool calls, 120 s, 50,000 tokens.",
              properties: {
                maxTurns: { type: "integer", minimum: 1, maximum: 25 },
                maxToolCalls: { type: "integer", minimum: 1, maximum: 100 },
                timeoutMs: { type: "integer", minimum: 1000, maximum: 300000 },
                maxTokens: { type: "integer", minimum: 1, maximum: 200000 },
              },
            },
          },
          required: ["prompt"],
        },
      },
      required: ["teamid", "adbid", "configuration"],
    },
  },
  {
    name: "anydb_list_agents",
    description:
      "List the custom workflow agent drafts in a workspace: id, version, name, whether the prompt is complete, the latest validation and trial result, and the linked workflow. Page with limit and cursor. Requires workspace admin access.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        teamid,
        adbid,
        limit: { type: "integer", minimum: 1, maximum: 100, description: "Page size, default 25." },
        cursor: { type: "string", description: "The cursor from the previous page." },
      },
      required: ["teamid", "adbid"],
    },
  },
  {
    name: "anydb_get_agent",
    description:
      "Read one custom agent draft: its full settings (prompt, trigger, saved scope), version, the validation and trial evidence for the current revision, what is published, and the workflowId used to run or enable it. Use this to get the version before updating with anydb_save_agent.",
    inputSchema: { type: "object", additionalProperties: false, properties: { teamid, adbid, agentid }, required: ["teamid", "adbid", "agentid"] },
  },
  {
    name: "anydb_validate_agent",
    description:
      "Validate an agent draft: an AI reviews the prompt for clarity, scope and supported capabilities and returns an assessment, suggestions and any blocking clarification questions. THIS SPENDS REAL AI TOKENS from the team's credits and takes up to a couple of minutes. It does not run the task, change data or send anything. A blocking question means the validation did not pass: answer it by editing the prompt (anydb_save_agent) and validate again. The feedback may include revisedPrompts: up to three complete rewrites of the prompt that apply the review, exactly one marked recommended. Offer them to the user, recommended first; to apply one, save it as the prompt with anydb_save_agent (keep the draft's other settings and promptReferences) and validate again. The result applies only to the exact current revision. " +
      lifecycle,
    inputSchema: { type: "object", additionalProperties: false, properties: { teamid, adbid, agentid }, required: ["teamid", "adbid", "agentid"] },
  },
  {
    name: "anydb_test_agent",
    description:
      "Run the agent as a TEST: it uses the real tools and reads real data, but every write and email is a server-controlled preview (state simulated), nothing is sent and the report is not run. THIS SPENDS REAL AI TOKENS. The trial is mandatory before publishing and applies only to the exact current revision; a clean test proves the agent completed, not that its output is right, so read the run with anydb_get_agent_run. fixture (optional) supplies trigger values and assertions about the tools it must call.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        teamid,
        adbid,
        agentid,
        fixture: { type: "object", additionalProperties: true, description: "Optional: { trigger: {...}, assertions: [...] }. Omit for a plain trial." },
      },
      required: ["teamid", "adbid", "agentid"],
    },
  },
  {
    name: "anydb_publish_agent",
    description:
      "Publish a draft so it can run live. Refused unless the SAME revision has a successful user-initiated validation and a successful trial; you cannot supply that proof, the server loads it. version must be the draft's current version (from anydb_get_agent). Publishing does not run the agent and does not start its schedule unless enable is true: without it a new workflow is left disabled and an existing one keeps its state, so nothing is emailed until you start it (enable: true here, or anydb_update_workflow with enabled true) or run it once with anydb_execute_workflow using its workflowId (from anydb_get_agent). Once running, a live run does what the saved scope allows, including emailing the saved recipients.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        teamid, adbid, agentid,
        version: { type: "integer", minimum: 1, description: "The draft version to publish." },
        enable: { type: "boolean", description: "true also starts the agent's schedule or trigger. Omit to leave it as it is (a new agent is created off)." },
      },
      required: ["teamid", "adbid", "agentid", "version"],
    },
  },
  {
    name: "anydb_delete_agent",
    description:
      "Delete an agent. This cannot be undone. It removes the draft and the workflow that publishing created for it, and stops every published revision from running. Its past runs stay readable (with anydb_get_agent_run) until they expire. Refused while another workflow still uses the agent: the error names those workflows; remove the agent from them first. version must be the draft's current version (from anydb_get_agent). Requires workspace admin access.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        teamid, adbid, agentid,
        version: { type: "integer", minimum: 1, description: "The draft's current version." },
      },
      required: ["teamid", "adbid", "agentid", "version"],
    },
  },
  {
    name: "anydb_list_agent_runs",
    description:
      "List runs of custom agents in a workspace (validation, test and live), newest first, optionally for one agent: status, reason code, mode and usage. Use it to see what an agent did.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        teamid,
        adbid,
        agentid: { ...agentid, description: "Only this agent's runs." },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        cursor: { type: "string" },
      },
      required: ["teamid", "adbid"],
    },
  },
  {
    name: "anydb_get_agent_run",
    description:
      "Read one agent run. By default a short summary: outcome, the reason it stopped, each tool call with its status and error, the email text and record changes it made or previewed (state simulated, applied, sent, failed, unknown), token usage and cost. Pass detail full for every tool call with its arguments and results, which can be 80 KB or more. The model's own summary is an explanation; the tool calls are the evidence. Large runs are paged: pass page (0 first).",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        teamid, adbid,
        runid: { type: "string", description: "The run id from anydb_list_agent_runs or a validate/test result." },
        detail: { type: "string", enum: ["summary", "full"], description: "summary (default): outcome, why it stopped, each tool call with its status and error, the emails and changes, usage; no tool results. full: every tool call with its arguments and results, which can be 80 KB or more." },
        page: { type: "integer", minimum: 0, description: "With detail full, the page of the run to read." },
      },
      required: ["teamid", "adbid", "runid"],
    },
  },
];

/**
 * ISSUE - 514. A run with two 100-record searches reads back as 80 KB, more than most clients take, so a caller could
 * not see why it stopped. The summary keeps what answers "what happened and why": the outcome, every call with its
 * status and error (arguments shortened, results reduced to their size), the emails and changes, usage and what the
 * trial checked. detail "full" is the whole run.
 */
const clip = (value: unknown, max = 200): unknown => {
  if (typeof value === "string") return value.length > max ? `${value.slice(0, max)}… (${value.length} characters)` : value;
  if (Array.isArray(value)) return value.slice(0, 10).map((item) => clip(item, max));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clip(item, max)]));
  return value;
};
export function summariseAgentRun(run: any): unknown {
  if (!run || typeof run !== "object") return run;
  const latest = new Map<string, any>();
  for (const event of Array.isArray(run.events) ? run.events : []) {
    const call = event?.call;
    if (call?.id) latest.set(call.id, call); // a call is journaled as running, then as success or failure
  }
  const toolCalls = [...latest.values()].map((call) => {
    const size = call.result === undefined ? undefined : typeof call.result === "string" ? call.result.length : JSON.stringify(call.result).length;
    return {
      id: call.id, name: call.name, status: call.status,
      ...(call.error ? { error: call.error } : {}),
      arguments: clip(call.arguments),
      ...(size !== undefined ? { resultBytes: size } : {}),
    };
  });
  const operations = (Array.isArray(run.operations) ? run.operations : []).map((operation: any) => ({
    kind: operation.kind,
    state: operation.result?.state,
    ...(operation.result?.error ? { error: operation.result.error } : {}),
    ...(operation.input?.to ? { to: operation.input.to } : {}),
    ...(operation.input?.subject ? { subject: operation.input.subject } : {}),
    ...(operation.input?.body ? { body: operation.input.body } : {}),
    ...(operation.input?.values ? { values: clip(operation.input.values) } : {}),
    receipt: operation.result?.receipt,
  }));
  const result = run.result ?? {};
  return {
    runId: run.header?.runId ?? result.runId,
    mode: run.header?.mode ?? result.mode,
    status: run.status ?? result.status,
    reasonCode: result.reasonCode,
    summary: result.summary,
    ...(result.issues?.length ? { issues: result.issues } : {}),
    ...(result.validationFeedback ? { validationFeedback: result.validationFeedback } : {}),
    partialEffects: run.partialEffects,
    startedAt: result.startedAt ?? run.header?.startedAt,
    completedAt: result.completedAt,
    model: result.model,
    usage: result.usage,
    toolCalls,
    operations,
    trialAssertions: run.trialAssertions ?? undefined,
    evidenceReferences: Array.isArray(run.evidenceReferences) ? run.evidenceReferences.length : undefined,
    unverifiableEvidence: run.unverifiableEvidence,
    nextPage: run.nextPage ?? null,
    note: "Summary. Tool results are left out; call again with detail full for every tool call with its arguments and results.",
  };
}

const NAMES = new Set(AGENT_AUTHORING_TOOLS.map((tool) => tool.name));
export const isAgentAuthoringTool = (name: string): boolean => NAMES.has(name);

export async function callAgentAuthoringTool(name: string, args: Record<string, any> | undefined, client: ExtApiClient) {
  const a = args ?? {};
  const scope = { teamid: a.teamid as string, adbid: a.adbid as string };
  let result: unknown;
  switch (name) {
    case "anydb_save_agent":
      result = await client.saveAgentDraft({ ...scope, configuration: a.configuration });
      break;
    case "anydb_list_agents":
      result = await client.listAgentDrafts({ ...scope, ...(a.limit !== undefined ? { limit: a.limit } : {}), ...(a.cursor ? { cursor: a.cursor } : {}) });
      break;
    case "anydb_get_agent":
      result = await client.getAgentDraft({ ...scope, agentid: a.agentid });
      break;
    case "anydb_validate_agent":
      result = await client.validateAgent({ ...scope, agentid: a.agentid });
      break;
    case "anydb_test_agent":
      result = await client.testAgent({ ...scope, agentid: a.agentid, ...(a.fixture !== undefined ? { fixture: a.fixture } : {}) });
      break;
    case "anydb_publish_agent":
      result = await client.publishAgent({ ...scope, agentid: a.agentid, version: a.version, ...(a.enable === undefined ? {} : { enable: a.enable }) });
      break;
    case "anydb_delete_agent":
      result = await client.deleteAgent({ ...scope, agentid: a.agentid, version: a.version });
      break;
    case "anydb_list_agent_runs":
      result = await client.listAgentRuns({ ...scope, ...(a.agentid ? { agentid: a.agentid } : {}), ...(a.limit !== undefined ? { limit: a.limit } : {}), ...(a.cursor ? { cursor: a.cursor } : {}) });
      break;
    case "anydb_get_agent_run":
      {
        const run = await client.getAgentRun({ ...scope, runid: a.runid, ...(a.page !== undefined ? { page: a.page } : {}) });
        result = a.detail === "full" ? run : summariseAgentRun(run);
      }
      break;
    default:
      throw new Error(`Unknown agent authoring tool ${name}`);
  }
  return { content: [{ type: "text" as const, text: toolJson(result, client.getOriginClient()) }] };
}
