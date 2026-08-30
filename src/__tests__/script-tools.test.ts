import { describe, expect, it } from "@jest/globals";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createMcpServer } from "../mcp.js";

/**
 * Ad-hoc script execution (ISSUE - 43).
 *
 * These tools let a client push a computation down to the data instead of
 * pulling the data up to the client. Every other tool here answers a
 * question by iterating records, which makes some questions -- "what is the
 * NPS across 40,000 responses" -- not slow but impossible.
 *
 * What is pinned below is deliberately about the DESCRIPTIONS rather than
 * the plumbing, because with an arbitrary-code tool the description is the
 * safety mechanism: it is the only thing standing between a client and
 * reaching for a script when a single get_record would do.
 *
 *  - Simulate-before-run has to be stated, since the server enforces it and
 *    an agent that does not know will just get a refusal it cannot explain.
 *  - The plan requirement has to be stated for the same reason.
 *  - The await-in-every-loop rule has to be stated because it is invisible
 *    until the script is rejected, and it bites precisely on the long scans
 *    these tools exist for.
 *  - Simulate must be described as suppressing writes but NOT reads.
 */
describe("ad-hoc script tools", () => {
  async function listTools() {
    const server = createMcpServer({ baseURL: "http://127.0.0.1:1/api" });
    const client = new Client({ name: "script-tools-test", version: "0.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    try {
      const { tools } = await client.listTools();
      return tools;
    } finally {
      await client.close();
      await server.close();
    }
  }

  const toolNamed = async (name: string) => {
    const tools = await listTools();
    return tools.find((tool) => tool.name === name) as any;
  };

  it("advertises the three script tools", async () => {
    const names = (await listTools()).map((tool) => tool.name);

    expect(names).toContain("anydb_validate_script");
    expect(names).toContain("anydb_simulate_script");
    expect(names).toContain("anydb_run_script");
  });

  it("frames running a script as the escape hatch for bulk work, not the default", async () => {
    const tool = await toolNamed("anydb_run_script");
    // Without this framing an agent reaches for arbitrary code where a
    // single record read would do.
    expect(tool.description).toContain("ESCAPE HATCH FOR BULK AND AGGREGATE");
    expect(tool.description).toContain("not for ordinary work");
  });

  it("tells the client it must simulate first, and that the token is bound to the script", async () => {
    const tool = await toolNamed("anydb_run_script");

    expect(tool.description).toContain("SIMULATE FIRST");
    expect(tool.inputSchema.required).toContain("runToken");
    expect(tool.inputSchema.properties.runToken.description).toContain(
      "exact script",
    );
  });

  it("states the plan requirement on both executing tools", async () => {
    const run = await toolNamed("anydb_run_script");
    const simulate = await toolNamed("anydb_simulate_script");

    expect(run.description).toContain("Business or Enterprise plan");
    // Simulate is gated too -- it runs arbitrary code and reads real data.
    expect(simulate.description).toContain("Business or Enterprise plan");
  });

  it("says a dry run suppresses writes but NOT reads", async () => {
    const tool = await toolNamed("anydb_simulate_script");

    expect(tool.description).toContain("READS ARE REAL");
    expect(tool.description).toContain("suppressed");
    // The divergence that would otherwise surprise someone: a script
    // branching on a write's result behaves differently for real.
    expect(tool.description).toContain("branches on the result of a write");
  });

  it("states the two authoring rules that are invisible until the script is rejected", async () => {
    const tool = await toolNamed("anydb_run_script");

    // Results come back through output.set; the block APIs write a file.
    expect(tool.description).toContain("output.set(key, value)");
    // Every loop body needs an await, which bites exactly on long scans.
    expect(tool.description).toContain("EVERY LOOP BODY MUST CONTAIN AN await");
  });

  it("says the script runs as the caller, with the caller's permissions", async () => {
    const tool = await toolNamed("anydb_run_script");

    expect(tool.description).toContain("as YOU");
    expect(tool.description).toContain(
      "cannot see or change anything you could not",
    );
  });

  it("keeps validate honest about what it does not prove", async () => {
    const tool = await toolNamed("anydb_validate_script");

    expect(tool.description).toContain("WITHOUT running");
    // A clean parse is not evidence the script does the right thing.
    expect(tool.description).toContain("proves nothing about what the script");
  });
});
