import { describe, expect, it } from "@jest/globals";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "node:http";
import { createMcpServer } from "../mcp.js";

async function withClient(profile: "full" | "reviewed", fn: (client: Client, calls: any[]) => Promise<void>) {
  const calls: any[] = [];
  const backend = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    calls.push({ path: req.url, method: req.method, body: raw ? JSON.parse(raw) : null });
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ status: "success", data: { success: true, result: { workflowId: "abc" } } }));
  });
  await new Promise<void>((resolve) => backend.listen(0, "127.0.0.1", resolve));
  const address = backend.address() as { port: number };
  const server = createMcpServer({ apiKey: "test-key", userEmail: "reviewed@test.invalid", baseURL: `http://127.0.0.1:${address.port}/api`, toolProfile: profile } as any);
  const client = new Client({ name: "openai-mcp", version: "test" });
  const [left, right] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(right), client.connect(left)]);
  try { await fn(client, calls); }
  finally { await client.close(); await server.close(); await new Promise<void>((resolve, reject) => backend.close(error => error ? reject(error) : resolve())); }
}

const ids = { teamid: "123456789012345678901234", adbid: "234567890123456789012345", workflowId: "345678901234567890123456", clientRequestId: "test-564" };
const hidden = ["anydb_create_workflow", "anydb_update_workflow", "anydb_execute_workflow", "anydb_run_script", "anydb_simulate_script", "anydb_publish_agent", "anydb_test_agent"];

describe("ISSUE-564 explicit reviewed workflow operations", () => {
  it("preserves the full legacy catalog even when the client identifies as OpenAI", async () => {
    await withClient("full", async (client) => {
      const names = (await client.listTools()).tools.map(t => t.name);
      for (const name of hidden) expect(names).toContain(name);
    });
  });
  it("lists typed step tools with fixed schemas and all safety annotations", async () => {
    await withClient("reviewed", async (client) => {
      const tools = (await client.listTools()).tools;
      for (const name of hidden) expect(tools.map(t => t.name)).not.toContain(name);
      expect(tools.find(t => t.name === "anydb_preview_workflow")?.annotations).toMatchObject({
        readOnlyHint: false, destructiveHint: true, openWorldHint: false,
      });
      for (const suffix of ["create_record", "update_record", "move_record", "copy_record", "find_records", "generate_document", "send_email", "send_notification", "call_webhook", "send_message"]) {
        const step = tools.find(t => t.name === `anydb_workflow_set_${suffix}_step`);
        expect(step).toBeDefined();
        expect(step!.inputSchema.properties).not.toHaveProperty("actionType");
        expect(step!.inputSchema.properties).not.toHaveProperty("script");
        expect(step!.inputSchema.additionalProperties).toBe(false);
        for (const hint of (["readOnlyHint", "destructiveHint", "openWorldHint"] as const)) expect(typeof step!.annotations?.[hint]).toBe("boolean");
      }
    });
  });
  it("rejects direct calls to hidden tools without any backend request", async () => {
    await withClient("reviewed", async (client, calls) => {
      for (const name of hidden) {
        const result = await client.callTool({ name, arguments: {} });
        expect(result.isError).toBe(true);
      }
      expect(calls).toEqual([]);
    });
  });
  it("creates only a disabled empty draft through the reviewed backend gate", async () => {
    await withClient("reviewed", async (client, calls) => {
      const result = await client.callTool({ name: "anydb_create_workflow_draft", arguments: { teamid: ids.teamid, adbid: ids.adbid, clientRequestId: ids.clientRequestId, name: "Acknowledgement", trigger: { type: "trigger_manual", config: {} } } });
      expect(result.isError).not.toBe(true);
      expect(calls[0]).toMatchObject({ path: "/api/integrations/ext/workflows", method: "POST", body: { reviewedOnly: true, workflow: { enabled: false, actions: [] } } });
    });
  });
  it("refuses malformed nested triggers before sending anything", async () => {
    await withClient("reviewed", async (client, calls) => {
      for (const trigger of [{ type: "trigger_manual", config: {}, unexpected: true }, { type: "unknown", config: {} }, { config: {} }, { type: "trigger_manual", config: [] }]) {
        const bad = await client.callTool({ name: "anydb_create_workflow_draft", arguments: { teamid: ids.teamid, adbid: ids.adbid, clientRequestId: ids.clientRequestId, name: "Draft", trigger } });
        expect(bad.isError).toBe(true);
      }
      expect(calls).toEqual([]);
    });
  });
  it("fixes actionType by tool name and rejects hidden nested config and profile overrides", async () => {
    await withClient("reviewed", async (client, calls) => {
      const config = { to: "recipient@example.invalid", subject: "Receipt", body: "Thank you" };
      const ok = await client.callTool({ name: "anydb_workflow_set_send_email_step", arguments: { ...ids, key: "receipt", config } });
      expect(ok.isError).not.toBe(true);
      expect(calls[0]).toMatchObject({ body: { actionType: "action_send_email", key: "receipt", config } });
      for (const extra of [{ actionType: "action_script" }, { reviewedOnly: false }]) {
        const bad = await client.callTool({ name: "anydb_workflow_set_send_email_step", arguments: { ...ids, key: "receipt", config, ...extra } });
        expect(bad.isError).toBe(true);
      }
      const badConfig = await client.callTool({ name: "anydb_workflow_set_find_records_step", arguments: { ...ids, key: "find", config: { skipAclCheck: true } } });
      expect(badConfig.isError).toBe(true);
      expect(calls).toHaveLength(1);
    });
  });
  it("routes enable, preview and execution through reviewedOnly without letting the model change mode", async () => {
    await withClient("reviewed", async (client, calls) => {
      const enable = await client.callTool({ name: "anydb_set_workflow_enabled", arguments: { ...ids, enabled: true } });
      expect(enable.isError).not.toBe(true);
      for (const name of ["anydb_preview_workflow", "anydb_run_reviewed_workflow"]) {
        const result = await client.callTool({ name, arguments: { teamid: ids.teamid, adbid: ids.adbid, workflowId: ids.workflowId } });
        expect(result.isError).not.toBe(true);
      }
      expect(calls.map(c => c.body.reviewedOnly)).toEqual([true, true, true]);
      expect(calls[1].body.simulate).toBe(true);
      expect(calls[2].body.simulate).toBe(false);
    });
  });
  it("gates trigger edits and exposes only its fixed catalog", async () => {
    await withClient("reviewed", async (client, calls) => {
      const catalog = await client.callTool({ name: "anydb_list_workflow_actions", arguments: { teamid: ids.teamid, adbid: ids.adbid } });
      expect(JSON.stringify(catalog)).not.toContain("action_script");
      expect(JSON.stringify(catalog)).not.toContain("action_plugin");
      expect(calls).toEqual([]);
      const changed = await client.callTool({ name: "anydb_update_workflow_trigger", arguments: { teamid: ids.teamid, adbid: ids.adbid, workflowId: ids.workflowId, config: { schedule: "daily" } } });
      expect(changed.isError).not.toBe(true);
      expect(calls[0].body.reviewedOnly).toBe(true);
    });
  });
  it("preserves type guidance while removing unavailable script prompts and schemas", async () => {
    await withClient("reviewed", async (client) => {
      const guide = await client.callTool({ name: "anydb_get_authoring_guide", arguments: {} });
      expect(JSON.stringify(guide)).toContain("general contract");
      expect(JSON.stringify(guide)).not.toContain("anydb_run_script");
      const example = await client.callTool({ name: "anydb_get_authoring_guide", arguments: { topic: "compact-example" } });
      expect(JSON.stringify(example)).toContain("anydb_update_workflow_trigger");
      expect(JSON.stringify(example)).not.toContain("reviewed workflow tools_trigger");
      expect((await client.listPrompts()).prompts.map(p => p.name)).not.toContain("author_anydb_workflow_script");
      await expect(client.getPrompt({ name: "author_anydb_workflow_script", arguments: { goal: "write data" } })).rejects.toThrow();
      const schema = await client.readResource({ uri: "anydb://schemas/solution-authoring/v1" });
      expect(JSON.stringify(schema)).not.toContain("createWorkflowInput");
      expect(JSON.stringify(schema)).toContain("createTypeInput");
    });
  });
});
