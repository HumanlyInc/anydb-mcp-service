import { describe, expect, it } from "@jest/globals";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createMcpServer } from "../mcp.js";

/**
 * ISSUE - 327. The server caps a page at 100 and echoes the page size it
 * applied. The tool has to say both, or a caller asking for 500 assumes it got
 * everything. Pins the description only: the cap itself is enforced and tested
 * server-side (test/integration/ext.listpaging.test.ts).
 */
describe("ISSUE - 327: list_records states the page-size cap", () => {
  it("pagesize names the 100 cap and the echoed pagesize", async () => {
    const server = createMcpServer({ baseURL: "http://127.0.0.1:1/api" });
    const client = new Client({ name: "pagesize-test", version: "0.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      const { tools } = await client.listTools();
      const tool = tools.find((t) => t.name === "list_records");
      const d = (tool?.inputSchema.properties as Record<string, { description?: string }>).pagesize.description ?? "";
      expect(d).toContain("at most 100");
      expect(d).toContain("`pagesize`");
    } finally {
      await client.close();
      await server.close();
    }
  });
});
