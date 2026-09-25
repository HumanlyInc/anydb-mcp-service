import { describe, expect, it } from "@jest/globals";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createMcpServer } from "../mcp.js";

/**
 * ISSUE - 361. values: true now answers a comments cell (an Issue's
 * Discussion) with its thread instead of "". Every tool that offers values
 * has to say so, or a caller keeps reading an empty list as "never had any".
 */
describe("ISSUE - 361: the values description covers comments cells", () => {
  it("every values parameter says a comments cell returns its thread", async () => {
    const server = createMcpServer({ baseURL: "http://127.0.0.1:1/api" });
    const client = new Client({ name: "values-test", version: "0.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      const { tools } = await client.listTools();
      const withValues = tools.filter((t) => (t.inputSchema.properties as Record<string, unknown> | undefined)?.values);
      expect(withValues.length).toBeGreaterThanOrEqual(3);
      for (const tool of withValues) {
        const d = ((tool.inputSchema.properties as Record<string, { description?: string }>).values.description) ?? "";
        expect([tool.name, d.includes("comments cell")]).toEqual([tool.name, true]);
        expect([tool.name, d.includes("{id, date, text, status, author")]).toEqual([tool.name, true]);
      }
    } finally {
      await client.close();
      await server.close();
    }
  });
});
