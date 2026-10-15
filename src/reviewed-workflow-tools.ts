import { z } from "zod";
import { readSolutionResource, SOLUTION_BUILDING_GUIDE_URI, SOLUTION_AUTHORING_SCHEMA_URI } from "./solution-resources.js";
import { authoringGuideText } from "./solution-authoring-tools.js";
import { readFileSync } from "node:fs";
import type { Tool, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import type { ExtApiClient, CreateWorkflowRequest, UpdateWorkflowRequest, ExecuteWorkflowRequest } from "./ext-api-client.js";
import { unknownArgumentsError } from "./tool-arguments.js";
import { toolJson } from "./result-format.js";

export type ToolProfile = "full" | "reviewed";
const catalog = JSON.parse(readFileSync(new URL("../resources/reviewed-workflow-actions.json", import.meta.url), "utf8")) as Array<{type: string; description: string; inputSchema: Tool["inputSchema"]}>;
const stepNames: Record<string, string> = {
  action_create: "create_record", action_update: "update_record", action_move: "move_record", action_copy: "copy_record", action_find: "find_records",
  action_formatted_export: "generate_document", action_send_email: "send_email", action_send_notification: "send_notification", action_call_webhook: "call_webhook", action_send_message: "send_message",
};
const objectId = { type: "string", pattern: "^[a-fA-F0-9]{24}$" };
const address = { teamid: objectId, adbid: objectId };
const workflowAddress = { ...address, workflowId: objectId };
const mutationAddress = { ...workflowAddress, clientRequestId: { type: "string", minLength: 1, maxLength: 200 } };
const stepKey = { type: "string", pattern: "^(?!trigger$)[A-Za-z][A-Za-z0-9_-]{0,79}$" };
function schema(properties: Record<string, any>, required = Object.keys(properties)): Tool["inputSchema"] {
  return { type: "object", additionalProperties: false, properties, required };
}
function tool(name: string, title: string, description: string, inputSchema: Tool["inputSchema"], annotations: Omit<ToolAnnotations,"title">): Tool {
  return { name, title, description, inputSchema, annotations: { title, ...annotations } };
}
const read = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const write = { readOnlyHint: false, destructiveHint: true, openWorldHint: true };
const workspaceWrite = { ...write, openWorldHint: false };

export const REVIEWED_WORKFLOW_GUIDE = `Workflow authoring uses explicit operations. Create a disabled draft, then use the named step tools to add or update a step by its stable key. Read anydb_get_workflow before editing an existing workflow; actions[].key identifies its steps. Symbolic bindings use {{trigger.field}} or {{stepKey.field}}. Remove and reorder steps with the named management tools. Preview before enabling, and inspect execution outputs. Enabling and running validate the entire stored action chain. Scripts, arbitrary installed-app operations, AI steps and custom-agent steps are unavailable in this interface; edit those in AnyDB or use the full MCP interface. Catalog entries describe only individually exposed tools; they do not enable new operations. All calls retain the connected user's permissions.`;

export const REVIEWED_WORKFLOW_TOOLS: Tool[] = [
  tool("anydb_create_workflow_draft", "Create workflow draft", "Create a disabled workflow with a supported trigger and no actions. It cannot run until explicit steps have been added and it is enabled.", schema({ ...address, clientRequestId: mutationAddress.clientRequestId, name: { type: "string", minLength: 1, maxLength: 200 }, description: { type: "string", maxLength: 2000 }, trigger: { type: "object", additionalProperties: false, properties: { type: { type: "string", enum: ["trigger_manual", "trigger_on_form_submit", "trigger_on_record_create", "trigger_on_record_update", "trigger_on_schedule"] }, config: { type: "object" } }, required: ["type", "config"] } }, ["teamid", "adbid", "clientRequestId", "name", "trigger"]), { readOnlyHint: false, destructiveHint: false, openWorldHint: false }),
  tool("anydb_update_workflow_metadata", "Update workflow metadata", "Change only a workflow's name or description. Preserves trigger, actions, bindings and enabled state; the stored workflow must use supported explicit steps.", schema({ ...mutationAddress, name: { type: "string", minLength: 1 }, description: { type: "string" } }, Object.keys(mutationAddress)), workspaceWrite),
  tool("anydb_set_workflow_enabled", "Set workflow enabled", "Enable or stop a supported workflow. Enabling starts unattended automation and may send messages or change records. The server checks the entire persisted action chain before enabling.", schema({ ...mutationAddress, enabled: { type: "boolean" } }), write),
  ...catalog.map(action => tool(`anydb_workflow_set_${stepNames[action.type]}_step`, `Set ${stepNames[action.type].replaceAll("_", " ")} workflow step`, `Add or update one ${stepNames[action.type].replaceAll("_", " ")} step by stable key. ${action.description}. Other steps and their output bindings are preserved. This stores configuration; its effects occur when the workflow runs.`, schema({ ...mutationAddress, key: stepKey, config: action.inputSchema, description: { type: "string" } }, [...Object.keys(mutationAddress), "key", "config"]), action.type === "action_find" || action.type === "action_move" || action.type === "action_copy" || action.type === "action_formatted_export" ? workspaceWrite : write)),
  tool("anydb_workflow_remove_step", "Remove workflow step", "Remove a named step while preserving other configurations. Refuses removal when later steps still depend on its output.", schema({ ...mutationAddress, key: stepKey }), workspaceWrite),
  tool("anydb_workflow_reorder_steps", "Reorder workflow steps", "Reorder the existing steps using each stable key exactly once. Preserves configurations and refuses invalid forward references.", schema({ ...mutationAddress, keys: { type: "array", items: stepKey, uniqueItems: true } }), workspaceWrite),
  tool("anydb_preview_workflow", "Preview supported workflow", "Simulate a workflow containing only supported explicit steps. Reads are real; record mutations and outbound sends are suppressed. Saves execution history and may advance trigger runtime state; older history may be evicted. Unsupported persisted steps are refused before execution.", schema({ ...workflowAddress, adoid: objectId }, Object.keys(workflowAddress)), workspaceWrite),
  tool("anydb_run_reviewed_workflow", "Run supported workflow", "Run a workflow containing only supported explicit steps, as the connected user. May modify records, generate files or send messages. The server validates the stored action chain and permissions before execution.", schema({ ...workflowAddress, adoid: objectId }, Object.keys(workflowAddress)), write),
];
export const REVIEWED_WORKFLOW_ANNOTATIONS = Object.fromEntries(REVIEWED_WORKFLOW_TOOLS.map(t => [t.name, t.annotations!]));
// ISSUE - 650: the last six names are the Communications tools. They message customers outside the workspace and
// are not exposed on the reviewed (OpenAI-facing) profile until that is decided; dropping them is the whole change.
export const HIDDEN_REVIEWED_TOOLS = new Set(["anydb_create_workflow", "anydb_update_workflow", "anydb_execute_workflow", "anydb_run_script", "anydb_simulate_script", "anydb_publish_agent", "anydb_test_agent", "anydb_list_comm_accounts", "anydb_list_conversations", "anydb_get_conversation", "anydb_send_conversation_reply", "anydb_update_conversation", "anydb_retry_message"]);
export const isReviewedWorkflowTool = (name: string) => REVIEWED_WORKFLOW_TOOLS.some(t => t.name === name);

export function reviewedTools(tools: Tool[]): Tool[] {
  return tools.filter(t => !HIDDEN_REVIEWED_TOOLS.has(t.name)).map(t => t.name === "anydb_list_workflow_actions" ? { ...t, description: "List the finite workflow operations individually exposed as named tools in this interface. No scripts or runtime operation discovery." } : t.name === "anydb_validate_script" ? { ...t, description: "Parse script source and report syntax or safety-rule errors without executing code or obtaining run authorization. Script execution is unavailable in this interface." } : t);
}

export function reviewedCatalog() {
  return catalog.map(a => ({ type: a.type, tool: `anydb_workflow_set_${stepNames[a.type]}_step`, description: a.description, inputSchema: a.inputSchema }));
}

/** Strictly validate the closed public inputs before making a backend request. */
function assertInput(tool: Tool, args: Record<string, unknown>) {
  const unknown = unknownArgumentsError(tool, args);
  if (unknown) throw new Error(unknown);
  for (const name of tool.inputSchema.required ?? []) if (args[name] === undefined) throw new Error(`${tool.name}: ${name} is required`);
  for (const [name, value] of Object.entries(args)) {
    const property = (tool.inputSchema.properties as Record<string, any>)[name];
    if (property.type === "string" && (typeof value !== "string" || (property.minLength && value.length < property.minLength) || (property.maxLength && value.length > property.maxLength) || (property.pattern && !new RegExp(property.pattern).test(value)))) throw new Error(`${tool.name}: invalid ${name}`);
    if (property.type === "boolean" && typeof value !== "boolean") throw new Error(`${tool.name}: ${name} must be boolean`);
    if (property.type === "object" && (!value || typeof value !== "object" || Array.isArray(value))) throw new Error(`${tool.name}: ${name} must be an object`);
    if (property.type === "array" && (!Array.isArray(value) || value.some(v => typeof v !== "string" || !new RegExp(stepKey.pattern).test(v)) || new Set(value).size !== value.length)) throw new Error(`${tool.name}: invalid ${name}`);
  }
  if (args.trigger !== undefined) z.object({ type: z.enum(["trigger_manual", "trigger_on_form_submit", "trigger_on_record_create", "trigger_on_record_update", "trigger_on_schedule"]), config: z.record(z.unknown()) }).strict().parse(args.trigger);
  const step = catalog.find(a => `anydb_workflow_set_${stepNames[a.type]}_step` === tool.name);
  if (step) {
    const config = args.config as Record<string, unknown>;
    const problem = unknownArgumentsError({ ...tool, inputSchema: step.inputSchema }, config);
    if (problem) throw new Error(problem);
    for (const field of step.inputSchema.required ?? []) if (config[field] === undefined) throw new Error(`${tool.name}: config.${field} is required`);
  }
}

export async function callReviewedWorkflowTool(name: string, args: Record<string, unknown> | undefined, client: ExtApiClient) {
  const definition = REVIEWED_WORKFLOW_TOOLS.find(t => t.name === name);
  if (!definition || !args) throw new Error(`${name}: arguments are required`);
  assertInput(definition, args);
  const { teamid, adbid, workflowId, clientRequestId } = args as Record<string, string>;
  const scope = { teamid, adbid, workflowId, clientRequestId };
  let result;
  if (name === "anydb_create_workflow_draft") {
    result = await client.createWorkflow({ teamid, adbid, clientRequestId, reviewedOnly: true, workflow: { name: String(args.name), ...(args.description !== undefined ? { description: String(args.description) } : {}), enabled: false, trigger: args.trigger as CreateWorkflowRequest["workflow"]["trigger"], actions: [] } });
  } else if (name === "anydb_update_workflow_metadata" || name === "anydb_set_workflow_enabled") {
    const changes = Object.fromEntries(["name", "description", "enabled"].filter(k => args[k] !== undefined).map(k => [k, args[k]])) as UpdateWorkflowRequest["changes"];
    if (!Object.keys(changes).length) throw new Error("Supply a name or description change");
    result = await client.updateWorkflow({ ...scope, reviewedOnly: true, changes });
  } else if (name === "anydb_preview_workflow" || name === "anydb_run_reviewed_workflow") {
    result = await client.executeWorkflow({ teamid, adbid, workflowId, reviewedOnly: true, ...(args.adoid ? { adoid: String(args.adoid) } : {}), simulate: name === "anydb_preview_workflow" });
  } else {
    const step = catalog.find(a => `anydb_workflow_set_${stepNames[a.type]}_step` === name);
    result = await client.mutateReviewedWorkflowStep({ ...scope, ...(step ? { actionType: step.type, key: String(args.key), config: args.config as Record<string, unknown>, ...(args.description !== undefined ? { description: String(args.description) } : {}) } : name === "anydb_workflow_remove_step" ? { key: String(args.key) } : { keys: args.keys as string[] }) }, step ? "set" : name === "anydb_workflow_remove_step" ? "remove" : "reorder");
  }
  return { content: [{ type: "text" as const, text: toolJson(result) }] };
}


function sanitizeWorkflowReferences(text: string): string {
  for (const name of HIDDEN_REVIEWED_TOOLS) text = text.replace(new RegExp(`\\b${name}\\b`, "g"), "the explicit reviewed workflow tools");
  return text;
}

export function reviewedBuildingGuide(): string {
  const guide = readSolutionResource(SOLUTION_BUILDING_GUIDE_URI).text;
  return guide.split(/\n(?=## )/).map(section => section.startsWith("## Workflows\n") ? "## Workflows\n\n" + REVIEWED_WORKFLOW_GUIDE : sanitizeWorkflowReferences(section)).join("\n");
}

export function reviewedAuthoringGuide(topic: unknown): string {
  return authoringGuideText(reviewedBuildingGuide(), topic);
}

export function reviewedResource(uri: string) {
  const resource = readSolutionResource(uri);
  if (uri === SOLUTION_BUILDING_GUIDE_URI) return { ...resource, text: reviewedBuildingGuide() };
  if (uri === SOLUTION_AUTHORING_SCHEMA_URI) {
    const schema = JSON.parse(resource.text);
    schema.$defs = Object.fromEntries(Object.entries(schema.$defs).filter(([name]) => !/workflow|script/i.test(name)));
    const prune = (value: any): any => {
      if (Array.isArray(value)) return value.map(prune).filter(item => item !== undefined);
      if (!value || typeof value !== "object") return value;
      if (typeof value.$ref === "string" && value.$ref.startsWith("#/$defs/") && !schema.$defs[value.$ref.slice(8).split("/")[0]]) return undefined;
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, prune(item)]).filter(([, item]) => item !== undefined));
    };
    return { ...resource, text: JSON.stringify(prune(schema), null, 2) };
  }
  return resource;
}

export const reviewedPromptText = sanitizeWorkflowReferences;
