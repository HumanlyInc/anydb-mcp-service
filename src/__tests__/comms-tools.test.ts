import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createServer, type Server } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../mcp.js";

/**
 * The Communications support-agent tools. A stub HTTP server stands in for anydb-server, so this
 * pins the contract between each tool and its route (path, query, body, error pass-through). It does
 * not prove any server behaviour: that is test/integration/ext.comms.test.ts in anydb-server.
 */
const COMMS_TOOL_NAMES = [
  "anydb_list_comm_accounts",
  "anydb_list_conversations",
  "anydb_get_conversation",
  "anydb_send_conversation_reply",
  "anydb_update_conversation",
  "anydb_retry_message",
];

describe("Communications MCP tools", () => {
  let api: Server;
  let server: ReturnType<typeof createMcpServer>;
  let client: Client;
  let seen: { method?: string; url?: string; body: unknown }[];
  let response: unknown;
  let statusCode: number;
  /** When set, a refusal's message is this instead of the fixed text (a server may echo what it was sent). */
  let refusalMessage: string | undefined;
  let logs: ReturnType<typeof jest.spyOn>;
  const T = "64b000000000000000000001";
  const A = "64b000000000000000000002";
  const C = "64b000000000000000000003";

  async function connect(toolProfile: "full" | "reviewed") {
    server = createMcpServer({
      apiKey: "test-key",
      userEmail: "agent@example.com",
      baseURL: `http://127.0.0.1:${(api.address() as { port: number }).port}/api`,
      toolProfile,
    });
    client = new Client({ name: "comms-tools-test", version: "1" });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(st), client.connect(ct)]);
  }

  beforeEach(async () => {
    seen = [];
    response = { ok: true };
    statusCode = 200;
    refusalMessage = undefined;
    logs = jest.spyOn(console, "error").mockImplementation(() => {});
    api = createServer((req, res) => {
      let raw = "";
      req.on("data", (chunk) => { raw += chunk; });
      req.on("end", () => {
        seen.push({ method: req.method, url: req.url, body: raw ? JSON.parse(raw) : undefined });
        res.statusCode = statusCode;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({
          status: statusCode === 200 ? "success" : "error",
          data: response,
          message: statusCode === 200 ? undefined : (refusalMessage ?? "You need edit access to this conversation to reply"),
        }));
      });
    });
    await new Promise<void>((resolve, reject) => { api.once("error", reject); api.listen(0, "127.0.0.1", resolve); });
    await connect("full");
  });

  afterEach(async () => {
    await client?.close();
    await server?.close();
    await new Promise<void>((resolve) => api.close(() => resolve()));
    logs.mockRestore();
  });

  const call = (name: string, args: Record<string, unknown>) => client.callTool({ name, arguments: args });
  const toolNamed = async (name: string) => (await client.listTools()).tools.find((tool) => tool.name === name) as any;

  it("advertises the six tools with the right side-effect hints", async () => {
    const expected = [
      ["anydb_list_comm_accounts", true, false, false],
      ["anydb_list_conversations", true, false, false],
      ["anydb_get_conversation", true, false, false],
      ["anydb_send_conversation_reply", false, true, true],
      ["anydb_update_conversation", false, true, true],
      ["anydb_retry_message", false, true, true],
    ] as const;
    for (const [name, readOnlyHint, destructiveHint, openWorldHint] of expected) {
      expect((await toolNamed(name))?.annotations).toMatchObject({ readOnlyHint, destructiveHint, openWorldHint });
    }
  });

  it("the reply tool takes no recipient and requires a clientRequestId", async () => {
    const tool = await toolNamed("anydb_send_conversation_reply");
    expect(Object.keys(tool.inputSchema.properties)).not.toContain("to");
    expect(Object.keys(tool.inputSchema.properties)).not.toContain("attachments");
    expect(tool.inputSchema.required).toEqual(["teamid", "adbid", "conversationId", "clientRequestId"]);
  });

  // The server treats an explicit false on WhatsApp as "not given", but a schema default would make a
  // client send replyAll/includeQuote on every call. Neither may carry a default.
  it("the reply tool's schema carries no default for replyAll or includeQuote", async () => {
    const properties = (await toolNamed("anydb_send_conversation_reply")).inputSchema.properties;
    expect(properties.replyAll).not.toHaveProperty("default");
    expect(properties.includeQuote).not.toHaveProperty("default");
  });

  it("the reply tool says it is plain text, asynchronous, length-limited for WhatsApp and needs edit access", async () => {
    const { description } = await toolNamed("anydb_send_conversation_reply");
    expect(description).toMatch(/plain text/i);
    expect(description).toMatch(/background/i);
    expect(description).toMatch(/4096/);
    expect(description).toMatch(/edit access/i);
    expect(description).toMatch(/clientRequestId/);
  });

  // OpenAI's plugin review compares annotations and descriptions with behaviour: an update starts workflows
  // (so it is open-world, like update_record), and the irreversible sends must say to send only when asked.
  it("the update tool says a record update can start workflows that send messages", async () => {
    expect((await toolNamed("anydb_update_conversation")).description).toMatch(/start workflows[^.]*send messages/i);
  });

  it("the send and retry tools say to act only when the user asked", async () => {
    expect((await toolNamed("anydb_send_conversation_reply")).description).toContain("Send only when the user has asked for this message to be sent.");
    expect((await toolNamed("anydb_retry_message")).description).toContain("Retry only when the user has asked to send this message again.");
  });

  it("the read tool tells the model that message bodies are untrusted", async () => {
    expect((await toolNamed("anydb_get_conversation")).description).toMatch(/untrusted/i);
  });

  // The server refuses a ticket priority outside this list and a pipeline change without a status; the
  // model cannot discover either from the ticketConfig alone, so the description has to say so.
  it("the update tool names the valid priorities and the pipeline rule", async () => {
    const tool = await toolNamed("anydb_update_conversation");
    for (const priority of ["Low", "Medium", "High", "Urgent"]) expect(tool.description).toContain(priority);
    expect(tool.description).toMatch(/pipeline.{0,40}(needs|requires).{0,40}status/i);
    for (const priority of ["Low", "Medium", "High", "Urgent"]) expect(tool.inputSchema.properties.ticket.properties.priority.description).toContain(priority);
  });

  it("each tool calls its route with the server's parameter names", async () => {
    await call("anydb_list_comm_accounts", { teamid: T, channel: "EMAIL" });
    await call("anydb_list_conversations", { teamid: T, accountId: "3f6c1a52-8d4e-4b7a-9c21-5e0a7d94b6f3", status: "Open", unread: true, assignedToMe: true, ticketStatus: "new", priority: "High", pageSize: 10, cursor: "abc" });
    await call("anydb_get_conversation", { teamid: T, adbid: A, conversationId: C, messageLimit: 20 });
    await call("anydb_send_conversation_reply", { teamid: T, adbid: A, conversationId: C, clientRequestId: "r1", body: "Hello", replyAll: true });
    await call("anydb_update_conversation", { teamid: T, adbid: A, conversationId: C, unread: false, ticket: { status: "closed" } });
    await call("anydb_retry_message", { teamid: T, adbid: A, messageId: C });

    const parse = (url: string) => new URL(url, "http://x");
    expect(seen).toHaveLength(6);
    const [accounts, list, get, reply, update, retry] = seen;
    expect(accounts!.method).toBe("GET");
    expect(parse(accounts!.url!).pathname).toBe("/api/integrations/ext/comms/accounts");
    expect(Object.fromEntries(parse(accounts!.url!).searchParams)).toEqual({ teamid: T, channel: "EMAIL" });
    expect(list!.method).toBe("GET");
    expect(parse(list!.url!).pathname).toBe("/api/integrations/ext/comms/conversations");
    expect(Object.fromEntries(parse(list!.url!).searchParams)).toEqual({
      teamid: T, accountid: "3f6c1a52-8d4e-4b7a-9c21-5e0a7d94b6f3", status: "Open", unread: "true", assignedtome: "true", ticketstatus: "new", priority: "High", pagesize: "10", cursor: "abc",
    });
    expect(get!.method).toBe("GET");
    expect(parse(get!.url!).pathname).toBe(`/api/integrations/ext/comms/conversations/${C}`);
    expect(Object.fromEntries(parse(get!.url!).searchParams)).toEqual({ teamid: T, adbid: A, messagelimit: "20" });
    expect(reply).toMatchObject({ method: "POST", url: `/api/integrations/ext/comms/conversations/${C}/reply`, body: { teamid: T, adbid: A, clientRequestId: "r1", body: "Hello", replyAll: true } });
    expect(update).toMatchObject({ method: "POST", url: `/api/integrations/ext/comms/conversations/${C}/update`, body: { teamid: T, adbid: A, unread: false, ticket: { status: "closed" } } });
    expect(retry).toMatchObject({ method: "POST", url: `/api/integrations/ext/comms/messages/${C}/retry`, body: { teamid: T, adbid: A } });
  });

  it("unread false and assignedToMe false are sent as the strings the server accepts", async () => {
    await call("anydb_list_conversations", { teamid: T, accountId: "3f6c1a52-8d4e-4b7a-9c21-5e0a7d94b6f3", unread: false, assignedToMe: false });
    const params = Object.fromEntries(new URL(seen[0]!.url!, "http://x").searchParams);
    expect(params).toMatchObject({ unread: "false", assignedtome: "false" });
  });

  it("a reply that omits replyAll and includeQuote sends neither", async () => {
    await call("anydb_send_conversation_reply", { teamid: T, adbid: A, conversationId: C, clientRequestId: "r6", body: "Hi" });
    expect(Object.keys(seen[0]!.body as object).sort()).toEqual(["adbid", "body", "clientRequestId", "teamid"]);
  });

  it("assignedTo null reaches the server as null (unassign)", async () => {
    const result = await call("anydb_update_conversation", { teamid: T, adbid: A, conversationId: C, assignedTo: null });
    expect(result.isError).toBeFalsy();
    expect(seen).toHaveLength(1);
    expect(seen[0]!.body).toHaveProperty("assignedTo", null);
  });

  it("ticket.assignedTeam group ids reach the server", async () => {
    const groups = ["64b000000000000000000010", "64b000000000000000000011"];
    const result = await call("anydb_update_conversation", { teamid: T, adbid: A, conversationId: C, ticket: { assignedTeam: groups } });
    expect(result.isError).toBeFalsy();
    expect((seen[0]!.body as any).ticket).toEqual({ assignedTeam: groups });
  });

  it("a malformed id is refused before any request", async () => {
    const result = await call("anydb_get_conversation", { teamid: T, adbid: A, conversationId: "not-an-id" });
    expect(result.isError).toBe(true);
    expect(seen).toHaveLength(0);
  });

  it("a server refusal comes back as a tool error carrying the server's message", async () => {
    statusCode = 403;
    const result = await call("anydb_send_conversation_reply", { teamid: T, adbid: A, conversationId: C, clientRequestId: "r2", body: "x" });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("edit access");
  });

  it("unknown arguments are refused before any request", async () => {
    const result = await call("anydb_send_conversation_reply", { teamid: T, adbid: A, conversationId: C, clientRequestId: "r3", body: "x", to: "+1555" });
    expect(result.isError).toBe(true);
    expect(seen).toHaveLength(0);
  });

  it("message bodies are not written to the server log, on success or failure", async () => {
    const out = jest.spyOn(console, "log").mockImplementation(() => {});
    try {
      await call("anydb_send_conversation_reply", { teamid: T, adbid: A, conversationId: C, clientRequestId: "r4", body: "Secret customer detail" });
      statusCode = 403;
      await call("anydb_send_conversation_reply", { teamid: T, adbid: A, conversationId: C, clientRequestId: "r5", body: "Secret customer detail" });
      expect(JSON.stringify([...logs.mock.calls, ...out.mock.calls])).not.toContain("Secret customer detail");
      // The request log line is still written, with the arguments replaced.
      expect(JSON.stringify(logs.mock.calls)).toContain("anydb_send_conversation_reply");
      expect(JSON.stringify(logs.mock.calls)).toContain("[REDACTED");
    } finally {
      out.mockRestore();
    }
  });

  it("a server error that echoes the message body is returned to the caller but not logged", async () => {
    statusCode = 400;
    refusalMessage = "Rejected: Secret customer detail";
    const result = await call("anydb_send_conversation_reply", { teamid: T, adbid: A, conversationId: C, clientRequestId: "r7", body: "Secret customer detail" });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("Secret customer detail");
    expect(JSON.stringify(logs.mock.calls)).not.toContain("Secret customer detail");
  });

  it("an argument validation failure does not log the rejected value", async () => {
    // An invalid enum value is echoed back in the validation message; the log must not carry it.
    const result = await call("anydb_update_conversation", { teamid: T, adbid: A, conversationId: C, status: "Customer-secret-status" });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(logs.mock.calls)).not.toContain("Customer-secret-status");
  });

  it("every tool's arguments are redacted in the request log", async () => {
    await call("anydb_list_conversations", { teamid: T, accountId: "9b1e7c44-2a60-4d8f-8f35-71c2e4a0d5b8" });
    await call("anydb_get_conversation", { teamid: T, adbid: A, conversationId: C });
    expect(JSON.stringify(logs.mock.calls)).not.toContain("9b1e7c44-2a60-4d8f-8f35-71c2e4a0d5b8");
  });

  describe("tool profiles", () => {
    it("the full profile lists all six", async () => {
      const names = (await client.listTools()).tools.map((tool) => tool.name);
      for (const name of COMMS_TOOL_NAMES) expect(names).toContain(name);
    });

    // ISSUE-650 owner decision 2026-10-14: the OpenAI-facing profile exposes these tools too. Do not
    // add them back to HIDDEN_REVIEWED_TOOLS without a new decision.
    it("the reviewed profile lists all six with the same annotations as the full profile", async () => {
      const full = (await client.listTools()).tools;
      await client.close();
      await server.close();
      await connect("reviewed");
      const reviewed = (await client.listTools()).tools;
      for (const name of COMMS_TOOL_NAMES) {
        const onReviewed = reviewed.find((tool) => tool.name === name);
        expect(onReviewed).toBeDefined();
        expect(onReviewed!.annotations).toEqual(full.find((tool) => tool.name === name)!.annotations);
        expect(onReviewed!.description).toBe(full.find((tool) => tool.name === name)!.description);
      }
    });

    it("a call on the reviewed profile reaches the server like on the full profile", async () => {
      await client.close();
      await server.close();
      await connect("reviewed");
      const read = await call("anydb_get_conversation", { teamid: T, adbid: A, conversationId: C });
      const send = await call("anydb_send_conversation_reply", { teamid: T, adbid: A, conversationId: C, clientRequestId: "r8", body: "x" });
      expect(read.isError).toBeFalsy();
      expect(send.isError).toBeFalsy();
      expect(seen.map((request) => [request.method, new URL(request.url!, "http://x").pathname])).toEqual([
        ["GET", `/api/integrations/ext/comms/conversations/${C}`],
        ["POST", `/api/integrations/ext/comms/conversations/${C}/reply`],
      ]);
    });
  });
});
