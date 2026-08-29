import { describe, expect, it } from "@jest/globals";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createMcpServer } from "../mcp.js";

/**
 * Reading the Inbox back.
 *
 * An integration could already put a record into someone's Inbox — that is
 * what setting meta.assignees on update_record does — and had no way to read
 * one back, so it could not check its own work, list what was waiting, or find
 * stale assignments (ISSUE - 21).
 *
 * The capability was already there: the Inbox in the AnyDB app is
 * GET /auth/:userid/assignments, and it was simply unreachable from here.
 *
 * The property worth pinning is the one the tool does NOT have. The underlying
 * route authorizes on team membership alone and would hand over any member's
 * Inbox, but the app has only ever asked for the signed-in user's own, so this
 * takes no userid. If a userid parameter ever appears here, that was a product
 * decision and not a refactor.
 */
describe("anydb_get_inbox", () => {
  async function listTools() {
    const server = createMcpServer({ baseURL: "http://127.0.0.1:1/api" });
    const client = new Client({ name: "inbox-test", version: "0.0.0" });
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

  const inboxTool = async () => {
    const tools = await listTools();
    return tools.find((tool) => tool.name === "anydb_get_inbox") as any;
  };

  it("is advertised", async () => {
    const tools = await listTools();
    expect(tools.map((tool) => tool.name)).toContain("anydb_get_inbox");
  });

  it("takes a team and nothing else", async () => {
    const tool = await inboxTool();

    expect(Object.keys(tool.inputSchema.properties)).toEqual(["teamid"]);
    expect(tool.inputSchema.required).toEqual(["teamid"]);

    // The whole scoping decision, in one assertion.
    expect(tool.inputSchema.properties).not.toHaveProperty("userid");
  });

  it("says whose Inbox it reads, and that it cannot read another", async () => {
    const tool = await inboxTool();

    // Without this an agent asked to "check Madhan's inbox" will try, and the
    // failure will look like a bug rather than a boundary.
    expect(tool.description).toContain("authenticated user");
    expect(tool.description).toMatch(/no way to read another person's/i);
  });

  it("connects it to the write side, which is the point", async () => {
    const tool = await inboxTool();

    // The tool exists so an assignment made through update_record can be
    // verified; naming that is what makes it findable at the moment it is
    // needed.
    expect(tool.description).toContain("meta.assignees");
    expect(tool.description).toContain("update_record");
    // Group membership is half of what lands in an Inbox.
    expect(tool.description).toMatch(/through a group/i);
  });

  it("warns that an Inbox is per team", async () => {
    const tool = await inboxTool();

    // The likely wrong conclusion from an empty result.
    expect(tool.inputSchema.properties.teamid.description).toMatch(
      /another team will not appear/i,
    );
  });
});
