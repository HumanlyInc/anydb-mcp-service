import { describe, expect, it } from "@jest/globals";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createMcpServer } from "../mcp.js";

/**
 * Anis, 2026-10-13: a client that reads whole records runs out of tokens or hits
 * the result limit (a full record is tens of KB; a search page of 100 is far
 * over it). The tools already take `fields`; this pins that the guidance TELLS a
 * model to use it, in the server instructions and on each record-reading tool.
 * It pins wording only, not what a model then does.
 */
describe("record reads are told to use field projection", () => {
  it("the server instructions and the four record-reading tools say to pass fields", async () => {
    const server = createMcpServer({ baseURL: "http://127.0.0.1:1/api" });
    const client = new Client({ name: "projection-test", version: "0.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      expect(client.getInstructions()).toContain("always pass fields (with values: true)");
      const { tools } = await client.listTools();
      for (const name of ["get_record", "list_records", "search_records", "search_team_records"]) {
        const tool = tools.find((t) => t.name === name);
        expect(tool?.description).toContain("ALWAYS pass fields");
      }
    } finally {
      await client.close();
      await server.close();
    }
  });
});
