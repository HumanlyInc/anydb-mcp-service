import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createServer, type Server } from "node:http";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createMcpServer } from "../mcp.js";
import { readSolutionResource, SOLUTION_BUILDING_GUIDE_URI } from "../solution-resources.js";

/**
 * ISSUE - 501. Email is an option on the call that produces a report export or a generated document.
 * There is no general send-email tool, and nothing a caller can say attaches any other file.
 *
 * Pins the contract this server advertises and forwards: tool shapes, annotations, strict parameters,
 * what is sent to the AnyDB API and what is never sent. Whether the server then refuses a bad address or
 * a Free plan is the server's job and is tested there (ext.reports.email.test.ts and friends).
 */
describe("email on report export and document generation", () => {
  let api: Server;
  let server: ReturnType<typeof createMcpServer>;
  let client: Client;
  let logs: ReturnType<typeof jest.spyOn>;
  let seen: Array<{ method?: string; url?: string; headers: any; body: any }> = [];

  const emptySnapshot = { name: "", templateName: "", revision: "", values: {}, locks: {} };
  const outcome = {
    state: "sent",
    before: emptySnapshot,
    after: null,
    receipt: { operationId: "op", correlationId: "c", messageId: "<artifact-1@anydb.com>", recipients: ["a@x.com"], attachment: { filename: "Backlog.csv", bytes: 42 } },
  };

  beforeEach(async () => {
    seen = [];
    logs = jest.spyOn(console, "error").mockImplementation(() => {});
    api = createServer((req, res) => {
      let raw = "";
      req.on("data", (chunk) => (raw += chunk));
      req.on("end", () => {
        seen.push({ method: req.method, url: req.url, headers: req.headers, body: raw ? JSON.parse(raw) : undefined });
        res.setHeader("Content-Type", "application/json");
        const data = req.url?.includes("/agent/operation")
          ? outcome
          : { success: true, operation: "email_report", reportId: "r", email: { state: "sent", recipients: ["a@x.com"] } };
        res.end(JSON.stringify({ status: "success", data }));
      });
    });
    await new Promise<void>((resolve) => api.listen(0, "127.0.0.1", resolve));
    server = createMcpServer({
      apiKey: "synthetic-key",
      userEmail: "agent@example.invalid",
      agentCapability: "synthetic-secret",
      baseURL: `http://127.0.0.1:${(api.address() as any).port}/api`,
    } as any);
    client = new Client({ name: "email-test", version: "1" });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(st), client.connect(ct)]);
  });
  afterEach(async () => {
    await client?.close();
    await server?.close();
    await new Promise<void>((resolve) => api.close(() => resolve()));
    logs.mockRestore();
  });

  const tool = async (name: string) => (await client.listTools()).tools.find((t) => t.name === name) as any;
  const call = (name: string, args: any) => client.callTool({ name, arguments: args });
  const ids = { teamid: "6aa04513740f7dca84450aa8", adbid: "6aa0455c740f7dca84450aaf", reportId: "6ac51a3d408180c439a5c5fc" };
  const good = (extra: any = {}) => ({ ...ids, format: "csv", to: ["a@x.com"], clientRequestId: "send-1", ...extra });

  describe("the contract that is advertised", () => {
    it("there is no general send-email tool, and no email tool takes a file, a path, a body or a sender", async () => {
      const tools = (await client.listTools()).tools as any[];
      const emailTools = tools.filter((t) => /e-?mail/i.test(t.name)).map((t) => t.name).sort();
      expect(emailTools).toEqual(
        ["anydb_agent_email_document", "anydb_agent_email_report", "anydb_agent_send_email", "anydb_email_report"].sort(),
      );
      // Nothing sends a notification or a message under another name either.
      expect(tools.map((t) => t.name).filter((n) => /notif|sendmessage|send_message|smtp|(^|_)mail(_|$)/i.test(n))).toEqual([]);
      const forbidden = ["attachments", "attachment", "file", "files", "filePath", "path", "url", "html", "cc", "bcc", "from", "replyTo", "sender"];
      for (const name of ["anydb_email_report", "anydb_agent_email_report", "anydb_agent_email_document"]) {
        const t = tools.find((candidate) => candidate.name === name);
        const props = Object.keys(t.inputSchema.properties.input?.properties ?? t.inputSchema.properties);
        for (const bad of forbidden) expect(props).not.toContain(bad);
        // Subject and body are the agent's own words only on the plain summary tool, never on these.
        expect(props).not.toContain("subject");
        expect(props).not.toContain("body");
      }
    });

    it("anydb_email_report: shape, required fields and annotations (it reaches outside the workspace)", async () => {
      const t = await tool("anydb_email_report");
      expect(t.inputSchema.additionalProperties).toBe(false);
      expect(t.inputSchema.required).toEqual(["teamid", "adbid", "reportId", "format", "to", "clientRequestId"]);
      expect(t.inputSchema.properties.format.enum).toEqual(["csv", "xlsx"]);
      expect(t.inputSchema.properties.to).toMatchObject({ type: "array", minItems: 1, maxItems: 25 });
      expect(t.inputSchema.properties.note.maxLength).toBe(2000);
      // ISSUE - 564: a sent email cannot be recalled, so OpenAI held this tool while it said destructiveHint: false.
      expect(t.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true, openWorldHint: true });
    });

    it("anydb_email_report's description states every limit an LLM must respect", async () => {
      const text = (await tool("anydb_email_report")).description as string;
      for (const phrase of [
        /NOT a general email tool/,
        /no file, path, URL or message body/,
        /any email address/,
        /Business or Enterprise/,
        /daily email limit/,
        /LAST READY snapshot/,
        /refresh:true/,
        /sends NOTHING/,
        /5 MB/,
        /clientRequestId is required/,
        /REUSE it/,
        /unknown/,
        /do NOT retry with a new id/,
      ]) {
        expect(text).toMatch(phrase);
      }
    });

    it("anydb_generate_document: the email block is optional, strict, and the tool is marked as reaching outside", async () => {
      const t = await tool("anydb_generate_document");
      expect(t.inputSchema.required).toEqual(["teamid", "adbid", "docgenId", "adoid"]);
      const email = t.inputSchema.properties.email;
      expect(email).toMatchObject({ type: "object", additionalProperties: false, required: ["to", "clientRequestId"] });
      expect(Object.keys(email.properties).sort()).toEqual(["clientRequestId", "note", "to"]);
      expect(email.description).toMatch(/nothing else/i);
      expect(email.description).toMatch(/BEFORE anything is generated/);
      expect(t.annotations).toMatchObject({ readOnlyHint: false, openWorldHint: true });
    });

    it("the authoring guide teaches the rules, the states and the agent scope", () => {
      const text = readSolutionResource(SOLUTION_BUILDING_GUIDE_URI).text;
      expect(text).toContain("### Emailing a report or a generated document");
      expect(text).toMatch(/no general send-email tool/);
      expect(text).toMatch(/any\*\* domain/);
      expect(text).toMatch(/`clientRequestId`/);
      expect(text).toMatch(/do \*\*not\*\* retry with a new id/);
      expect(text).toMatch(/### Custom agents: emailing a report or a summary/);
      expect(text).toMatch(/artifacts\.reports/);
    });
  });

  describe("anydb_email_report forwards exactly what the caller asked", () => {
    it("posts to the report's email route with the body unchanged and no report id in it", async () => {
      const result = await call("anydb_email_report", good({ note: "Weekly", refresh: true, generationId: "gen-1" }));
      expect(result.isError).toBeFalsy();
      expect(seen).toHaveLength(1);
      expect(seen[0]!.method).toBe("POST");
      expect(seen[0]!.url).toBe(`/api/integrations/ext/reports/${ids.reportId}/email`);
      expect(seen[0]!.body).toEqual({
        teamid: ids.teamid, adbid: ids.adbid, format: "csv", to: ["a@x.com"], clientRequestId: "send-1",
        note: "Weekly", refresh: true, generationId: "gen-1",
      });
      expect(JSON.parse((result.content as any)[0].text)).toMatchObject({ operation: "email_report", email: { state: "sent" } });
    });

    it("omits what was not given (the server applies its own defaults)", async () => {
      await call("anydb_email_report", good());
      expect(Object.keys(seen[0]!.body).sort()).toEqual(["adbid", "clientRequestId", "format", "teamid", "to"]);
    });

    it.each([
      ["an attachments list", { attachments: ["/etc/passwd"] }],
      ["a file path", { path: "/etc/passwd" }],
      ["a file", { file: "/etc/passwd" }],
      ["a url", { url: "http://169.254.169.254/latest/meta-data" }],
      ["a body", { body: "<script>steal()</script>" }],
      ["an html field", { html: "<b>x</b>" }],
      ["a subject", { subject: "Wire the money" }],
      ["a sender", { from: "ceo@bank.example" }],
      ["a cc", { cc: ["x@y.com"] }],
      ["a bcc", { bcc: ["x@y.com"] }],
      ["a misspelt parameter", { clientRequestID: "x" }],
    ])("refuses %s and sends nothing to AnyDB", async (_label, extra) => {
      const result = await call("anydb_email_report", good(extra));
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toMatch(/unknown parameter/);
      expect(seen).toEqual([]);
    });
  });

  describe("anydb_generate_document forwards the email block untouched", () => {
    const generate = (extra: any = {}) => call("anydb_generate_document", { teamid: ids.teamid, adbid: ids.adbid, docgenId: "dg-1", adoid: ids.reportId, ...extra });

    it("passes email through as given, so the server's own refusals apply", async () => {
      const email = { to: ["a@x.com", "b@y.org"], note: "Here", clientRequestId: "g-1" };
      const result = await generate({ email, asPdf: false });
      expect(result.isError).toBeFalsy();
      expect(seen[0]!.url).toBe("/api/integrations/ext/docgentemplates/generate");
      expect(seen[0]!.body).toEqual({ teamid: ids.teamid, adbid: ids.adbid, docgenId: "dg-1", adoid: ids.reportId, asPdf: false, email });
    });

    it("an unknown key INSIDE the email block (a smuggled path) is forwarded, not hidden: the server refuses it", async () => {
      await generate({ email: { to: ["a@x.com"], clientRequestId: "g-2", attachments: ["/etc/passwd"] } });
      expect(seen[0]!.body.email.attachments).toEqual(["/etc/passwd"]);
    });

    it("without an email block the request is exactly what it was before this feature", async () => {
      await generate();
      expect(seen[0]!.body).toEqual({ teamid: ids.teamid, adbid: ids.adbid, docgenId: "dg-1", adoid: ids.reportId });
      expect("email" in seen[0]!.body).toBe(false);
    });

    it.each([
      ["a top-level attachments list", { attachments: ["/etc/passwd"] }],
      ["a top-level path", { path: "/etc/passwd" }],
      ["a recipient list outside the email block", { to: ["a@x.com"] }],
    ])("refuses %s", async (_label, extra) => {
      const result = await generate(extra);
      expect(result.isError).toBe(true);
      expect(seen).toEqual([]);
    });
  });

  describe("agent tools", () => {
    const scope = { teamid: ids.teamid, adbid: ids.adbid, runId: "run-1", operationId: "op-1" };

    it("email_report is forwarded through the operation route with the capability header and its own kind", async () => {
      const args = { ...scope, input: { reportId: "rep1", format: "csv", refresh: true, to: ["a@x.com"], note: "Weekly" } };
      const result = await call("anydb_agent_email_report", args);
      expect(result.isError).toBeFalsy();
      expect(result.structuredContent).toMatchObject({ state: "sent", receipt: { attachment: { filename: "Backlog.csv", bytes: 42 } } });
      expect(seen[0]!.url).toBe("/api/integrations/ext/agent/operation");
      expect(seen[0]!.body).toEqual({ ...args, kind: "email_report" });
      expect(seen[0]!.headers["x-anydb-agent-capability"]).toBe("synthetic-secret");
      expect(JSON.stringify(logs.mock.calls)).not.toContain("synthetic-secret");
    });

    it("email_document needs the record and the revision the agent read", async () => {
      const input = { adoid: "rec1", expectedRevision: "rev1", docgenId: "dg-1", to: ["a@x.com"] };
      const ok = await call("anydb_agent_email_document", { ...scope, input });
      expect(ok.isError).toBeFalsy();
      expect(seen[0]!.body.kind).toBe("email_document");
      seen = [];
      for (const missing of ["adoid", "expectedRevision"]) {
        const { [missing]: _drop, ...rest } = input as any;
        expect((await call("anydb_agent_email_document", { ...scope, input: rest })).isError).toBe(true);
      }
      expect(seen).toEqual([]);
    });

    it("the summary email needs no record; a record without its revision (or the reverse) is refused", async () => {
      const summary = { to: ["a@x.com"], subject: "Backlog report", body: "At a glance" };
      expect((await call("anydb_agent_send_email", { ...scope, input: summary })).isError).toBeFalsy();
      expect(seen[0]!.body).toEqual({ ...scope, input: summary, kind: "send_email" });
      expect((await call("anydb_agent_send_email", { ...scope, input: { ...summary, adoid: "rec1", expectedRevision: "rev1" } })).isError).toBeFalsy();
      seen = [];
      expect((await call("anydb_agent_send_email", { ...scope, input: { ...summary, adoid: "rec1" } })).isError).toBe(true);
      expect((await call("anydb_agent_send_email", { ...scope, input: { ...summary, expectedRevision: "rev1" } })).isError).toBe(true);
      expect(seen).toEqual([]);
    });

    it.each([
      ["anydb_agent_email_report", { reportId: "rep1", format: "csv", to: ["a@x.com"] }],
      ["anydb_agent_email_document", { adoid: "rec1", expectedRevision: "rev1", docgenId: "dg-1", to: ["a@x.com"] }],
      ["anydb_agent_send_email", { to: ["a@x.com"], subject: "s", body: "b" }],
    ])("%s refuses any file, path, sender or identity injection", async (name, input) => {
      for (const extra of [
        { attachments: ["/etc/passwd"] }, { path: "/etc/passwd" }, { file: "/etc/passwd" }, { from: "ceo@bank.example" },
        { cc: ["x@y.com"] }, { executionUserId: "admin" },
      ]) {
        const result = await call(name, { ...scope, input: { ...input, ...extra } });
        expect(result.isError).toBe(true);
      }
      // Identity and mode cannot be injected at the top level either.
      expect((await call(name, { ...scope, input, executionUserId: "admin" })).isError).toBe(true);
      expect((await call(name, { ...scope, input, simulate: false })).isError).toBe(true);
      expect(seen).toEqual([]);
    });

    it.each([
      ["no recipients", { to: [] }],
      ["a malformed address", { to: ["nobody"] }],
      ["more than 25 recipients", { to: Array.from({ length: 26 }, (_v, i) => `u${i}@x.com`) }],
      ["a note over 2000 characters", { note: "x".repeat(2001) }],
      ["pdf as a report format", { format: "pdf" }],
    ])("anydb_agent_email_report refuses %s", async (_label, extra) => {
      const result = await call("anydb_agent_email_report", { ...scope, input: { reportId: "rep1", format: "csv", to: ["a@x.com"], ...extra } });
      expect(result.isError).toBe(true);
      expect(seen).toEqual([]);
    });

    it("a refusal from the server is reported to the model, not swallowed", async () => {
      await new Promise<void>((resolve) => api.close(() => resolve()));
      api = createServer((_req, res) => {
        res.statusCode = 403;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ status: "error", message: "Report or document template is outside saved agent scope" }));
      });
      await new Promise<void>((resolve) => api.listen((server as any)?.port ?? 0, "127.0.0.1", resolve));
      const bad = createMcpServer({
        apiKey: "k", userEmail: "agent@example.invalid", agentCapability: "s",
        baseURL: `http://127.0.0.1:${(api.address() as any).port}/api`,
      } as any);
      const c = new Client({ name: "t", version: "1" });
      const [ct, st] = InMemoryTransport.createLinkedPair();
      await Promise.all([bad.connect(st), c.connect(ct)]);
      try {
        const result = await c.callTool({ name: "anydb_agent_email_report", arguments: { ...scope, input: { reportId: "other", format: "csv", to: ["a@x.com"] } } });
        expect(result.isError).toBe(true);
        expect(JSON.stringify(result.content)).toMatch(/outside saved agent scope|403/);
      } finally {
        await c.close();
        await bad.close();
      }
    });

    it("the summary email tool tells the model what formatting is rendered and what never is", async () => {
      const text = (await tool("anydb_agent_send_email")).description as string;
      expect(text).toMatch(/light markdown/);
      expect(text).toMatch(/formatted business email/);
      expect(text).toMatch(/pipe tables/);
      expect(text).toMatch(/http or https only/);
      expect(text).toMatch(/Raw HTML is never rendered/);
      expect(text).toMatch(/no images, colours or attachments/);
      const guide = readSolutionResource(SOLUTION_BUILDING_GUIDE_URI).text;
      expect(guide).toMatch(/light markdown/);
      expect(guide).toMatch(/Raw HTML is never rendered/);
    });

    it("advertises the receipt fields an agent needs to describe what happened", async () => {
      const t = await tool("anydb_agent_email_report");
      expect(t.outputSchema.properties.receipt.properties).toMatchObject({
        recipients: { type: "array" },
        attachment: { type: "object" },
        note: { type: "string" },
      });
      // ISSUE - 564: sending cannot be undone, so the email tools are destructive as well as open-world.
      expect(t.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true, openWorldHint: true });
      expect(t.description).toMatch(/cannot attach anything else or write the message/);
      expect(t.description).toMatch(/simulated/);
      expect(t.description).toMatch(/nothing is sent/);
      expect(t.inputSchema.properties.input.properties).not.toHaveProperty("adoid");
    });
  });
});
