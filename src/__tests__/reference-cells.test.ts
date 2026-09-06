import { describe, expect, it } from "@jest/globals";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createMcpServer } from "../mcp.js";

/**
 * A reference-bearing cell is set through `expr`, not `value`.
 *
 * A person ("user") field, a group, or a "ref" that links another record all
 * resolve a token expression on write: the app's own picker submits a string
 * like `[U@<userid>!PUBLIC]` (users/groups) or `O@<adoid>!F@GO!M@MINI` (a record
 * ref) into the cell's `expr`, and the engine fills `value` with the hydrated
 * object. Put a raw id in `value` instead and the server stores that string
 * verbatim — it never resolves, and anydb-ui's people/ref renderer then breaks
 * on a string where it expects an object, so the assignee/reference shows
 * blank/broken even though a cell filter still matches the id (ISSUE - 97).
 *
 * A model asked to write such a cell reasons from the record-write tool's own
 * `content` description, which is right in front of it — so every write tool has
 * to carry the token forms itself, the same way it carries the rich-text rule.
 * All three token forms below are runtime-verified against the live server.
 */
describe("record-write tool content describes reference cells", () => {
  async function listTools() {
    const server = createMcpServer({ baseURL: "http://127.0.0.1:1/api" });
    const client = new Client({ name: "reference-cells-test", version: "0.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    try {
      const { tools } = await client.listTools();
      return tools;
    } finally {
      await client.close();
      await server.close();
    }
  }

  const contentDescriptionOf = async (toolName: string) => {
    const tools = await listTools();
    const tool: any = tools.find((candidate) => candidate.name === toolName);
    const content =
      toolName === "bulk_create_records" || toolName === "bulk_update_records"
        ? tool.inputSchema.properties.records.items.properties.content
        : tool.inputSchema.properties.content;
    return content.description as string;
  };

  it.each([
    "create_record",
    "update_record",
    "bulk_create_records",
    "bulk_update_records",
  ])(
    "tells %s's content to set reference cells through expr, not value",
    async (toolName) => {
      const description = await contentDescriptionOf(toolName);

      // The mechanism: a token in expr, not an id in value.
      expect(description).toMatch(/ref TOKEN into the cell's expr/);
      expect(description).toMatch(/leave value empty/);
      // The failure mode that makes this matter — a raw id looks like it worked.
      expect(description).toMatch(/renders blank\/broken/);

      // The three token forms, each runtime-verified.
      expect(description).toContain("[U@<userid>!PUBLIC]"); // a user
      expect(description).toContain("[G@<groupid>!PUBLIC]"); // a group
      expect(description).toContain("O@<adoid>!F@GO!M@MINI"); // a record ref
    },
  );
});
