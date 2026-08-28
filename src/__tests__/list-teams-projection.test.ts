import { describe, expect, it } from "@jest/globals";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createMcpServer, summariseTeam } from "../mcp.js";

/**
 * What list_teams puts in front of a model.
 *
 * The ext API returns whole team documents, and most of each one is the ACL —
 * a permission bitmask per group and per user. Ten teams came to roughly
 * 69,000 characters of it, and list_teams is typically the first call of a
 * session, because every other id is discovered from it. None of that detail
 * answers "which team?".
 *
 * These drive a real MCP server against a stub of the ext API, so what is
 * asserted is what a client actually receives.
 */
describe("list_teams payload", () => {
  /** A team document shaped like the real one, ACL and all. */
  function teamDocument(teamid: string, name: string) {
    const permissions = Object.fromEntries(
      [
        "OBJECT_SHARE",
        "DB_SELF",
        "DB_SHARE",
        "OBJECT_ATTACHED",
        "USER_ADMIN",
        "TEAM_ATTACHED",
        "TEAM_ADMIN",
        "TEAM_USERS",
        "TEAM_SELF",
        "GROUP_SELF",
        "DB_ATTACHED",
        "DB_ADMIN",
        "GROUP_ADMIN",
        "USER_SELF",
        "OBJECT_SELF",
        "TEAM_SHARE",
      ].map((key) => [key, { PERM_ALL: 1 }]),
    );

    return {
      teamid,
      name,
      creatorUserId: "682777cbdee2def10798a275",
      teamMemberGroupId: `${teamid}-members`,
      guestMemberGroupId: `${teamid}-guests`,
      policy: { policyId: `${teamid}-policy` },
      acl: {
        acl: {
          "U@682777cbdee2def10798a275": {
            inherit_down: true,
            permission: { "111111111111111111111000": permissions },
            override: false,
          },
          "G@6827785edee2def10798a277": {
            inherit_down: true,
            permission: { "111111111111111111111005": permissions },
            override: false,
          },
        },
      },
      license: { planName: "BUSINESS_PLAN" },
      logourl: `${teamid}.logo.png`,
      workflow_execution_used_month: "2026-08",
      workflowExecutionCount: 0,
      created: 1771214342976,
      updated: 1785542403788,
      updatedByUserId: null,
    };
  }

  const TEAMS = [
    teamDocument("6827785edee2def10798a276", "AnisMS"),
    teamDocument("68280b845b73485987845b58", "GMTeam"),
    teamDocument("691280235138060f8ad3075c", "AnyADB Team"),
  ];

  /** Stands in for the ext API, returning its real response envelope. */
  async function withStubbedApi<T>(
    run: (baseURL: string) => Promise<T>,
  ): Promise<T> {
    const http: HttpServer = createServer((req, res) => {
      if (req.url?.startsWith("/integrations/ext/listteams")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "success", data: TEAMS }));
        return;
      }
      res.writeHead(404).end();
    });

    await new Promise<void>((resolve) =>
      http.listen(0, "127.0.0.1", () => resolve()),
    );
    const { port } = http.address() as AddressInfo;

    try {
      return await run(`http://127.0.0.1:${port}`);
    } finally {
      await new Promise<void>((resolve) => http.close(() => resolve()));
    }
  }

  async function listTeams(args: Record<string, unknown> = {}) {
    return withStubbedApi(async (baseURL) => {
      const server = createMcpServer({
        accessToken: "header.body.sig",
        baseURL,
      });
      const client = new Client({ name: "teams-test", version: "0.0.0" });
      const [clientTransport, serverTransport] =
        InMemoryTransport.createLinkedPair();

      await Promise.all([
        server.connect(serverTransport),
        client.connect(clientTransport),
      ]);

      try {
        const result: any = await client.callTool({
          name: "list_teams",
          arguments: args,
        });
        return String(result.content?.[0]?.text || "");
      } finally {
        await client.close();
        await server.close();
      }
    });
  }

  it("returns just what a caller chooses between", async () => {
    const text = await listTeams();
    const teams = JSON.parse(text);

    expect(teams).toEqual([
      {
        teamid: "6827785edee2def10798a276",
        name: "AnisMS",
        plan: "BUSINESS_PLAN",
      },
      {
        teamid: "68280b845b73485987845b58",
        name: "GMTeam",
        plan: "BUSINESS_PLAN",
      },
      {
        teamid: "691280235138060f8ad3075c",
        name: "AnyADB Team",
        plan: "BUSINESS_PLAN",
      },
    ]);
  });

  it("leaves the access-control payload out", async () => {
    const text = await listTeams();

    expect(text).not.toContain("acl");
    expect(text).not.toContain("PERM_ALL");
    expect(text).not.toContain("policyId");
    expect(text).not.toContain("teamMemberGroupId");
  });

  it("costs a small fraction of the full documents", async () => {
    // A size assertion on purpose: the point of this change is the cost, and
    // a field creeping back in would pass every shape assertion above while
    // undoing it. Generous enough not to be brittle about formatting.
    const lean = await listTeams();
    const full = await listTeams({ includeRawTeamMetadata: true });

    expect(lean.length).toBeLessThan(full.length / 5);
    expect(lean.length).toBeLessThan(500);
  });

  it("still returns everything when asked to", async () => {
    // Nothing is lost — it just is not the default.
    const text = await listTeams({ includeRawTeamMetadata: true });
    const teams = JSON.parse(text);

    expect(teams[0].acl).toBeDefined();
    expect(teams[0].policy.policyId).toBe("6827785edee2def10798a276-policy");
    expect(teams).toHaveLength(3);
  });

  describe("summariseTeam", () => {
    it("omits a plan the team does not carry", () => {
      expect(summariseTeam({ teamid: "t1", name: "No Licence" })).toEqual({
        teamid: "t1",
        name: "No Licence",
      });
    });

    it("survives a team document missing the fields it wants", () => {
      // The ext API types teams as open records, so this is reachable.
      expect(summariseTeam({} as never)).toEqual({ teamid: "", name: "" });
    });
  });
});
