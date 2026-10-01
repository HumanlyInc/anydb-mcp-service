import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createServer, type Server } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../mcp.js";

describe("recipient shared-form MCP tools (ISSUE - 440)", () => {
  let api: Server;
  let server: ReturnType<typeof createMcpServer>;
  let client: Client;
  let seen: { method?: string; url?: string; body: unknown }[];
  let response: unknown;
  let statusCode: number;
  let logs: ReturnType<typeof jest.spyOn>;
  const base = "/api/integrations/ext/shared-forms";
  beforeEach(async () => {
    seen = [];
    response = { shareId: "s1", name: "Expenses", teamid: "t1", adbid: "a1", fields: [], unsupported: [] };
    statusCode = 200;
    logs = jest.spyOn(console, "error").mockImplementation(() => {});
    api = createServer((req, res) => {
      let raw = "";
      req.on("data", chunk => { raw += chunk; });
      req.on("end", () => {
        seen.push({ method: req.method, url: req.url, body: raw ? JSON.parse(raw) : undefined });
        res.statusCode = statusCode;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ status: statusCode === 200 ? "success" : "error", data: response, message: statusCode === 200 ? undefined : "Share access denied" }));
      });
    });
    await new Promise<void>((resolve, reject) => { api.once("error", reject); api.listen(0, "127.0.0.1", resolve); });
    server = createMcpServer({ apiKey: "test-key", userEmail: "recipient@example.com", baseURL: `http://127.0.0.1:${(api.address() as { port: number }).port}/api` });
    client = new Client({ name: "recipient-form-test", version: "1" });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(st), client.connect(ct)]);
  });
  afterEach(async () => {
    await client?.close();
    await server?.close();
    await new Promise<void>(resolve => api.close(() => resolve()));
    logs.mockRestore();
  });
  async function call(name: string, args: Record<string, unknown>) {
    return await client.callTool({ name, arguments: args });
  }
  it("advertises recipient discovery and separates reading, draft writes, and finalization side effects", async () => {
    const { tools } = await client.listTools();
    const expected = [
      ["anydb_list_shared_records", true, false, false],
      ["anydb_get_shared_record", true, false, false],
      ["anydb_list_shared_forms", true, false, false],
      ["anydb_get_shared_form", true, false, false],
      ["anydb_start_form_submission", false, false, false],
      ["anydb_get_form_submission", true, false, false],
      ["anydb_update_form_submission", false, true, false],
      ["anydb_submit_form_submission", false, true, true],
    ] as const;
    for (const [name, readOnlyHint, destructiveHint, openWorldHint] of expected) {
      expect(tools.find(tool => tool.name === name)?.annotations).toMatchObject({ readOnlyHint, destructiveHint, openWorldHint });
    }
  });
  it("discovers recipient records and reads their shared fields by ID or URL", async () => {
    response = { items: [{ shareId: "r1", name: "Project" }], total: 1, offset: 0, limit: 10 };
    expect((await call("anydb_list_shared_records", { search: "Project", offset: 0, limit: 10 })).isError).toBeFalsy();
    response = { shareId: "r1", name: "Project", teamid: "t1", adbid: "a1", recordId: "record1", fields: [{ name: "Budget", value: 12 }] };
    const result = await call("anydb_get_shared_record", { shareId: "r1" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse((result.content as any)[0].text)).toEqual(response);
    expect((await call("anydb_get_shared_record", { shareUrl: "https://app.anydb.com/share/r1" })).isError).toBeFalsy();
    expect(seen.map(item => item.url)).toEqual([
      "/api/integrations/ext/shared-records?search=Project&offset=0&limit=10",
      "/api/integrations/ext/shared-records/r1",
      "/api/integrations/ext/shared-records/resolve?shareUrl=https:%2F%2Fapp.anydb.com%2Fshare%2Fr1",
    ]);
  });
  it("lists authorized forms with filters and pagination intact", async () => {
    response = { items: [{ shareId: "s1", name: "Expenses" }], total: 3, offset: 0, limit: 2 };
    const result = await call("anydb_list_shared_forms", { search: "Expenses", teamid: "t1", adbid: "a1", offset: 0, limit: 2 });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse((result.content as any)[0].text)).toEqual(response);
    expect(seen).toEqual([{ method: "GET", url: `${base}?search=Expenses&teamid=t1&adbid=a1&offset=0&limit=2`, body: undefined }]);
  });
  it("resolves a URL through the authenticated API and safely encodes share IDs", async () => {
    const shareUrl = "https://app.anydb.com/share/private-token";
    expect((await call("anydb_get_shared_form", { shareUrl })).isError).toBeFalsy();
    expect((await call("anydb_get_shared_form", { shareId: "a/b" })).isError).toBeFalsy();
    expect(new URL(seen[0].url!, "http://localhost").pathname).toBe(`${base}/resolve`);
    expect(new URL(seen[0].url!, "http://localhost").searchParams.get("shareUrl")).toBe(shareUrl);
    expect(seen[1].url).toBe(`${base}/a%2Fb`);
    expect(JSON.stringify(logs.mock.calls)).not.toContain("private-token");
  });
  it("starts an idempotent draft, reads, updates scalar values and returns the final receipt", async () => {
    response = { submissionId: "d1", shareId: "s1", status: "draft", fields: {}, errors: [] };
    expect((await call("anydb_start_form_submission", { shareId: "s1", clientRequestId: "retry-key" })).isError).toBeFalsy();
    expect((await call("anydb_get_form_submission", { shareId: "s1", submissionId: "d1" })).isError).toBeFalsy();
    const fields = { Name: "Confidential expense", Amount: 12.5, Approved: false, Date: "2026-10-01", Comment: null };
    expect((await call("anydb_update_form_submission", { shareId: "s1", submissionId: "d1", fields })).isError).toBeFalsy();
    response = { submissionId: "d1", shareId: "s1", status: "submitted", submittedAt: "2026-10-01T12:00:00Z" };
    const result = await call("anydb_submit_form_submission", { shareId: "s1", submissionId: "d1" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse((result.content as any)[0].text)).toEqual(response);
    expect(seen).toEqual([
      { method: "POST", url: `${base}/s1/submissions`, body: { clientRequestId: "retry-key" } },
      { method: "GET", url: `${base}/s1/submissions/d1`, body: undefined },
      { method: "PATCH", url: `${base}/s1/submissions/d1`, body: { fields } },
      { method: "POST", url: `${base}/s1/submissions/d1/submit`, body: {} },
    ]);
    expect(JSON.stringify(logs.mock.calls)).not.toContain("Confidential expense");
  });
  it.each([
    ["anydb_get_shared_form", {}],
    ["anydb_get_shared_form", { shareId: "s1", shareUrl: "https://example.com/form" }],
    ["anydb_start_form_submission", { shareId: "s1" }],
    ["anydb_start_form_submission", { shareId: "s1", clientRequestId: " " }],
    ["anydb_get_form_submission", { shareId: "s1" }],
    ["anydb_submit_form_submission", { shareId: "s1", submissionId: " " }],
    ["anydb_update_form_submission", { shareId: "s1", submissionId: "d1", fields: [] }],
    ["anydb_list_shared_forms", { offset: -1 }],
    ["anydb_list_shared_forms", { limit: 1.5 }],
    ["anydb_list_shared_forms", { userid: "another-user" }],
  ])("rejects malformed %s arguments before requesting the API", async (name, args) => {
    expect((await call(name as string, args as Record<string, unknown>)).isError).toBe(true);
    expect(seen).toEqual([]);
  });
  it.each(["anydb_get_shared_form", "anydb_get_shared_record"])("keeps HTTP validation details out of %s logs while returning them to the caller", async name => {
    const secret = "private-rejected-share-token";
    statusCode = 400;
    response = { errors: [{ path: "shareId", message: "Invalid share ID", value: secret }] };
    const result = await call(name, { shareId: secret });
    expect(result.isError).toBe(true);
    expect(seen).toHaveLength(1);
    expect(JSON.stringify(result.content)).toContain(secret);
    expect(JSON.stringify(result.content)).toContain("Invalid share ID");
    expect(JSON.stringify(logs.mock.calls)).not.toContain(secret);
    expect(JSON.stringify(logs.mock.calls)).not.toContain("Invalid share ID");
  });
  it("rejects request keys exceeding 128 characters before sending a draft request", async () => {
    const result = await call("anydb_start_form_submission", { shareId: "s1", clientRequestId: "x".repeat(129) });
    expect(result.isError).toBe(true);
    expect(seen).toEqual([]);
  });
  it("accepts a request key at the 128-character boundary", async () => {
    const result = await call("anydb_start_form_submission", { shareId: "s1", clientRequestId: "x".repeat(128) });
    expect(result.isError).toBeFalsy();
    expect(seen[0].body).toEqual({ clientRequestId: "x".repeat(128) });
  });
  it("surfaces access denial without falling back to general record creation", async () => {
    statusCode = 403;
    const result = await call("anydb_start_form_submission", { shareId: "s1", clientRequestId: "retry-key" });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("Share access denied");
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe(`${base}/s1/submissions`);
  });
});
