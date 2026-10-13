/**
 * ISSUE - 264. How a tool result is rendered depends on WHO is calling.
 *
 * Every tool result leaves this service as `JSON.stringify(value, null, 2)`,
 * and for a human-facing MCP client (Claude Desktop, ChatGPT) that is right:
 * people read tool output in those UIs. AnyBot is different. It is a model
 * loop inside anydb-server that replays every tool result on every later
 * iteration and every later turn, so each byte of a result is paid for many
 * times. Measured on a local solution build: 93% of the stored thread was
 * tool calls and results, and 2-space indentation alone was 24-40% of the
 * tokens in the heavy payloads (workflow actions 8,873 pretty vs 6,747
 * compact; a type definition 1,251 vs 756).
 *
 * SCOPE IS THE ANYBOT CALLER ONLY, per Anis: external MCP clients must keep
 * receiving byte-identical output. The service already knows the caller --
 * anydb-server's AnyBot names itself in the x-anydb-origin-client header
 * (mcp.identity.ts, ANYBOT_MCP_CLIENT) and the tool-call handler carries that
 * identity on the ext API client -- so rendering branches on it here, in one
 * place, and nowhere else.
 */

/** What anydb-server's AnyBot sends as its origin (see ANYBOT_MCP_CLIENT there). */
export const ANYBOT_ORIGIN_PREFIX = "anybot";

export const isAnyBotOrigin = (origin?: string): boolean =>
  typeof origin === "string" &&
  origin.trim().toLowerCase().startsWith(ANYBOT_ORIGIN_PREFIX);

/**
 * Serialise a tool result for the caller: compact for AnyBot, pretty for
 * everyone else. `undefined` origin is "everyone else" -- a caller we cannot
 * identify gets today's output, never the compact form.
 */
export const toolJson = (value: unknown, origin?: string): string =>
  isAnyBotOrigin(origin)
    ? JSON.stringify(value)
    : JSON.stringify(value, null, 2);

/** The MCP text content block for a result, rendered per caller. */
export const textResultFor = (value: unknown, origin?: string) => ({
  content: [{ type: "text" as const, text: toolJson(value, origin) }],
});

interface BulkCreateItem {
  index?: number;
  clientref?: string;
  success?: boolean;
  record?: { meta?: Record<string, unknown> } & Record<string, unknown>;
  error?: string;
}

/**
 * ISSUE - 264. A bulk create echoes every created record in full -- 34k
 * characters for five records in the measured build -- when all the model
 * does with the answer is read the ids and names to link things up next. For
 * AnyBot, each item keeps its identity and outcome and drops the record body;
 * the record is one get_record away if it is ever needed. Failures keep their
 * error text untouched. Any shape this does not recognise passes through
 * unchanged rather than being guessed at.
 */
export const slimBulkCreateResult = (value: unknown, origin?: string): unknown => {
  if (!isAnyBotOrigin(origin)) return value;
  const payload = value as { results?: unknown } | null;
  if (!payload || !Array.isArray(payload.results)) return value;
  return {
    ...payload,
    results: (payload.results as BulkCreateItem[]).map((item) => {
      if (!item || typeof item !== "object" || !item.record) return item;
      const meta = item.record.meta || {};
      const { record: _record, ...rest } = item;
      return {
        ...rest,
        adoid: meta.adoid,
        name: meta.name,
        ...(meta.templateName ? { templateName: meta.templateName } : {}),
      };
    }),
  };
};

/** ISSUE - 629. A waited report run above this many characters loses its inline detail rows. */
export const REPORT_RUN_INLINE_LIMIT = 40_000;

/**
 * ISSUE - 629. A waited anydb_run_report answers with the whole result, and
 * groupDetailsPages (the first detail rows of every group) is most of it: 109k
 * of 160k characters for a report of 549 records. Clients refuse a result that
 * size, and a custom agent's run fails on it. When the answer is large the
 * detail rows are left out and the answer says how to read them; small
 * reports are returned unchanged.
 */
export const slimReportRunResult = (value: unknown): unknown => {
  const payload = value as { result?: { groupDetailsPages?: unknown } } | null;
  if (!payload?.result || payload.result.groupDetailsPages === undefined) return value;
  if (JSON.stringify(value).length <= REPORT_RUN_INLINE_LIMIT) return value;
  const { groupDetailsPages: _details, ...result } = payload.result;
  return {
    ...payload,
    result,
    detailsOmitted:
      "The report is large, so its detail rows are not included. Read one group's rows with anydb_get_report_result using groupIndex, start and limit."
  };
};
