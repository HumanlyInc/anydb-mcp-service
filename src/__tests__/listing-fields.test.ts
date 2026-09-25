import { describe, expect, it } from "@jest/globals";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../mcp.js";

/**
 * ISSUE - 107. `fields` on list_records, search_records and
 * search_team_records is forwarded to the ext API's `fields` query parameter,
 * which projects each item server-side (anydb-server PR #2246). What is pinned
 * here is the wire: the exact query the ext API receives, and that the tool
 * returns the projected items untouched. Omitting `fields` sends no such
 * parameter, so callers that never heard of it are unaffected.
 */
describe("ISSUE - 107: fields on the listing tools", () => {
  const TEAM = "6827785edee2def10798a276";
  const ADB = "68280b845b73485987845b58";

  async function withStubbedApi<T>(
    run: (
      baseURL: string,
      received: Array<{ url: string; query: URLSearchParams }>,
    ) => Promise<T>,
  ): Promise<T> {
    const received: Array<{ url: string; query: URLSearchParams }> = [];
    const http: HttpServer = createServer((req, res) => {
      const url = new URL(req.url || "/", "http://stub");
      received.push({ url: url.pathname, query: url.searchParams });
      res.writeHead(200, { "Content-Type": "application/json" });
      if (url.pathname === "/integrations/ext/listdbsforteam") {
        res.end(JSON.stringify({ status: "success", data: [{ adbid: ADB, name: "Ops" }] }));
        return;
      }
      if (url.pathname === "/integrations/ext/list") {
        // What the server sends back once it has projected the page.
        res.end(
          JSON.stringify({
            status: "success",
            data: {
              items: [
                { adoid: "6aa0a1633991680c85b72580", name: "ISSUE - 107" },
                { adoid: "6aac098816e083f6dd1c5753", name: "ISSUE - 260" },
              ],
            },
          }),
        );
        return;
      }
      if (url.pathname === "/integrations/ext/record") {
        res.end(
          JSON.stringify({
            status: "success",
            data: { meta: { adoid: "6aa0a1633991680c85b72580" }, values: { Status: "New" } },
          }),
        );
        return;
      }
      if (url.pathname === "/integrations/ext/search") {
        res.end(
          JSON.stringify({
            status: "success",
            data: [{ meta: { adoid: "6aa0a1633991680c85b72580", name: "ISSUE - 107" }, content: { E2: { key: "Status", value: "New" } } }],
          }),
        );
        return;
      }
      res.end(JSON.stringify({ status: "success", data: [] }));
    });
    await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
    const { port } = http.address() as AddressInfo;
    try {
      return await run(`http://127.0.0.1:${port}`, received);
    } finally {
      await new Promise<void>((resolve) => http.close(() => resolve()));
    }
  }

  async function call(name: string, args: Record<string, unknown>) {
    return withStubbedApi(async (baseURL, received) => {
      const server = createMcpServer({ accessToken: "header.body.sig", baseURL });
      const client = new Client({ name: "fields-test", version: "0.0.0" });
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
      try {
        const result: any = await client.callTool({ name, arguments: args });
        return { text: String(result.content?.[0]?.text || ""), received };
      } finally {
        await client.close();
        await server.close();
      }
    });
  }

  it("list_records forwards fields as a JSON array and returns the projected page", async () => {
    const { text, received } = await call("list_records", {
      teamid: TEAM,
      adbid: ADB,
      templatename: "Issue",
      fields: ["adoid", "name"],
    });
    const list = received.find((r) => r.url === "/integrations/ext/list");
    expect(list).toBeDefined();
    expect(list!.query.get("fields")).toBe(JSON.stringify(["adoid", "name"]));
    expect(list!.query.get("templatename")).toBe("Issue");
    const page = JSON.parse(text);
    expect(page.items).toEqual([
      { adoid: "6aa0a1633991680c85b72580", name: "ISSUE - 107" },
      { adoid: "6aac098816e083f6dd1c5753", name: "ISSUE - 260" },
    ]);
  });

  it("list_records without fields sends no fields parameter", async () => {
    const { received } = await call("list_records", { teamid: TEAM, adbid: ADB });
    const list = received.find((r) => r.url === "/integrations/ext/list");
    expect(list!.query.has("fields")).toBe(false);
  });

  it("search_records forwards fields", async () => {
    const { text, received } = await call("search_records", {
      teamid: TEAM,
      adbid: ADB,
      search: "ISSUE",
      fields: ["adoid", "name", "Status"],
    });
    const search = received.find((r) => r.url === "/integrations/ext/search");
    expect(search!.query.get("fields")).toBe(JSON.stringify(["adoid", "name", "Status"]));
    expect(JSON.parse(text)[0].content.E2.key).toBe("Status");
  });

  it("search_team_records forwards fields to every database's search", async () => {
    const { received } = await call("search_team_records", {
      teamid: TEAM,
      search: "ISSUE",
      fields: ["adoid", "name"],
    });
    const searches = received.filter((r) => r.url === "/integrations/ext/search");
    expect(searches.length).toBe(1);
    expect(searches[0].query.get("fields")).toBe(JSON.stringify(["adoid", "name"]));
  });

  // ISSUE - 293. Some MCP clients hand an array argument over as its JSON
  // text. Splitting that text on commas asked the server for `["adoid"`,
  // `"name"` and `"updated"]`, which it refused as unknown fields (Dev1,
  // 2026-09-21). The text form of an array is read as the array.
  it("list_records accepts fields given as the JSON text of an array (ISSUE - 293)", async () => {
    const { received } = await call("list_records", {
      teamid: TEAM,
      adbid: ADB,
      templatename: "Issue",
      fields: '["adoid", "name", "updated"]',
    });
    const list = received.find((r) => r.url === "/integrations/ext/list");
    expect(list!.query.get("fields")).toBe(JSON.stringify(["adoid", "name", "updated"]));
  });

  it("list_records still accepts a comma-separated fields string (ISSUE - 293)", async () => {
    const { received } = await call("list_records", {
      teamid: TEAM,
      adbid: ADB,
      templatename: "Issue",
      fields: "adoid, name",
    });
    const list = received.find((r) => r.url === "/integrations/ext/list");
    expect(list!.query.get("fields")).toBe(JSON.stringify(["adoid", "name"]));
  });
  // ISSUE - 325. A projected cell is still its whole definition; `values`
  // asks the server for each named cell as key: value instead. It is opt-in,
  // so it is only sent when the caller set it.
  it("search_records forwards values only when it is set", async () => {
    const on = await call("search_records", {
      teamid: TEAM,
      adbid: ADB,
      search: "ISSUE",
      fields: ["adoid", "Status"],
      values: true,
    });
    const search = on.received.find((r) => r.url === "/integrations/ext/search");
    expect(search!.query.get("values")).toBe("true");

    const off = await call("search_records", { teamid: TEAM, adbid: ADB, search: "ISSUE", fields: ["adoid"] });
    const plain = off.received.find((r) => r.url === "/integrations/ext/search");
    expect(plain!.query.has("values")).toBe(false);
  });

  it("search_team_records forwards values to every database's search", async () => {
    const { received } = await call("search_team_records", {
      teamid: TEAM,
      search: "ISSUE",
      fields: ["adoid", "Status"],
      values: true,
    });
    const searches = received.filter((r) => r.url === "/integrations/ext/search");
    expect(searches.length).toBe(1);
    expect(searches[0].query.get("values")).toBe("true");
  });

  // ISSUE - 325. get_record declared no `fields`, so a caller passing one got
  // the whole record back with no sign the argument was dropped.
  it("get_record forwards fields and values", async () => {
    const { text, received } = await call("get_record", {
      teamid: TEAM,
      adbid: ADB,
      adoid: "6aa0a1633991680c85b72580",
      fields: ["adoid", "Status"],
      values: true,
    });
    const record = received.find((r) => r.url === "/integrations/ext/record");
    expect(record!.query.get("fields")).toBe(JSON.stringify(["adoid", "Status"]));
    expect(record!.query.get("values")).toBe("true");
    expect(JSON.parse(text).values).toEqual({ Status: "New" });
  });

  it("get_record without fields or values sends neither", async () => {
    const { received } = await call("get_record", { teamid: TEAM, adbid: ADB, adoid: "6aa0a1633991680c85b72580" });
    const record = received.find((r) => r.url === "/integrations/ext/record");
    expect(record!.query.has("fields")).toBe(false);
    expect(record!.query.has("values")).toBe(false);
  });
});
