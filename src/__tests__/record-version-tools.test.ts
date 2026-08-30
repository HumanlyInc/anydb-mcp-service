import { describe, expect, it } from "@jest/globals";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createMcpServer } from "../mcp.js";

/**
 * Reading a record's history (ISSUE - 39).
 *
 * The server has always kept version history; it was only reachable behind
 * session auth, so an agent could not read it. That stopped being academic
 * when a type migration wiped a cell's comments: the content still existed
 * and nothing an agent could call would return it.
 *
 * Two properties are worth pinning beyond "the tools exist", because both
 * are ways an agent gets a confidently wrong answer:
 *
 *  - History needs DELETE permission, not read. That is the server's rule
 *    and it surprises people, so the tool has to say so rather than let an
 *    agent read a refusal as "no history exists".
 *  - A timestamp that matches no version is refused. The underlying replay
 *    would otherwise return the record as it is TODAY, and an agent
 *    recovering lost content would have no way to notice.
 */
describe("record version tools", () => {
  async function listTools() {
    const server = createMcpServer({ baseURL: "http://127.0.0.1:1/api" });
    const client = new Client({ name: "versions-test", version: "0.0.0" });
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

  const toolNamed = async (name: string) => {
    const tools = await listTools();
    return tools.find((tool) => tool.name === name) as any;
  };

  it("advertises the three history tools", async () => {
    const names = (await listTools()).map((tool) => tool.name);

    expect(names).toContain("anydb_list_record_versions");
    expect(names).toContain("anydb_get_record_version");
    expect(names).toContain("anydb_get_record_version_delta");
  });

  it("warns that history needs delete permission, not read", async () => {
    const tool = await toolNamed("anydb_list_record_versions");

    // Without this an agent reads a refusal as "this record has no history",
    // which is a different and much more comforting conclusion than the
    // truth: it may have plenty and you are not allowed to see it.
    expect(tool.description).toMatch(/DELETE PERMISSION/i);
    expect(tool.description).toMatch(/not just read/i);
  });

  it("says a timestamp must come from the listing, and that a wrong one is refused", async () => {
    const tool = await toolNamed("anydb_get_record_version");

    expect(tool.description).toContain("anydb_list_record_versions");
    // The specific trap: silently getting today's record back.
    expect(tool.description).toMatch(/REJECTED/);
    expect(tool.description).toMatch(/as it is today/i);
    expect(tool.inputSchema.required).toEqual([
      "teamid",
      "adbid",
      "adoid",
      "ts",
    ]);
    expect(tool.inputSchema.properties.ts.type).toBe("number");
  });

  it("frames the tools around recovering content that is gone from the record", async () => {
    const list = await toolNamed("anydb_list_record_versions");
    const get = await toolNamed("anydb_get_record_version");
    const delta = await toolNamed("anydb_get_record_version_delta");

    expect(list.description).toMatch(/what happened to this record/i);
    expect(get.description).toMatch(/no longer exists on the record/i);
    expect(delta.description).toMatch(/only what CHANGED/i);
  });
});
