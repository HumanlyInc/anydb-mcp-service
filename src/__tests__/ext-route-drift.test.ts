/**
 * ISSUE - 672: the MCP tools must stay in step with anydb-server's ext API.
 *
 * Every tool is called once, with every parameter its input schema declares, against
 * an axios adapter that records the request instead of sending it. The requests are
 * then checked against fixtures/ext-routes.json, a snapshot of the server's ext
 * controller (`node scripts/refresh-ext-routes.mjs`):
 *
 * - every request names a route the server has (a renamed or removed route fails);
 * - every parameter a tool sends is one the route validates (otherwise the server
 *   ignores it and the caller's intent is dropped, as in ISSUE - 369);
 * - every parameter the route requires is sent;
 * - every server route is reached by some tool, or is listed in NO_TOOL with a reason.
 *
 * What this does NOT cover: the server's behaviour, response shapes, and parameters a
 * handler reads without validating (routes with no @validate block are only checked for
 * existence). The snapshot is only as current as its last refresh.
 */
import { describe, expect, it, beforeAll, afterAll, jest } from "@jest/globals";
import axios from "axios";
import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createMcpServer } from "../mcp.js";

interface RouteParam { in: "query" | "body" | "param"; optional: boolean }
interface Route { method: string; path: string; params: Record<string, RouteParam> | null }
interface Captured { tool: string; method: string; url: string; query: string[]; body: string[] }

const ROUTES: Route[] = JSON.parse(
  readFileSync(new URL("./fixtures/ext-routes.json", import.meta.url), "utf8")
);

const OID = "6aa04513740f7dca84450aa8";

/** Server routes no MCP tool calls, each with the reason. Adding a route means deciding. */
const NO_TOOL: Record<string, string> = {
  "POST /integrations/ext/checkauth": "anydb_whoami answers from the verified credential without a round trip",
  "POST /integrations/ext/register": "outbound record-event webhooks are for API-key integrations (SDK, Zapier), not an assistant operation",
  "POST /integrations/ext/subscribe": "outbound record-event webhooks, as register",
  "DELETE /integrations/ext/unsubscribe": "outbound record-event webhooks, as register",
  "PUT /integrations/ext/:webhookId": "outbound record-event webhooks, as register",
  "DELETE /integrations/ext/:webhookId": "outbound record-event webhooks, as register",
  "PUT /integrations/ext/share": "legacy record share; anydb_create_share and anydb_update_share use /shares",
  "DELETE /integrations/ext/share/:shareid": "legacy record share; anydb_revoke_share uses /shares/:shareId",
  "GET /integrations/ext/views": "ISSUE - 675: saved filtered Views have no tool",
  "POST /integrations/ext/views": "ISSUE - 675: saved filtered Views have no tool",
  "GET /integrations/ext/views/:viewid": "ISSUE - 675: saved filtered Views have no tool",
  "PUT /integrations/ext/views/:viewid": "ISSUE - 675: saved filtered Views have no tool",
  "DELETE /integrations/ext/views/:viewid": "ISSUE - 675: saved filtered Views have no tool",
  "POST /integrations/ext/type-migrations/:jobid/retry": "ISSUE - 675: no tool retries a stalled type migration",
};

/** Tools that answer locally and never call the ext API. */
const LOCAL_TOOLS = new Set<string>(["anydb_get_setup_guide", "anydb_whoami", "anydb_get_authoring_guide"]);

/**
 * Arguments for tools whose schema alone does not produce a valid call, or that take
 * another route for another form of argument. Each set is one call.
 */
const ARGS: Record<string, Array<Record<string, unknown>>> = {
  anydb_execute_workflow: [
    { teamid: OID, adbid: OID, workflowId: OID, adoid: OID, simulate: true },
    { teamid: OID, adbid: OID, workflowName: "x", adoid: OID, simulate: true },
  ],
  anydb_get_type_definition: [
    { teamid: OID, adbid: OID, templateName: "x", source: "workspace" },
    { teamid: OID, adbid: OID, templateId: OID },
  ],
  anydb_get_shared_record: [{ shareId: OID }, { shareUrl: "https://app.anydb.com/s/x" }],
  anydb_get_shared_form: [{ shareId: OID }, { shareUrl: "https://app.anydb.com/f/x" }],
  anydb_update_conversation: [{
    teamid: OID, adbid: OID, conversationId: OID, unread: true, assignedTo: OID, status: "Open",
    ticket: { pipeline: "x", status: "x", priority: "x", assignedTeam: [OID] },
  }],
};

/** Known drift, each with the backlog issue that removes it. Empty is the goal. */
const KNOWN_DRIFT: Record<string, string> = {
  // The server half of ISSUE - 297 merged into a stale stacked branch and never reached main.
  "anydb_list_apps: GET /integrations/ext/apps": "ISSUE - 297",
  [`anydb_get_app: GET /integrations/ext/apps/${OID}`]: "ISSUE - 297",
  "anydb_get_type_definition: GET /integrations/ext/templates/by-id/:templateid/definition source": "ISSUE - 675",
};

function sample(schema: any, key = ""): unknown {
  if (!schema || typeof schema !== "object") return "x";
  if (schema.enum) return schema.enum[0];
  if (schema.const !== undefined) return schema.const;
  // A oneOf beside properties only constrains which of them go together; ARGS covers those.
  const variant = schema.properties ? undefined : schema.oneOf ?? schema.anyOf;
  if (variant) return sample(variant[0], key);
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  if (type === "object" || schema.properties) {
    return Object.fromEntries(
      Object.entries(schema.properties ?? {}).map(([k, v]) => [k, sample(v, k)])
    );
  }
  if (type === "array") return [sample(schema.items, key)];
  if (type === "number" || type === "integer") return schema.minimum ?? 1;
  if (type === "boolean") return true;
  if (schema.format === "email") return "someone@example.com";
  if (schema.format === "uri" || schema.format === "url") return "https://example.com/hook";
  return /id$/i.test(key) || /24/.test(String(schema.pattern ?? schema.minLength ?? "")) ? OID : "x";
}

// A static segment beats a parameter, as it does for the server's own routing
// ("/templates/discover" is not "/templates/:templatename").
const BY_SPECIFICITY = [...ROUTES].sort(
  (a, b) => (a.path.match(/:/g)?.length ?? 0) - (b.path.match(/:/g)?.length ?? 0)
);

function routeFor(method: string, url: string): Route | undefined {
  return BY_SPECIFICITY.find(
    (r) =>
      r.method === method.toUpperCase() &&
      new RegExp(`^${r.path.replace(/:[^/]+/g, "[^/]+")}$`).test(url)
  );
}

function keysOf(value: unknown): string[] {
  if (typeof value === "string") {
    try { return keysOf(JSON.parse(value)); } catch { return []; }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  if (typeof (value as any).getHeaders === "function") return []; // multipart form
  return Object.keys(value as object).filter((k) => (value as any)[k] !== undefined);
}

const captured: Captured[] = [];
const toolsCalled = new Map<string, number>();
let originalAdapter: unknown;

beforeAll(async () => {
  let current = "";
  originalAdapter = axios.defaults.adapter;
  axios.defaults.adapter = async (config: any) => {
    const url = String(config.url).split("?")[0];
    // An absolute URL is a presigned storage upload or download, not the ext API.
    if (/^https?:/.test(url)) return { data: "", status: 200, statusText: "OK", headers: {}, config };
    captured.push({
      tool: current,
      method: String(config.method),
      url,
      query: keysOf(config.params),
      body: keysOf(config.data),
    });
    // Shaped like a record so multi-step tools (read, then write) carry on to the write.
    const data = { meta: { adoid: OID, adbid: OID, teamid: OID, name: "x" }, content: {}, url: "https://storage.example.com/u" };
    // Some client calls unwrap { data }, others read the body itself; answer both.
    return { data: { status: "success", data, ...data }, status: 200, statusText: "OK", headers: {}, config };
  };

  const server: any = createMcpServer({ apiKey: "key", userEmail: "someone@example.com", toolProfile: "full", agentCapability: "drift-test" } as any);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "drift-test", version: "1" });
  await Promise.all([server.connect(a), client.connect(b)]);
  const { tools } = await client.listTools();
  const quiet = jest.spyOn(console, "error").mockImplementation(() => {});
  for (const tool of tools) {
    current = tool.name;
    const before = captured.length;
    const generated = sample(tool.inputSchema) as Record<string, unknown>;
    for (const args of ARGS[tool.name] ?? [generated]) {
      // A tool error is expected here (the fake answers are not real records);
      // only the requests it made before failing matter.
      await client.callTool({ name: tool.name, arguments: args }).catch(() => undefined);
    }
    toolsCalled.set(tool.name, captured.length - before);
  }
  quiet.mockRestore();
}, 120_000);

afterAll(() => {
  axios.defaults.adapter = originalAdapter as any;
});

const drift = (key: string) => !(key in KNOWN_DRIFT);

describe("MCP tools against the server's ext routes (ISSUE - 672)", () => {
  it("calls every tool that is not local and reaches the API", () => {
    const silent = [...toolsCalled].filter(([name, n]) => n === 0 && !LOCAL_TOOLS.has(name)).map(([n]) => n);
    expect(silent).toEqual([]);
  });

  it("only calls routes the server has", () => {
    const unknown = captured
      .filter((c) => !routeFor(c.method, c.url))
      .map((c) => `${c.tool}: ${c.method.toUpperCase()} ${c.url}`)
      .filter(drift);
    expect([...new Set(unknown)]).toEqual([]);
  });

  it("sends only parameters the route validates", () => {
    const extra: string[] = [];
    for (const c of captured) {
      const route = routeFor(c.method, c.url);
      if (!route?.params) continue;
      for (const k of [...c.query, ...c.body]) {
        if (!(k in route.params)) extra.push(`${c.tool}: ${route.method} ${route.path} ${k}`);
      }
    }
    expect([...new Set(extra)].filter(drift)).toEqual([]);
  });

  it("sends every parameter the route requires", () => {
    const missing: string[] = [];
    for (const c of captured) {
      const route = routeFor(c.method, c.url);
      if (!route?.params) continue;
      const sent = new Set([...c.query, ...c.body]);
      for (const [k, p] of Object.entries(route.params)) {
        if (!p.optional && p.in !== "param" && !sent.has(k)) missing.push(`${c.tool}: ${route.method} ${route.path} ${k}`);
      }
    }
    expect([...new Set(missing)].filter(drift)).toEqual([]);
  });

  it("reaches every server route, or records why no tool does", () => {
    const reached = new Set(captured.map((c) => routeFor(c.method, c.url)).filter(Boolean));
    const unreached = ROUTES.filter((r) => !reached.has(r))
      .map((r) => `${r.method} ${r.path}`)
      .filter((k) => !(k in NO_TOOL));
    expect(unreached).toEqual([]);
  });

  it("keeps NO_TOOL and LOCAL_TOOLS current", () => {
    const reached = new Set(captured.map((c) => routeFor(c.method, c.url)).filter(Boolean).map((r) => `${r!.method} ${r!.path}`));
    const routeKeys = new Set(ROUTES.map((r) => `${r.method} ${r.path}`));
    expect(Object.keys(NO_TOOL).filter((k) => reached.has(k) || !routeKeys.has(k))).toEqual([]);
    expect([...LOCAL_TOOLS].filter((t) => (toolsCalled.get(t) ?? 1) > 0)).toEqual([]);
  });

  it("keeps KNOWN_DRIFT current: a fixed entry must be removed", () => {
    const observed = new Set<string>();
    for (const c of captured) {
      const route = routeFor(c.method, c.url);
      if (!route) observed.add(`${c.tool}: ${c.method.toUpperCase()} ${c.url}`);
      else if (route.params) {
        for (const k of [...c.query, ...c.body]) {
          if (!(k in route.params)) observed.add(`${c.tool}: ${route.method} ${route.path} ${k}`);
        }
      }
    }
    expect(Object.keys(KNOWN_DRIFT).filter((k) => !observed.has(k))).toEqual([]);
  });
});
