import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createServer, type Server } from "node:http";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createMcpServer } from "../mcp.js";

// ISSUE - 515. The MCP client validates every tool reply against the tool's outputSchema, and the other agent tests
// answer with a record snapshot, so none of them sent the reply the server gives for an email that names no record.
// This drives the real MCP client and checks the schema accepts exactly that reply.

let api: Server;
let server: ReturnType<typeof createMcpServer>;
let client: Client;
let logs: ReturnType<typeof jest.spyOn>;
let reply: unknown;

beforeEach(async () => {
  logs = jest.spyOn(console, "error").mockImplementation(() => {});
  api = createServer((req, res) => {
    req.on("data", () => {});
    req.on("end", () => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ status: "success", data: reply }));
    });
  });
  await new Promise<void>(resolve => api.listen(0, "127.0.0.1", resolve));
  server = createMcpServer({ apiKey: "synthetic-key", userEmail: "agent@example.invalid", agentCapability: "synthetic-secret", baseURL: `http://127.0.0.1:${(api.address() as any).port}/api` } as any);
  client = new Client({ name: "agent-test", version: "1" });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(st), client.connect(ct)]);
  // The MCP client only validates a reply against outputSchema for tools it has listed, as the agent runner does.
  await client.listTools();
});
afterEach(async () => {
  await client?.close();
  await server?.close();
  await new Promise<void>(resolve => api.close(() => resolve()));
  logs.mockRestore();
});

const scope = { teamid: "t", adbid: "d", runId: "run", operationId: "op" };
const emailInput = { to: ["recipient@example.invalid"], subject: "Backlog", body: "## Report" };
const receipt = { operationId: "op", correlationId: "c", recipients: ["recipient@example.invalid"] };

describe("a record-less email reply passes the tool's output schema", () => {
  it("send_email: before and after are null (preview and live)", async () => {
    for (const state of ["simulated", "sent"]) {
      reply = { state, before: null, after: null, receipt };
      const result = await client.callTool({ name: "anydb_agent_send_email", arguments: { ...scope, input: emailInput } });
      expect(result.isError).toBeFalsy();
      expect(result.structuredContent).toMatchObject({ state, before: null, after: null });
    }
  });

  it("email_report: the same shape", async () => {
    reply = { state: "simulated", before: null, after: null, receipt: { ...receipt, attachment: { filename: "Backlog.csv", bytes: 12 } } };
    const result = await client.callTool({ name: "anydb_agent_email_report", arguments: { ...scope, input: { reportId: "r", format: "csv", to: ["recipient@example.invalid"] } } });
    expect(result.isError).toBeFalsy();
  });

  it("an email tied to a record still carries that record's snapshots", async () => {
    const snapshot = { name: "Issue", templateName: "Issue", revision: "rev", values: {}, locks: {} };
    reply = { state: "sent", before: snapshot, after: null, receipt };
    const result = await client.callTool({ name: "anydb_agent_send_email", arguments: { ...scope, input: { ...emailInput, adoid: "a", expectedRevision: "rev" } } });
    expect(result.isError).toBeFalsy();
  });

  it("an empty snapshot is still refused: the server must send null, not a snapshot with no revision", async () => {
    // This is the reply that failed every Dev1 agent email with MCP error -32602.
    reply = { state: "simulated", before: { name: "", templateName: "", revision: "", values: {}, locks: {} }, after: null, receipt };
    await expect(client.callTool({ name: "anydb_agent_send_email", arguments: { ...scope, input: emailInput } })).rejects.toThrow(/output schema/);
  });
});
