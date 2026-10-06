import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createServer, type Server } from "node:http";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createMcpServer } from "../mcp.js";
import { readSolutionResource, SOLUTION_BUILDING_GUIDE_URI } from "../solution-resources.js";

/**
 * ISSUE - 506. Authoring custom workflow agents from MCP.
 *
 * Pins what is advertised (shape, annotations, the warnings an LLM needs: validate and test spend tokens, the
 * proof before publish cannot be supplied) and exactly what is forwarded to the AnyDB API. Whether the server
 * accepts a configuration, refuses another team's caller or demands the mandatory trial is tested in anydb-server
 * (ext.agents.authoring.test.ts).
 */
describe("custom agent authoring tools", () => {
  let api: Server;
  let server: ReturnType<typeof createMcpServer>;
  let client: Client;
  let logs: ReturnType<typeof jest.spyOn>;
  let seen: Array<{ method?: string; url?: string; body: any }> = [];

  const ids = { teamid: "6aa04513740f7dca84450aa8", adbid: "6aa0455c740f7dca84450aaf" };
  const agentid = "11111111-1111-4111-8111-111111111111";

  beforeEach(async () => {
    seen = [];
    logs = jest.spyOn(console, "error").mockImplementation(() => {});
    api = createServer((req, res) => {
      let raw = "";
      req.on("data", (chunk) => (raw += chunk));
      req.on("end", () => {
        seen.push({ method: req.method, url: req.url, body: raw ? JSON.parse(raw) : undefined });
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ status: "success", data: { ok: true, key: agentid, version: 1 } }));
      });
    });
    await new Promise<void>((resolve) => api.listen(0, "127.0.0.1", resolve));
    server = createMcpServer({ apiKey: "k", userEmail: "a@example.invalid", baseURL: `http://127.0.0.1:${(api.address() as any).port}/api` } as any);
    client = new Client({ name: "authoring-test", version: "1" });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(st), client.connect(ct)]);
  });
  afterEach(async () => {
    await client?.close();
    await server?.close();
    await new Promise<void>((resolve) => api.close(() => resolve()));
    logs.mockRestore();
  });

  const tool = async (name: string) => (await client.listTools()).tools.find((t) => t.name === name) as any;
  const call = (name: string, args: any) => client.callTool({ name, arguments: args });
  const NAMES = ["anydb_save_agent", "anydb_list_agents", "anydb_get_agent", "anydb_validate_agent", "anydb_test_agent", "anydb_publish_agent", "anydb_list_agent_runs", "anydb_get_agent_run"];

  describe("advertised contract", () => {
    it("exposes the whole lifecycle, none of it named like the tools a running agent calls", async () => {
      const names = (await client.listTools()).tools.map((t) => t.name);
      for (const name of NAMES) {
        expect(names).toContain(name);
        expect(name.startsWith("anydb_agent_")).toBe(false);
      }
    });

    it("annotations never understate: saving and publishing replace, validate and test add, reads read", async () => {
      expect((await tool("anydb_save_agent")).annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
      expect((await tool("anydb_publish_agent")).annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
      for (const name of ["anydb_validate_agent", "anydb_test_agent"]) {
        expect((await tool(name)).annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false, openWorldHint: false });
      }
      for (const name of ["anydb_list_agents", "anydb_get_agent", "anydb_list_agent_runs", "anydb_get_agent_run"]) {
        expect((await tool(name)).annotations).toMatchObject({ readOnlyHint: true });
      }
    });

    it("validate and test warn that they spend real AI tokens", async () => {
      for (const name of ["anydb_validate_agent", "anydb_test_agent"]) {
        expect((await tool(name)).description).toMatch(/SPENDS REAL AI TOKENS/);
      }
      expect((await tool("anydb_test_agent")).description).toMatch(/nothing is sent/);
    });

    it("publish says the proof is loaded by the server and cannot be supplied", async () => {
      const t = await tool("anydb_publish_agent");
      expect(t.description).toMatch(/you cannot supply that proof/);
      // ISSUE - 516: publishing starts nothing unless asked, and the tool says so.
      expect(Object.keys(t.inputSchema.properties).sort()).toEqual(["adbid", "agentid", "enable", "teamid", "version"]);
      expect(t.inputSchema.required).toEqual(["teamid", "adbid", "agentid", "version"]);
      expect(t.inputSchema.properties.enable).toMatchObject({ type: "boolean" });
      expect(t.description).toMatch(/does not start its schedule unless enable is true/i);
    });

    it("save is strict: no identity, model or mode, and the scope is the whole authority", async () => {
      const t = await tool("anydb_save_agent");
      const config = t.inputSchema.properties.configuration;
      expect(config.additionalProperties).toBe(false);
      expect(Object.keys(config.properties).sort()).toEqual(
        ["authoringTrigger", "displayName", "id", "limits", "mutationScope", "prompt", "requiredTools", "version"].sort(),
      );
      for (const forbidden of ["executionUserId", "model", "mode", "teamid", "adbid", "trigger"]) {
        expect(config.properties).not.toHaveProperty(forbidden);
      }
      expect(config.required).toEqual(["prompt"]);
      const scope = config.properties.mutationScope;
      expect(scope.additionalProperties).toBe(false);
      expect(scope.properties.emailRecipients).toMatchObject({ type: "array", maxItems: 25 });
      expect(scope.properties.artifacts.properties.reports.maxItems).toBe(10);
      expect(t.description).toMatch(/runs as YOU/);
      expect(t.description).toMatch(/Lifecycle:/);
    });

    it("search_records documents the query syntax a validating agent must be able to trust", async () => {
      const t = await tool("search_records");
      expect(t.description).toMatch(/Lucene-style/);
      expect(t.description).toMatch(/meta\.templateName:Issue AND \(Status:New OR Status:Open\)/);
      expect(t.description).toMatch(/fewer hits than limit is the last/);
      expect(t.inputSchema.properties.search.description).toMatch(/Lucene-style/);
    });

    it("the guide teaches authoring, what the scope authorises and the order of steps", () => {
      const text = readSolutionResource(SOLUTION_BUILDING_GUIDE_URI).text;
      expect(text).toContain("### Authoring custom agents");
      expect(text).toMatch(/anydb_save_agent/);
      expect(text).toMatch(/validate.*test.*publish/is);
      expect(text).toMatch(/runs as the\s+person who saves/i);
    });
  });

  describe("forwarding", () => {
    const configuration = {
      prompt: "Write the report and email it.",
      displayName: "Report mailer",
      authoringTrigger: { triggerType: "trigger_manual", inputProperties: {} },
      mutationScope: { fields: [], emailRecipients: ["anismo@gmail.com", "madhan@anydb.com"] },
    };

    it("save posts the configuration unchanged", async () => {
      const result = await call("anydb_save_agent", { ...ids, configuration });
      expect(result.isError).toBeFalsy();
      expect(seen[0]).toMatchObject({ method: "POST", url: "/api/integrations/ext/agents" });
      expect(seen[0]!.body).toEqual({ ...ids, configuration });
    });

    it("list, get, runs and run read the right routes with only what was asked", async () => {
      await call("anydb_list_agents", { ...ids, limit: 10 });
      await call("anydb_get_agent", { ...ids, agentid });
      await call("anydb_list_agent_runs", { ...ids, agentid });
      await call("anydb_get_agent_run", { ...ids, runid: "run-1", page: 2 });
      expect(seen.map((r) => `${r.method} ${r.url}`)).toEqual([
        `GET /api/integrations/ext/agents?teamid=${ids.teamid}&adbid=${ids.adbid}&limit=10`,
        `GET /api/integrations/ext/agents/${agentid}?teamid=${ids.teamid}&adbid=${ids.adbid}`,
        `GET /api/integrations/ext/agents/runs?teamid=${ids.teamid}&adbid=${ids.adbid}&agentid=${agentid}`,
        `GET /api/integrations/ext/agents/runs/run-1?teamid=${ids.teamid}&adbid=${ids.adbid}&page=2`,
      ]);
    });

    it("validate, test and publish post to their own routes", async () => {
      await call("anydb_validate_agent", { ...ids, agentid });
      await call("anydb_test_agent", { ...ids, agentid, fixture: { trigger: {} } });
      await call("anydb_publish_agent", { ...ids, agentid, version: 3 });
      expect(seen.map((r) => `${r.method} ${r.url}`)).toEqual([
        `POST /api/integrations/ext/agents/${agentid}/validate`,
        `POST /api/integrations/ext/agents/${agentid}/test`,
        `POST /api/integrations/ext/agents/${agentid}/publish`,
      ]);
      expect(seen[0]!.body).toEqual(ids);
      expect(seen[1]!.body).toEqual({ ...ids, fixture: { trigger: {} } });
      expect(seen[2]!.body).toEqual({ ...ids, version: 3 });
    });

    it("publish forwards enable only when it is given", async () => {
      await call("anydb_publish_agent", { ...ids, agentid, version: 4 });
      await call("anydb_publish_agent", { ...ids, agentid, version: 4, enable: true });
      expect(seen[0]!.body).toEqual({ ...ids, version: 4 }); // omitted: the server keeps the workflow's state
      expect(seen[1]!.body).toEqual({ ...ids, version: 4, enable: true });
    });

    it("a plain test sends no fixture", async () => {
      await call("anydb_test_agent", { ...ids, agentid });
      expect(seen[0]!.body).toEqual(ids);
    });
  });

  describe("bad path: nothing is sent for what the contract refuses", () => {
    it.each([
      ["an unknown top-level parameter on save", "anydb_save_agent", { configuration: { prompt: "p" }, executionUserId: "admin" }],
      ["a misspelt parameter", "anydb_get_agent", { agentId: agentid }],
      ["a proof supplied to publish", "anydb_publish_agent", { agentid, version: 1, validation: { status: "success" } }],
      ["a model on validate", "anydb_validate_agent", { agentid, model: "gpt-9" }],
      ["an identity on test", "anydb_test_agent", { agentid, executionUserId: "admin" }],
    ])("refuses %s and sends nothing", async (_label, name, extra) => {
      const result = await call(name, { ...ids, ...extra });
      expect(result.isError).toBe(true);
      expect(seen).toEqual([]);
    });

    it("a server refusal reaches the model with its reason", async () => {
      await new Promise<void>((resolve) => api.close(() => resolve()));
      api = createServer((_req, res) => {
        res.statusCode = 403;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ status: "error", message: "Custom agents require a Business or Enterprise plan" }));
      });
      await new Promise<void>((resolve) => api.listen(0, "127.0.0.1", resolve));
      const refused = createMcpServer({ apiKey: "k", userEmail: "a@example.invalid", baseURL: `http://127.0.0.1:${(api.address() as any).port}/api` } as any);
      const c = new Client({ name: "t", version: "1" });
      const [ct, st] = InMemoryTransport.createLinkedPair();
      await Promise.all([refused.connect(st), c.connect(ct)]);
      try {
        const result = await c.callTool({ name: "anydb_publish_agent", arguments: { ...ids, agentid, version: 1 } });
        expect(result.isError).toBe(true);
        expect(JSON.stringify(result.content)).toMatch(/Business or Enterprise|403/);
      } finally {
        await c.close();
        await refused.close();
      }
    });
  });
});
