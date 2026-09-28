import { describe, expect, it } from "@jest/globals";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../mcp.js";

/**
 * ISSUE - 385: a list_records filter on created/updated with an ISO date - the
 * format the listing returns those fields in - silently matched nothing. The
 * server now accepts it (and refuses a non-date); the tool must say which
 * values it takes, so an agent does not guess.
 *
 * ISSUE - 387: anydb_get_workflow returned every retained run (up to 10, with
 * script log lines) - ~60 KB for a one-action workflow, over a client's result
 * cap. The tool now asks the ext API for the newest few runs by default
 * (historylimit), and says where the full history is.
 */
describe("ISSUE - 385 / 387: listing dates and workflow history size", () => {
  const TEAM = "6827785edee2def10798a276";
  const ADB = "68280b845b73485987845b58";
  const WORKFLOW = "6aabee0ebeba9fc85c0b303b";

  async function withStubbedApi<T>(
    run: (baseURL: string, received: Array<{ url: string; query: URLSearchParams }>) => Promise<T>,
  ): Promise<T> {
    const received: Array<{ url: string; query: URLSearchParams }> = [];
    const http: HttpServer = createServer((req, res) => {
      const url = new URL(req.url || "/", "http://stub");
      received.push({ url: url.pathname, query: url.searchParams });
      res.writeHead(200, { "Content-Type": "application/json" });
      if (url.pathname === `/integrations/ext/workflows/${WORKFLOW}`) {
        res.end(
          JSON.stringify({
            status: "success",
            data: {
              workflowId: WORKFLOW,
              name: "Notify",
              enabled: true,
              createdAt: 1,
              trigger: null,
              actions: [],
              executionHistory: [{ executionId: "run-9", status: "success" }],
              executionHistoryTotal: 9,
            },
          }),
        );
        return;
      }
      res.end(JSON.stringify({ status: "success", data: [] }));
    });
    await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
    const { port } = http.address() as AddressInfo;
    try {
      return await run(`http://127.0.0.1:${port}`, received);
    } finally {
      await new Promise<void>((resolve) => http.close(() => resolve()));
    }
  }

  async function withClient<T>(run: (client: Client, received: Array<{ url: string; query: URLSearchParams }>) => Promise<T>) {
    return withStubbedApi(async (baseURL, received) => {
      const server = createMcpServer({ accessToken: "header.body.sig", baseURL });
      const client = new Client({ name: "dates-history-test", version: "0.0.0" });
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
      try {
        return await run(client, received);
      } finally {
        await client.close();
        await server.close();
      }
    });
  }

  const toolNamed = async (client: Client, name: string) => {
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === name);
    expect(tool).toBeDefined();
    return tool!;
  };

  it("list_records tells the caller which values a created/updated filter takes", async () => {
    await withClient(async (client) => {
      const tool = await toolNamed(client, "list_records");
      const filter = (tool.inputSchema.properties as any).filter;
      expect(filter.description).toContain("created");
      expect(filter.description).toContain("ISO 8601");
      expect(filter.description).toContain("epoch");
      expect(filter.description).toContain("now-7d/d");
    });
  });

  it("anydb_get_workflow asks for the newest 3 runs by default", async () => {
    await withClient(async (client, received) => {
      await client.callTool({
        name: "anydb_get_workflow",
        arguments: { teamid: TEAM, adbid: ADB, workflowId: WORKFLOW },
      });
      const call = received.find((r) => r.url === `/integrations/ext/workflows/${WORKFLOW}`);
      expect(call?.query.get("historylimit")).toBe("3");
    });
  });

  it("anydb_get_workflow passes an explicit historyLimit, 0 included", async () => {
    await withClient(async (client, received) => {
      await client.callTool({
        name: "anydb_get_workflow",
        arguments: { teamid: TEAM, adbid: ADB, workflowId: WORKFLOW, historyLimit: 0 },
      });
      const call = received.find((r) => r.url === `/integrations/ext/workflows/${WORKFLOW}`);
      expect(call?.query.get("historylimit")).toBe("0");
    });
  });

  it("anydb_get_workflow refuses a historyLimit outside 0-10 without calling the API", async () => {
    await withClient(async (client, received) => {
      const result: any = await client.callTool({
        name: "anydb_get_workflow",
        arguments: { teamid: TEAM, adbid: ADB, workflowId: WORKFLOW, historyLimit: 50 },
      });
      expect(result.isError).toBe(true);
      expect(String(result.content?.[0]?.text)).toMatch(/historyLimit/);
      expect(received.find((r) => r.url.startsWith("/integrations/ext/workflows/"))).toBeUndefined();
    });
  });

  it("anydb_get_workflow says the history is capped and where the rest is", async () => {
    await withClient(async (client) => {
      const tool = await toolNamed(client, "anydb_get_workflow");
      expect((tool.inputSchema.properties as any).historyLimit).toBeDefined();
      expect(tool.description).toContain("executionHistoryTotal");
      expect(tool.description).toContain("anydb_get_workflow_execution_history");
    });
  });
});
