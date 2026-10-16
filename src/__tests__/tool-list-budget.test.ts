/**
 * ISSUE - 670: what a client pays before its first request is the tools/list
 * answer. A client without tool deferral (ChatGPT, Cursor, ...) sends all of it
 * with every request, so its size is a cost to keep visible.
 *
 * The budgets are today's size plus a small margin. Going over is allowed, but
 * only by raising the number here in the same change, so growth is a decision a
 * reviewer sees rather than drift. Lower them when a change makes the list smaller.
 *
 * Measured 2026-10-15 (JSON of the listed tools, annotations and output schemas
 * included): full 248,723 chars before the agent-run tools were gated, 220,568
 * after; reviewed 220,650 before, 192,495 after.
 */
import { describe, expect, it } from "@jest/globals";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createMcpServer } from "../mcp.js";

const BUDGET = { full: 225_000, reviewed: 197_000 } as const;

async function listedSize(toolProfile: "full" | "reviewed"): Promise<number> {
  const server: any = createMcpServer({ apiKey: "key", userEmail: "someone@example.com", toolProfile } as any);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "budget-test", version: "1" });
  await Promise.all([server.connect(a), client.connect(b)]);
  const { tools } = await client.listTools();
  await client.close();
  return JSON.stringify(tools).length;
}

describe("tools/list size budget (ISSUE - 670)", () => {
  for (const profile of ["full", "reviewed"] as const) {
    it(`keeps the ${profile} tool list within ${BUDGET[profile]} chars`, async () => {
      expect(await listedSize(profile)).toBeLessThanOrEqual(BUDGET[profile]);
    });
  }
});
