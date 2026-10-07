import { describe, expect, it } from "@jest/globals";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createMcpServer } from "../mcp.js";

type Property = { description?: string; enum?: string[]; items?: { properties?: Record<string, Property> } };

async function listTools() {
  const server = createMcpServer({ baseURL: "http://127.0.0.1:1/api" });
  const client = new Client({ name: "values-groups-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    return (await client.listTools()).tools;
  } finally {
    await client.close();
    await server.close();
  }
}

const properties = (tool: { inputSchema: { properties?: unknown } }) => (tool.inputSchema.properties ?? {}) as Record<string, Property>;

/**
 * ISSUE - 496. A user cell can hold groups (a help-desk conversation's Assigned Team). values: true returns
 * such an entry as {groupid, group_name}; before, it came back as {} and a caller could not tell which team
 * held the record. Every tool that offers values has to describe that shape, as it does for comments.
 */
describe("ISSUE - 496: the values description covers a group in a person cell", () => {
  it("every values parameter says a group is returned as {groupid, group_name}", async () => {
    const withValues = (await listTools()).filter((t) => properties(t).values);
    expect(withValues.length).toBeGreaterThanOrEqual(3);
    for (const tool of withValues) {
      const d = properties(tool).values.description ?? "";
      expect([tool.name, d.includes("{groupid, group_name}")]).toEqual([tool.name, true]);
    }
  });
});

/**
 * ISSUE - 496 added the isempty / isnotempty operators and the "@me" value to listing filters on the server.
 * A caller (a model) only knows what the tool says, so the filter schema has to offer the operators and the
 * description has to explain "@me" and a group token.
 */
describe("ISSUE - 496: list_records documents the filters the server accepts", () => {
  it("offers isempty and isnotempty and explains @me and G@<groupid>", async () => {
    const tool = (await listTools()).find((t) => t.name === "list_records");
    expect(tool).toBeDefined();
    const filter = properties(tool!).filter;
    const ops = filter.items?.properties?.op?.enum ?? [];
    expect(ops).toEqual(expect.arrayContaining(["isempty", "isnotempty"]));
    expect(filter.description).toContain("@me");
    expect(filter.description).toContain("G@<groupid>");
  });
});
