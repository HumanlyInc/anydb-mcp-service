/**
 * ISSUE - 673: the permission-authoring tools. The server enforces who may
 * change access; these pin what the tools themselves promise: one target per
 * call, and annotations that tell a client which calls change access.
 * Request shapes against the server's routes are checked in ext-route-drift.
 */
import { describe, expect, it } from "@jest/globals";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createMcpServer } from "../mcp.js";

const OID = "6aa04513740f7dca84450aa8";

async function connect() {
  const server: any = createMcpServer({ apiKey: "key", userEmail: "someone@example.com", baseURL: "http://127.0.0.1:1/api" } as any);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "access-tools-test", version: "1" });
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

describe("permission authoring tools (ISSUE - 673)", () => {
  it("are listed with annotations that mark the access-changing ones destructive", async () => {
    const client = await connect();
    const tools = Object.fromEntries((await client.listTools()).tools.map((t) => [t.name, t]));
    for (const name of ["anydb_list_roles", "anydb_get_access", "anydb_who_can_access"]) {
      expect(tools[name]?.annotations?.readOnlyHint).toBe(true);
    }
    for (const name of ["anydb_set_access", "anydb_remove_access", "anydb_change_group_members"]) {
      expect(tools[name]?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true, openWorldHint: false });
    }
    expect(tools.anydb_create_group?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    await client.close();
  });

  it("refuses a grant naming both a user and a group, or neither, before calling the server", async () => {
    const client = await connect();
    for (const target of [{ userid: OID, groupid: OID }, {}]) {
      const res: any = await client.callTool({ name: "anydb_set_access", arguments: { teamid: OID, adbid: OID, roleids: ["r"], ...target } });
      expect(res.isError).toBe(true);
      expect(res.content[0].text).toContain("exactly one of userid or groupid");
    }
    await client.close();
  });
});
