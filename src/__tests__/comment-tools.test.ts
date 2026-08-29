import { describe, expect, it } from "@jest/globals";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createMcpServer } from "../mcp.js";

/**
 * The comment tools.
 *
 * Before these existed, leaving a comment through MCP meant hand-building the
 * comment object and splicing it into the record's JSON with update_record.
 * That let the caller choose the author, invent the id and date, and skip the
 * mention notification entirely (ISSUE - 14).
 *
 * The server already had a safe path; it was simply unreachable from here. The
 * property worth asserting is therefore about what the tools do NOT accept:
 * there is no author parameter to forge, and no way to set the id or the
 * timestamp.
 */
describe("comment tools", () => {
  async function listTools() {
    const server = createMcpServer({ baseURL: "http://127.0.0.1:1/api" });
    const client = new Client({ name: "comment-test", version: "0.0.0" });
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

  it("advertises both tools", async () => {
    const tools = await listTools();
    const names = tools.map((tool) => tool.name);

    expect(names).toContain("anydb_add_comment");
    expect(names).toContain("anydb_resolve_comment");
  });

  it("offers no way to forge the author, id, or date", async () => {
    const tools = await listTools();
    const add: any = tools.find((tool) => tool.name === "anydb_add_comment");

    const accepted = Object.keys(add.inputSchema.properties);
    expect(accepted.sort()).toEqual(
      ["adbid", "adoid", "cellPosition", "teamid", "text"].sort(),
    );

    // The three things hand-splicing let a caller invent.
    expect(accepted).not.toContain("author");
    expect(accepted).not.toContain("id");
    expect(accepted).not.toContain("date");
  });

  it("tells the caller to use it instead of update_record", async () => {
    const tools = await listTools();
    const add = tools.find((tool) => tool.name === "anydb_add_comment");

    // Without this an agent has no reason to stop reaching for the raw path,
    // which is exactly how the unsafe pattern spread.
    expect(add?.description).toContain("update_record");
    expect(add?.description).toContain("cannot be set by the caller");
  });

  it("scopes both tools the same way, by cell position", async () => {
    const tools = await listTools();
    const add: any = tools.find((tool) => tool.name === "anydb_add_comment");
    const resolve: any = tools.find(
      (tool) => tool.name === "anydb_resolve_comment",
    );

    expect(add.inputSchema.properties.cellPosition.description).toContain(
      "A8",
    );
    expect(add.inputSchema.required).not.toContain("cellPosition");
    expect(resolve.inputSchema.required).not.toContain("cellPosition");

    // Mismatched scope is the likely mistake, so the tool has to say so.
    expect(resolve.description).toContain("will not find a comment");
  });

  it("defaults resolve to resolving, and can reopen", async () => {
    const tools = await listTools();
    const resolve: any = tools.find(
      (tool) => tool.name === "anydb_resolve_comment",
    );

    expect(resolve.inputSchema.properties.resolved.type).toEqual("boolean");
    expect(resolve.inputSchema.properties.resolved.description).toContain(
      "reopen",
    );
    expect(resolve.description).toContain("text is preserved");
  });
});
