import { describe, expect, it } from "@jest/globals";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { describeIdentity } from "../identity.js";
import { createMcpServer } from "../mcp.js";

/**
 * anydb_whoami.
 *
 * "Which account is this connection using?" had no answer short of calling a
 * data tool and recognising the results — which is exactly the wrong tool for
 * the job when two accounts share a team, and useless when the answer you need
 * is "no account at all". The claims were already verified and then discarded.
 *
 * Driven through a real server over an in-memory transport, so these fail if
 * the tool stops being reachable, not only if its output changes.
 */
describe("anydb_whoami", () => {
  async function whoami(credentials: Parameters<typeof createMcpServer>[0]) {
    const server = createMcpServer({
      ...credentials,
      // Nothing listens here. whoami must answer without calling AnyDB at all,
      // so a connection attempt would show up as a failure.
      baseURL: "http://127.0.0.1:1/api",
    });
    const client = new Client({ name: "whoami-test", version: "0.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    try {
      const result: any = await client.callTool({
        name: "anydb_whoami",
        arguments: {},
      });
      return JSON.parse(String(result.content?.[0]?.text || "{}"));
    } finally {
      await client.close();
      await server.close();
    }
  }

  it("reports the account behind an OAuth bearer", async () => {
    const report = await whoami({
      accessToken: "header.body.sig",
      token: {
        subject: "6512f1c0a3b4d5e6f7a8b9c0",
        email: "anis@anydb.com",
        clientId: "client-abc",
        scopes: ["mcp:read", "mcp:write"],
        tokenId: "jti-1",
        expiresAt: 1800000000,
      },
    });

    expect(report.authenticated).toBe(true);
    expect(report.authMethod).toBe("oauth_bearer");
    expect(report.userId).toBe("6512f1c0a3b4d5e6f7a8b9c0");
    expect(report.email).toBe("anis@anydb.com");
    expect(report.clientId).toBe("client-abc");
    expect(report.scopes).toEqual(["mcp:read", "mcp:write"]);
    expect(report.tokenExpiresAt).toBe("2027-01-15T08:00:00.000Z");
  });

  it("never reports the credential itself", async () => {
    // The whole point is that this is safe to call and safe to paste.
    const report = await whoami({
      accessToken: "header.body.sig",
      token: {
        subject: "user-1",
        scopes: ["mcp:read"],
        tokenId: "jti-secret",
      },
    });

    const serialised = JSON.stringify(report);
    expect(serialised).not.toContain("header.body.sig");
    expect(serialised).not.toContain("jti-secret");
  });

  it("reports a legacy API-key caller without inventing a user id", async () => {
    // An API key resolves to a user inside AnyDB; this service never learns
    // which, so the field is absent rather than filled with a guess.
    const report = await whoami({
      apiKey: "key",
      userEmail: "someone@anydb.com",
    });

    expect(report.authenticated).toBe(true);
    expect(report.authMethod).toBe("api_key");
    expect(report.email).toBe("someone@anydb.com");
    expect(report.userId).toBeUndefined();
  });

  it("answers when nothing is connected, instead of demanding credentials", async () => {
    // The case the tool is most needed for. Every other data tool refuses
    // here, which tells you nothing about why.
    const report = await whoami({});

    expect(report.authenticated).toBe(false);
    expect(report.authMethod).toBe("none");
    expect(report.hint).toContain("OAuth");
    expect(report.hint).toContain("ANYDB_DEFAULT_API_KEY");
  });

  it("is advertised in the tool list", async () => {
    const server = createMcpServer({ baseURL: "http://127.0.0.1:1/api" });
    const client = new Client({ name: "whoami-test", version: "0.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    try {
      const { tools } = await client.listTools();
      const whoamiTool = tools.find((tool) => tool.name === "anydb_whoami");

      expect(whoamiTool).toBeDefined();
      // Says when to reach for it, not just what it is.
      expect(whoamiTool?.description).toContain("switching accounts");
    } finally {
      await client.close();
      await server.close();
    }
  });

  describe("describeIdentity", () => {
    const server = {
      serverName: "anydb-mcp",
      serverVersion: "2.3.0",
      apiBaseUrl: "https://dev1.anydb.com/api",
    };

    it("prefers the bearer when both credentials are present", () => {
      // ExtApiClient sends the bearer and ignores the key, so reporting the
      // key would name an identity that authenticates nothing.
      const report = describeIdentity({
        ...server,
        token: { subject: "from-token", scopes: ["mcp:read"] },
        apiKey: "key",
        userEmail: "from-key@anydb.com",
      });

      expect(report.authMethod).toBe("oauth_bearer");
      expect(report.userId).toBe("from-token");
      expect(report.email).toBeUndefined();
    });

    it("omits an expiry the token did not carry", () => {
      const report = describeIdentity({
        ...server,
        token: { subject: "user-1", scopes: [] },
      });

      expect(report).not.toHaveProperty("tokenExpiresAt");
    });

    it("names the client it is acting for", () => {
      const report = describeIdentity({
        ...server,
        token: { subject: "user-1", scopes: [] },
        originClient: "claude-ai/1.0",
      });

      expect(report.originClient).toBe("claude-ai/1.0");
    });
  });
});
