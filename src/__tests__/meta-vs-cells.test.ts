import { describe, expect, it } from "@jest/globals";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createMcpServer } from "../mcp.js";

/**
 * meta is not the grid.
 *
 * `meta.status` is a three-value flag on every record — NOT_SET / OPEN /
 * CLOSED — shown in the record header. A type's own "Status" field is ordinary
 * cell data whose options its designer chose. They share an English word and
 * nothing else, and the same is true of `meta.assignees` against an
 * "Assigned To" field (ISSUE - 20).
 *
 * The tool offered `status` right there in `meta`, described as "Optional
 * status", so it was the obvious first move for an agent asked to change a
 * record's status — and it wrote a field nobody was looking at. Worse, the API
 * took the Status field's value ("Closed") happily, storing a string outside
 * the enum that renders as "Invalid Status" in the header. anydb-server now
 * rejects that; these tests pin the descriptions that stop an agent trying.
 */
describe("meta fields vs same-named cells", () => {
  async function listTools() {
    const server = createMcpServer({ baseURL: "http://127.0.0.1:1/api" });
    const client = new Client({ name: "meta-cells-test", version: "0.0.0" });
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

  const metaOf = async (toolName: string) => {
    const tools = await listTools();
    const tool: any = tools.find((candidate) => candidate.name === toolName);
    return toolName === "bulk_update_records"
      ? tool.inputSchema.properties.records.items.properties.meta
      : tool.inputSchema.properties.meta;
  };

  it("constrains status to the three values the product has", async () => {
    const meta = await metaOf("update_record");

    // An enum in the schema stops most of this before a description is even
    // read: a client that validates cannot send "Closed" at all.
    expect(meta.properties.status.enum).toEqual([
      "NOT_SET",
      "OPEN",
      "CLOSED",
    ]);
  });

  it("says outright that status is not the Status field", async () => {
    const meta = await metaOf("update_record");
    const status = meta.properties.status.description;

    expect(status).toContain("NOT the record's Status field");
    // Where it actually shows up, so the caller can tell which one they mean.
    expect(status).toContain("record header");
    // And the redirect, which is the part that gets the user's job done.
    expect(status).toMatch(/WRITE THE CELL/);
    expect(status).toContain("content");
  });

  it("names the exact mistake that produced the issue", async () => {
    const meta = await metaOf("update_record");

    // Sending a Status field's own option here reads as obviously correct and
    // is the one thing that must not look allowed.
    expect(meta.properties.status.description).toContain('"Closed"');
    expect(meta.properties.status.description).toMatch(/is rejected/);
  });

  it("draws the same line for assignees against a person field", async () => {
    const meta = await metaOf("update_record");
    const assignees = meta.properties.assignees.description;

    expect(assignees).toContain("Assigned To");
    // Both directions: meta does not write the cell, the cell does not assign.
    expect(assignees).toContain("does not touch");
    expect(assignees).toMatch(/does not assign anybody/);
  });

  it("states the general rule where the caller reads it first", async () => {
    const tools = await listTools();
    const update = tools.find((tool) => tool.name === "update_record");

    // The per-field warnings only help an agent that already chose the field.
    // This one is meant to stop the choice being made wrongly.
    expect(update?.description).toContain("meta is not the grid");
    expect(update?.description).toMatch(/check the record's layout/);
  });

  it("carries the constraint into the batch tool", async () => {
    const meta = await metaOf("bulk_update_records");

    expect(meta.properties.status.enum).toEqual([
      "NOT_SET",
      "OPEN",
      "CLOSED",
    ]);
    expect(meta.properties.status.description).toContain("update_record");
  });
});
