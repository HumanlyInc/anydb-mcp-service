import { describe, expect, it } from "@jest/globals";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createMcpServer } from "../mcp.js";

/**
 * ISSUE - 512. A manual-trigger agent is already callable by name through
 * anydb_execute_workflow (the agent's workflow carries its name; checked on Dev1
 * 2026-10-13). Nothing told a client so. Pins the guidance on the save tool only,
 * not that a model follows it.
 */
describe("ISSUE - 512: the agent tools say how to run an agent on demand", () => {
  it("names trigger_manual, workflowName, anydb_get_agent_run and that a caller passes no inputs", async () => {
    const server = createMcpServer({ baseURL: "http://127.0.0.1:1/api" });
    const client = new Client({ name: "on-demand-test", version: "0.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      const { tools } = await client.listTools();
      const d = tools.find((t) => t.name === "anydb_save_agent")?.description ?? "";
      expect(d).toContain("trigger_manual");
      expect(d).toContain("workflowName");
      expect(d).toContain("anydb_get_agent_run");
      expect(d).toContain("passes no inputs");
    } finally {
      await client.close();
      await server.close();
    }
  });
});
