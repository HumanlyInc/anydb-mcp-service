import { describe, expect, it } from "@jest/globals";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createMcpServer } from "../mcp.js";

/**
 * Reverting a record to an earlier version (ISSUE - 40).
 *
 * The server has no revert function; anydb-ui composes one client-side from
 * read-version plus replace. The ext endpoint does those two steps
 * server-side, deliberately narrow: the caller passes an adoid and a
 * timestamp and never builds the payload, so it cannot be turned into
 * "replace this record with whatever I say".
 *
 * The description is doing safety work here, not marketing, so it is
 * asserted. This is the one tool in the version family that DESTROYS the
 * current state, and the two ways an agent misuses it are both foreseeable:
 * reaching for it to recover a single field (and silently discarding
 * everything else changed since), or assuming it merges the way
 * update_record does.
 */
describe("record revert tool", () => {
  async function listTools() {
    const server = createMcpServer({ baseURL: "http://127.0.0.1:1/api" });
    const client = new Client({ name: "revert-test", version: "0.0.0" });
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

  it("advertises the revert tool alongside the read tools", async () => {
    const names = (await listTools()).map((tool) => tool.name);
    expect(names).toContain("anydb_revert_record_to_version");
    expect(names).toContain("anydb_list_record_versions");
  });

  it("says plainly that this overwrites and does not merge", async () => {
    const tool = await toolNamed("anydb_revert_record_to_version");

    // An agent that assumes update_record's merge semantics will destroy
    // work it never intended to touch.
    expect(tool.description).toMatch(/OVERWRITES/);
    expect(tool.description).toMatch(/REPLACES, it does not merge/i);
    expect(tool.description).toMatch(/anything added since that version/i);
  });

  it("steers away from the obvious misuse: recovering one field", async () => {
    const tool = await toolNamed("anydb_revert_record_to_version");

    // The likeliest wrong reach. Naming the correct alternative is what
    // makes the warning actionable rather than just frightening.
    expect(tool.description).toMatch(/recover one lost field/i);
    expect(tool.description).toContain("anydb_get_record_version");
    expect(tool.description).toContain("update_record");
  });

  it("tells the agent the damage is recoverable, and how the ts is obtained", async () => {
    const tool = await toolNamed("anydb_revert_record_to_version");

    // Append-only matters: without it an agent should refuse to revert at
    // all on ambiguous instructions. With it, a mistake is fixable.
    expect(tool.description).toMatch(/append-only/i);
    expect(tool.description).toContain("anydb_list_record_versions");
    expect(tool.inputSchema.required).toEqual([
      "teamid",
      "adbid",
      "adoid",
      "ts",
    ]);
  });
});
