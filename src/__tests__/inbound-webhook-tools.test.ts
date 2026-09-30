import { describe, expect, it } from "@jest/globals";
import { createServer } from "node:http";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createMcpServer } from "../mcp.js";
import { readSolutionResource, SOLUTION_BUILDING_GUIDE_URI } from "../solution-resources.js";
import { TOOL_ANNOTATIONS } from "../tool-annotations.js";

/**
 * ISSUE - 418. A person can hand a Framer (or any signed-JSON) form a URL that creates records.
 * These tools let an agent set that up: create the endpoint on a record, give the user the URL and
 * secret once, read what the form really sends, map the field names, switch it on.
 */
describe("inbound webhook tools", () => {
  async function listTools() {
    const server = createMcpServer({ baseURL: "http://127.0.0.1:1/api" });
    const client = new Client({ name: "inbound-webhook-test", version: "0.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      const { tools } = await client.listTools();
      return tools;
    } finally {
      await client.close();
      await server.close();
    }
  }

  const ALL = [
    "anydb_create_inbound_webhook",
    "anydb_list_inbound_webhooks",
    "anydb_get_inbound_webhook",
    "anydb_update_inbound_webhook",
    "anydb_set_inbound_webhook_status",
    "anydb_rotate_inbound_webhook_secret",
    "anydb_delete_inbound_webhook",
    "anydb_list_inbound_webhook_deliveries",
    "anydb_get_inbound_webhook_delivery",
    "anydb_replay_inbound_webhook_delivery",
  ];

  it("advertises all ten tools with honest annotations", async () => {
    const names = (await listTools()).map((t) => t.name);
    for (const name of ALL) expect(names).toContain(name);
    for (const name of [
      "anydb_list_inbound_webhooks",
      "anydb_get_inbound_webhook",
      "anydb_list_inbound_webhook_deliveries",
      "anydb_get_inbound_webhook_delivery",
    ]) {
      expect(TOOL_ANNOTATIONS[name]).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    }
    for (const name of [
      "anydb_update_inbound_webhook",
      "anydb_set_inbound_webhook_status",
      "anydb_rotate_inbound_webhook_secret",
      "anydb_delete_inbound_webhook",
    ]) {
      expect(TOOL_ANNOTATIONS[name]).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    }
    // Creating one makes a public URL; replaying adds a record but removes nothing.
    expect(TOOL_ANNOTATIONS["anydb_create_inbound_webhook"]).toMatchObject({ readOnlyHint: false, destructiveHint: false, openWorldHint: true });
    expect(TOOL_ANNOTATIONS["anydb_replay_inbound_webhook_delivery"]).toMatchObject({ readOnlyHint: false, destructiveHint: false });
  });

  it("create explains the one-time secret, capture mode, type by name, listing first and the trigger", async () => {
    const create = (await listTools()).find((t) => t.name === "anydb_create_inbound_webhook")!;
    expect(create.description).toMatch(/secret[^.]*(only|once)|(only|once)[^.]*secret/i);
    expect(create.description).toMatch(/captur/i);
    expect(create.description).toMatch(/templateName/);
    expect(create.description).toMatch(/anydb_list_inbound_webhooks/);
    expect(create.description).toMatch(/On record create/i);
    expect(create.description).toMatch(/Business/);
    expect(create.inputSchema.required).toEqual(["teamid", "adbid", "parentId", "templateName", "name", "adapter"]);
    expect((create.inputSchema.properties as any).adapter.enum).toEqual(["framer", "generic"]);
  });

  it("rotate and get say where the secret goes and does not go", async () => {
    const tools = await listTools();
    const rotate = tools.find((t) => t.name === "anydb_rotate_inbound_webhook_secret")!;
    expect(rotate.description).toMatch(/old secret stops working/i);
    expect(rotate.description).toMatch(/only/i);
    const get = tools.find((t) => t.name === "anydb_get_inbound_webhook")!;
    expect(get.description).toMatch(/never returns the secret|secret is not/i);
  });

  it("the delivery tools warn that payloads are personal data", async () => {
    const get = (await listTools()).find((t) => t.name === "anydb_get_inbound_webhook_delivery")!;
    expect(get.description).toMatch(/personal/i);
  });

  it("status only offers the three settable values; delivery tools require both ids", async () => {
    const tools = await listTools();
    const status = tools.find((t) => t.name === "anydb_set_inbound_webhook_status")!;
    expect((status.inputSchema.properties as any).status.enum).toEqual(["active", "disabled", "capturing"]);
    expect(status.inputSchema.required).toEqual(["hookId", "status"]);
    for (const name of ["anydb_get_inbound_webhook_delivery", "anydb_replay_inbound_webhook_delivery"]) {
      expect(tools.find((t) => t.name === name)!.inputSchema.required).toEqual(["hookId", "deliveryKey"]);
    }
  });

  it("the authoring guide walks through setting one up: create, capture, map, activate, replay", () => {
    const guide = readSolutionResource(SOLUTION_BUILDING_GUIDE_URI).text;
    const start = guide.indexOf("## Receiving Form Submissions");
    expect(start).toBeGreaterThan(-1);
    const section = guide.slice(start, guide.indexOf("\n## ", start + 5));
    for (const tool of [
      "anydb_list_inbound_webhooks",
      "anydb_create_inbound_webhook",
      "anydb_list_inbound_webhook_deliveries",
      "anydb_get_inbound_webhook_delivery",
      "anydb_update_inbound_webhook",
      "anydb_set_inbound_webhook_status",
      "anydb_replay_inbound_webhook_delivery",
    ]) {
      expect(section).toContain(tool);
    }
    expect(section).toMatch(/captur/i);
    expect(section).toMatch(/On record create/i);
    expect(section).toMatch(/secret/i);
  });

  it("each tool call reaches the ext API with the right request and returns its answer", async () => {
    const seen: { method?: string; url?: string; body?: unknown }[] = [];
    const api = createServer((req, res) => {
      let raw = "";
      req.on("data", (chunk) => (raw += chunk));
      req.on("end", () => {
        seen.push({ method: req.method, url: req.url, body: raw ? JSON.parse(raw) : undefined });
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ status: "success", data: { echoed: req.url } }));
      });
    });
    await new Promise<void>((resolve) => api.listen(0, "127.0.0.1", resolve));
    const port = (api.address() as { port: number }).port;
    const server = createMcpServer({ apiKey: "k", userEmail: "e@x.com", baseURL: `http://127.0.0.1:${port}/api` });
    const client = new Client({ name: "dispatch-test", version: "0.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const base = "/api/integrations/ext/inboundwebhooks";
    const call = async (name: string, args: Record<string, unknown>) => {
      const result: any = await client.callTool({ name, arguments: args });
      expect(result.isError).toBeFalsy();
      expect(JSON.stringify(result.content)).toContain("echoed");
    };
    try {
      await call("anydb_create_inbound_webhook", {
        teamid: "t", adbid: "a", parentId: "p", templateName: "Lead", name: "Framer", adapter: "framer",
      });
      await call("anydb_list_inbound_webhooks", { teamid: "t", parentId: "p" });
      await call("anydb_get_inbound_webhook", { hookId: "h1" });
      await call("anydb_update_inbound_webhook", { hookId: "h1", fieldMap: { "Your name": "Name" } });
      await call("anydb_set_inbound_webhook_status", { hookId: "h1", status: "active" });
      await call("anydb_rotate_inbound_webhook_secret", { hookId: "h1" });
      await call("anydb_list_inbound_webhook_deliveries", { hookId: "h1", limit: 5 });
      await call("anydb_get_inbound_webhook_delivery", { hookId: "h1", deliveryKey: "k1" });
      await call("anydb_replay_inbound_webhook_delivery", { hookId: "h1", deliveryKey: "k1" });
      await call("anydb_delete_inbound_webhook", { hookId: "h1" });
    } finally {
      await client.close();
      await server.close();
      await new Promise<void>((resolve) => api.close(() => resolve()));
    }
    expect(seen.map((r) => `${r.method} ${r.url}`)).toEqual([
      `POST ${base}`,
      `GET ${base}?teamid=t&parentId=p`,
      `GET ${base}/h1`,
      `PUT ${base}/h1`,
      `PUT ${base}/h1/status`,
      `POST ${base}/h1/rotate-secret`,
      `GET ${base}/h1/deliveries?limit=5`,
      `GET ${base}/h1/deliveries/k1`,
      `POST ${base}/h1/deliveries/k1/replay`,
      `DELETE ${base}/h1`,
    ]);
    expect(seen[0]!.body).toMatchObject({ templateName: "Lead", adapter: "framer" });
    expect(seen[3]!.body).toEqual({ fieldMap: { "Your name": "Name" } });
    expect(seen[4]!.body).toEqual({ status: "active" });
  });
});
