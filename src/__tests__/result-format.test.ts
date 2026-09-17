import { describe, expect, it } from "@jest/globals";

import {
  isAnyBotOrigin,
  slimBulkCreateResult,
  textResultFor,
  toolJson,
} from "../result-format.js";

/**
 * ISSUE - 264. Tool results are rendered per caller: compact for AnyBot, which
 * replays every result on every iteration, and byte-identical to before for
 * every other MCP client.
 *
 * The external-client guarantee is the one that matters most here: a human
 * reading tool output in Claude Desktop or ChatGPT must see exactly what they
 * saw yesterday. Those cases compare against the literal pretty-printed
 * string, not against "not compact".
 */

const sample = { a: 1, b: { c: [1, 2], d: "x" } };
const PRETTY = JSON.stringify(sample, null, 2);

describe("ISSUE - 264: who counts as AnyBot", () => {
  it("matches what anydb-server's AnyBot announces", () => {
    // mcp.identity.ts: `${ANYBOT_MCP_CLIENT}/${appversion}` with ANYBOT_MCP_CLIENT = "anybot-v2".
    expect(isAnyBotOrigin("anybot-v2/1.5.3+a8ceacd")).toBe(true);
    expect(isAnyBotOrigin("AnyBot-v2/1.5.3")).toBe(true);
  });

  it("nobody else does, including an unknown caller", () => {
    expect(isAnyBotOrigin(undefined)).toBe(false);
    expect(isAnyBotOrigin("")).toBe(false);
    expect(isAnyBotOrigin("claude-desktop/1.0")).toBe(false);
    expect(isAnyBotOrigin("chatgpt")).toBe(false);
    expect(isAnyBotOrigin("my-anybot-fork")).toBe(false);
  });
});

describe("ISSUE - 264: rendering per caller", () => {
  it("EXTERNAL CLIENTS GET BYTE-IDENTICAL PRETTY OUTPUT, unknown caller included", () => {
    expect(toolJson(sample, "claude-desktop/1.0")).toBe(PRETTY);
    expect(toolJson(sample, undefined)).toBe(PRETTY);
    expect(textResultFor(sample, "chatgpt")).toEqual({
      content: [{ type: "text", text: PRETTY }],
    });
  });

  it("AnyBot gets compact JSON with the same content", () => {
    const compact = toolJson(sample, "anybot-v2/1.5.3");
    expect(compact).toBe(JSON.stringify(sample));
    expect(JSON.parse(compact)).toEqual(sample);
    expect(compact.length).toBeLessThan(PRETTY.length);
  });
});

describe("ISSUE - 264: slimming a bulk create for AnyBot", () => {
  const record = (adoid: string, name: string) => ({
    meta: { adoid, name, templateName: "Ticket", version: 1, adbid: "db" },
    content: { A1: { pos: "A1", key: "Title", value: name, props: {} } },
  });
  const full = {
    total: 3,
    succeeded: 2,
    failed: 1,
    results: [
      { index: 0, clientref: "t1", success: true, record: record("aaa", "Login issue") },
      { index: 1, clientref: "t2", success: true, record: record("bbb", "Billing question") },
      { index: 2, clientref: "t3", success: false, error: "Customer ref not found" },
    ],
  };

  it("keeps identity and outcome, drops the record body", () => {
    const slim = slimBulkCreateResult(full, "anybot-v2/1.5.3") as typeof full & {
      results: Array<Record<string, unknown>>;
    };
    expect(slim.total).toBe(3);
    expect(slim.succeeded).toBe(2);
    expect(slim.results[0]).toEqual({
      index: 0,
      clientref: "t1",
      success: true,
      adoid: "aaa",
      name: "Login issue",
      templateName: "Ticket",
    });
    expect(slim.results[0]).not.toHaveProperty("record");
    // A failure is passed through untouched: the error text is what the
    // model needs to recover.
    expect(slim.results[2]).toEqual(full.results[2]);
  });

  it("leaves an external client's bulk create exactly as it was", () => {
    expect(slimBulkCreateResult(full, "claude-desktop/1.0")).toBe(full);
    expect(slimBulkCreateResult(full, undefined)).toBe(full);
  });

  it("passes an unrecognised shape through rather than guessing", () => {
    expect(slimBulkCreateResult({ ok: true }, "anybot-v2/1")).toEqual({ ok: true });
    expect(slimBulkCreateResult(null, "anybot-v2/1")).toBeNull();
    expect(slimBulkCreateResult("text", "anybot-v2/1")).toBe("text");
  });

  it("does not mutate the original result", () => {
    const before = JSON.stringify(full);
    slimBulkCreateResult(full, "anybot-v2/1.5.3");
    expect(JSON.stringify(full)).toBe(before);
  });
});
