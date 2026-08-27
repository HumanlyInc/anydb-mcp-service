import { describe, expect, it, jest } from "@jest/globals";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createMcpServer } from "../mcp.js";

/**
 * The credential gate in front of tool dispatch.
 *
 * A hosted client — ChatGPT, claude.ai, Claude mobile — authenticates with an
 * OAuth bearer and has no environment to put an API key in. The gate used to
 * demand the API-key pair regardless, so a fully authenticated OAuth session
 * was told to go set ANYDB_DEFAULT_API_KEY, advice it could not act on.
 *
 * These drive a real server over an in-memory transport rather than asserting
 * on the gate's condition, so they fail if dispatch stops honouring a bearer
 * for any reason, not only this one.
 */
describe("MCP credential gate", () => {
  async function callListTeams(credentials: {
    apiKey?: string;
    userEmail?: string;
    accessToken?: string;
  }) {
    const server = createMcpServer({ ...credentials, baseURL: baseURL() });
    const client = new Client({ name: "gate-test", version: "0.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    try {
      return await client.callTool({ name: "list_teams", arguments: {} });
    } finally {
      await client.close();
      await server.close();
    }
  }

  /**
   * Points the ext client at a port nothing listens on. A tool call that gets
   * past the gate fails on the connection instead, which is exactly what
   * distinguishes "the gate let it through" from "the gate rejected it".
   */
  function baseURL() {
    return "http://127.0.0.1:1/api";
  }

  it("dispatches a tool when the caller holds only an OAuth bearer", async () => {
    const result: any = await callListTeams({ accessToken: "header.body.sig" });

    const text = String(result.content?.[0]?.text || "");
    expect(text).not.toContain("credentials are not configured");
    expect(text).not.toContain("ANYDB_DEFAULT_API_KEY");
  });

  it("dispatches a tool for a legacy API-key caller", async () => {
    const result: any = await callListTeams({
      apiKey: "key",
      userEmail: "user@anydb.com",
    });

    const text = String(result.content?.[0]?.text || "");
    expect(text).not.toContain("credentials are not configured");
  });

  it("still refuses a caller holding no credential at all", async () => {
    const result: any = await callListTeams({});

    const text = String(result.content?.[0]?.text || "");
    expect(text).toContain("credentials are not configured");
  });

  it("tells an unauthenticated caller about both ways in", async () => {
    // The old message named only the environment variables, which a hosted
    // client cannot set.
    const result: any = await callListTeams({});

    const text = String(result.content?.[0]?.text || "");
    expect(text).toContain("OAuth");
    expect(text).toContain("ANYDB_DEFAULT_API_KEY");
  });
});
