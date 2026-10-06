import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "@jest/globals";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";

import { requestLogger } from "../request-log.js";

/**
 * ISSUE - 495. OpenAI's connector scan was getting a 400 from this service on
 * every run and nothing in production said what the request was: nginx records
 * neither headers nor bodies, and the service logged nothing for a request the
 * SDK transport rejected. These drive the real stateless transport, set up the
 * way http.ts sets it up, so the 400 is the SDK's own and not a stub of it.
 */
describe("requestLogger", () => {
  let server: Server | undefined;

  afterEach(async () => {
    await new Promise<void>((resolve) =>
      server ? server.close(() => resolve()) : resolve(),
    );
    server = undefined;
  });

  async function start(lines: string[]): Promise<string> {
    const app = express();
    app.use(express.json());
    app.use(requestLogger((line) => lines.push(line)));
    app.post("/", async (req, res) => {
      const mcp = new McpServer({ name: "log-test", version: "0.0.0" });
      const transport = new StreamableHTTPServerTransport();
      res.on("close", () => {
        void transport.close().catch(() => {});
        void mcp.close().catch(() => {});
      });
      await mcp.connect(transport);
      await transport.handleRequest(req, res, req.body);
    });
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => resolve());
    });
    return `http://127.0.0.1:${(server!.address() as AddressInfo).port}/`;
  }

  const MCP_HEADERS = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };

  it("logs the protocol version and the SDK's message when a request is rejected with a 400", async () => {
    const lines: string[] = [];
    const url = await start(lines);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        ...MCP_HEADERS,
        "mcp-protocol-version": "2099-01-01",
        "user-agent": "openai-mcp/1.0.0",
        authorization: "Bearer super-secret-token-value",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(res.status).toBe(400);

    // The log is written when the response finishes, which can be just after
    // the client has the body.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]!);
    expect(entry).toMatchObject({
      method: "POST",
      path: "/",
      status: 400,
      userAgent: "openai-mcp/1.0.0",
      protocolVersion: "2099-01-01",
      rpcMethod: "tools/list",
    });
    expect(entry.error).toContain("Unsupported protocol version: 2099-01-01");
    // A bearer token and a request's params must never reach a log file.
    expect(lines[0]).not.toContain("super-secret-token-value");
  });

  it("records the status of a request that succeeds, without an error field", async () => {
    const lines: string[] = [];
    const url = await start(lines);

    const res = await fetch(url, {
      method: "POST",
      headers: { ...MCP_HEADERS, "user-agent": "probe/1" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "probe", version: "1" },
        },
      }),
    });
    expect(res.status).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 50));
    const entry = JSON.parse(lines[0]!);
    expect(entry).toMatchObject({ status: 200, rpcMethod: "initialize" });
    expect(entry.error).toBeUndefined();
    // Params can carry client data; only the method name is kept.
    expect(lines[0]).not.toContain("clientInfo");
  });
});
