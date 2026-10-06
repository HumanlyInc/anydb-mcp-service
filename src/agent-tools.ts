import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { ExtApiClient } from "./ext-api-client.js";
import { toolJson } from "./result-format.js";
const text=z.string().min(1);const scope={teamid:text,adbid:text,runId:text};
const base={adoid:text,expectedRevision:text};
const schemas={
 anydb_agent_create_record:z.object({...scope,operationId:text,input:z.object({...base,templateId:text,name:text,values:z.record(z.union([z.string(),z.number().finite(),z.boolean(),z.null()])),reuseExisting:z.literal(true)}).strict()}).strict(),
 anydb_agent_read_record:z.object({...scope,adoid:text}).strict(),
 anydb_agent_update_fields:z.object({...scope,operationId:text,input:z.object({...base,values:z.record(z.union([z.string(),z.number().finite(),z.boolean(),z.null()]))}).strict()}).strict(),
 anydb_agent_set_cell_lock:z.object({...scope,operationId:text,input:z.object({...base,field:text,locked:z.boolean()}).strict()}).strict(),
 anydb_agent_send_email:z.object({...scope,operationId:text,input:z.object({...base,to:z.array(z.string().email()).min(1).max(25),subject:text,body:text}).strict()}).strict(),
};
const string={type:"string",minLength:1};const scopeProperties={teamid:string,adbid:string,runId:{...string,description:"Run ID supplied by the trusted workflow runtime"}};
const snapshotSchema = { type: "object", properties: { name: {type:"string"}, templateName: {type:"string"}, revision: string, values: { type: "object", additionalProperties: true }, locks: { type: "object", additionalProperties: { type: "boolean" } }, fieldLabels: {type:"object",additionalProperties:{type:"string"}} }, required: ["name", "templateName", "revision", "values", "locks"], additionalProperties: false };
const outcomeSchema: NonNullable<Tool["outputSchema"]> = { type: "object", properties: {
 state: { type: "string", enum: ["simulated", "applied", "sent", "reused", "failed", "unknown"] }, before: snapshotSchema,
 after: { anyOf: [snapshotSchema, { type: "null" }] },
 receipt: { type: "object", properties: { operationId: string, correlationId: string, messageId: { type: "string" },childRecordId:{type:"string"},reusedExisting:{type:"boolean"} }, required: ["operationId", "correlationId"], additionalProperties: false },
 error: { type: "string" }
}, required: ["state", "before", "after", "receipt"], additionalProperties: false };
const limitations="Requires an authenticated run capability carried outside tool arguments. Saved field positions, record IDs and email recipients further restrict current caller ACLs. Server chooses preview/live mode; never supply identity or simulate overrides. Preview supports literal number/boolean/text/user-ID values and locks only, with overlay-aware reads; no formula, script or downstream workflow effects. Agent writes suppress workflow events. A receipt state is simulated, applied, sent, failed or unknown. Unknown acceptance must never be retried under a new operation ID; replay the original ID and identical arguments.";
function operation(name:keyof typeof schemas,description:string,properties:Record<string,unknown>,required:string[]):Tool {
 return {name,outputSchema:outcomeSchema,description:`${description} ${limitations}`,inputSchema:{type:"object",additionalProperties:false,properties:{...scopeProperties,operationId:string,input:{type:"object",additionalProperties:false,properties:{adoid:string,expectedRevision:{...string,description:"Revision from latest anydb_agent_read_record"},...properties},required:["adoid","expectedRevision",...required]}},required:["teamid","adbid","runId","operationId","input"]}};
}
export const AGENT_TOOLS:Tool[]=[
 {name:"anydb_agent_read_record",outputSchema:{...snapshotSchema,type:"object"},description:`Read the current owning-authorized record name and type (templateName), visible scoped field values, locks and revision, including this preview's simulated changes. ${limitations}`,inputSchema:{type:"object",additionalProperties:false,properties:{...scopeProperties,adoid:string},required:["teamid","adbid","runId","adoid"]}},
 operation("anydb_agent_update_fields","Update existing allowed fields with literal values; user references use an actual current team user ID.",{values:{type:"object",additionalProperties:{type:["string","number","boolean","null"]}}},["values"]),
 operation("anydb_agent_set_cell_lock","Set one allowed cell's lock flag. Already locked fields cannot be changed or unlocked by this pilot.",{field:string,locked:{type:"boolean"}},["field","locked"]),
 operation("anydb_agent_send_email","Send one plain-text email to saved allowed recipients with a correlated single-attempt receipt. Sent means SMTP accepted; it is not inbox delivery confirmation.",{to:{type:"array",minItems:1,maxItems:25,items:{type:"string",format:"email"}},subject:string,body:string},["to","subject","body"]),
 operation("anydb_agent_create_record","Create a typed child under a saved parent/type/initial-field rule; reuse one existing authorized child, and refuse multiple matches. Reuse does not overwrite existing values. receipt.childRecordId identifies the child for final anydb_agent_read_record; preview returns a virtual child without business writes. Unknown acceptance is fenced across runs.",{templateId:string,name:string,values:{type:"object",additionalProperties:{type:["string","number","boolean","null"]}},reuseExisting:{type:"boolean",const:true}},["templateId","name","values","reuseExisting"])
];
export const isAgentTool=(name:string):name is keyof typeof schemas=>Object.prototype.hasOwnProperty.call(schemas,name);
export async function callAgentTool(name:string,args:unknown,client:ExtApiClient) {
 if(!isAgentTool(name)) throw new Error("Unknown agent operation");
 const input=schemas[name].parse(args);
 const result=name==="anydb_agent_read_record"?await client.readAgentRecord(input):await client.executeAgentOperation({...input,kind:name.slice("anydb_agent_".length)});
 if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("Invalid agent operation response");
 return {structuredContent: result as Record<string, unknown>, content:[{type:"text" as const,text:toolJson(result,client.getOriginClient())}]};
}
