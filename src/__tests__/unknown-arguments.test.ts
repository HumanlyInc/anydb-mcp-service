import { describe, expect, it } from "@jest/globals";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createMcpServer } from "../mcp.js";

/**
 * ISSUE - 369. A tool call carrying a key its schema does not have used to be
 * run with that key silently dropped: `create_record` with `attachto` (the
 * parameter is `attach`) succeeded and made the record at the database root,
 * twice, on Dev1. A misspelt filter on a read reads as data. The call is now
 * refused before anything is sent, naming the key and the nearest parameter.
 *
 * The server points at an unreachable API, so a call that passes the check
 * fails later on the network - which is how these tell "refused here" apart
 * from "ran".
 */
describe("tool calls with unknown parameters", () => {
  async function call(name: string, args: Record<string, unknown>) {
    const server = createMcpServer({
      baseURL: "http://127.0.0.1:1/api",
      apiKey: "test-key",
      userEmail: "test@example.test",
    } as any);
    const client = new Client({ name: "unknown-args-test", version: "0.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      const result: any = await client.callTool({ name, arguments: args });
      return { isError: !!result.isError, text: String(result.content?.[0]?.text ?? "") };
    } finally {
      await client.close();
      await server.close();
    }
  }

  const ids = { teamid: "6aa04513740f7dca84450aa8", adbid: "6aa0455c740f7dca84450aaf" };

  it("refuses create_record with attachto, and points at attach", async () => {
    const r = await call("create_record", { ...ids, name: "x", attachto: "6ab57c45c907f9d769d16d70" });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/unknown parameter "attachto"/);
    expect(r.text).toMatch(/did you mean "attach"/);
    expect(r.text).toMatch(/nothing was sent/i);
  });

  it("refuses a read tool whose filter key is misspelt", async () => {
    const r = await call("list_records", { ...ids, parentID: "6ab57c45c907f9d769d16d70" });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/unknown parameter "parentID"/);
    expect(r.text).toMatch(/did you mean "parentid"/);
  });

  it("lists the valid parameters when nothing is close", async () => {
    const r = await call("get_record", { ...ids, adoid: "6ab57c45c907f9d769d16d70", bogus: 1 });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/unknown parameter "bogus"/);
    expect(r.text).toMatch(/Valid parameters: .*adoid/);
  });

  it("names every unknown key in one refusal", async () => {
    const r = await call("create_record", { ...ids, name: "x", attachto: "a", tempalte: "b" });
    expect(r.text).toMatch(/"attachto"/);
    expect(r.text).toMatch(/"tempalte"/);
  });

  it("lets a call with only known keys through to the API", async () => {
    const r = await call("create_record", { ...ids, name: "x", attach: "6ab57c45c907f9d769d16d70" });
    // It fails on the unreachable API, not on the parameter check.
    expect(r.text).not.toMatch(/unknown parameter/);
  });
});
