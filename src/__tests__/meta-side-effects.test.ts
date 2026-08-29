import { describe, expect, it } from "@jest/globals";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createMcpServer } from "../mcp.js";

/**
 * What update_record's meta fields really do.
 *
 * meta.assignees, meta.followup and meta.locked read like inert bookkeeping and
 * are not: assigning emails the assignee during the call and puts the record in
 * their Inbox, a followup schedules a real reminder email, and locking refuses
 * every subsequent write to the record — the caller's own included (ISSUE - 19).
 *
 * An agent had no way to learn any of that short of triggering it, which for
 * two of the three means a real person receives real mail. The behaviour itself
 * is server-side and unchanged; these tests pin the WARNINGS, because a
 * description quietly reverting to "Optional assignees" is exactly the
 * regression that would put this back where it started.
 *
 * The server-side behaviour these sentences describe is pinned separately, in
 * anydb-server test/integration/ext.meta.sideeffects.test.ts.
 */
describe("meta side effects on update_record", () => {
  async function listTools() {
    const server = createMcpServer({ baseURL: "http://127.0.0.1:1/api" });
    const client = new Client({ name: "meta-test", version: "0.0.0" });
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

  it("warns on the tool itself, so the caller sees it before the fields", async () => {
    const tools = await listTools();
    const update = tools.find((tool) => tool.name === "update_record");

    // A warning only reachable by reading a nested property description is a
    // warning an agent skims past on its way to setting the field.
    expect(update?.description).toContain("meta.assignees");
    expect(update?.description).toContain("meta.followup");
    expect(update?.description).toContain("meta.locked");
    expect(update?.description).toContain("emails");
  });

  it("says locking blocks the caller's own later writes, and how to undo it", async () => {
    const meta = await metaOf("update_record");
    const locked = meta.properties.locked.description;

    // The trap is that "locked" sounds like it protects the record from other
    // people. It stops the next update_record call, whoever makes it.
    expect(locked).toContain("refuses every later write");
    expect(locked).toContain("24005");
    expect(locked).toContain("locked false");
    // Metadata is blocked too — an agent that expects a rename to still work
    // will read "locked" as "cells are read-only".
    expect(locked).toMatch(/rename/i);
    // And it can become irreversible.
    expect(locked).toContain("LOCKED_ACCESS");
  });

  it("says assigning sends mail now, not later", async () => {
    const meta = await metaOf("update_record");
    const assignees = meta.properties.assignees.description;

    expect(assignees).toContain("EMAIL");
    expect(assignees).toMatch(/immediate/i);
    expect(assignees).toMatch(/inbox/i);
    // Groups are the quiet multiplier: one id, many recipients.
    expect(assignees).toContain("Groups expand to every member");
  });

  it("names the one-for-one swap that is silently dropped", async () => {
    const meta = await metaOf("update_record");
    const assignees = meta.properties.assignees.description;

    // Reassigning looks like it worked: no error, and the response comes back
    // clean. Without the workaround here the caller has no way to get it done.
    expect(assignees).toContain("DEFECT");
    expect(assignees).toMatch(/clear the list first/i);
  });

  it("gives followup's unit, its recipients, and how to cancel it", async () => {
    const meta = await metaOf("update_record");
    const followup = meta.properties.followup.description;

    // Seconds-vs-milliseconds is a live hazard here: record date values are
    // epoch SECONDS, and this field is not.
    expect(followup).toContain("MILLISECONDS");
    expect(followup).toContain("EMAIL");
    expect(followup).toContain("meta.assignees");
    // 0 is the only value that cancels; the obvious two do nothing.
    expect(followup).toContain("Pass 0 to cancel");
    expect(followup).toContain("are ignored and leave it scheduled");
    // Neither of the sibling fields is reachable, so nothing set here repeats.
    expect(followup).toContain("followuprepeat");
    expect(followup).toContain("fires once");
  });

  it("carries the same warnings into the batch tool", async () => {
    const tools = await listTools();
    const bulk = tools.find((tool) => tool.name === "bulk_update_records");
    const meta = await metaOf("bulk_update_records");

    // 100 records is 100 emails, which is where a mistake stops being cheap.
    expect(bulk?.description).toMatch(/hundred records assigned/i);
    expect(meta.properties.assignees.description).toContain("update_record");
    expect(meta.properties.locked.description).toContain("update_record");
    expect(meta.properties.followup.description).toContain("update_record");
  });

  it("keeps the two meanings of 'locked' apart in the authoring guide", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const guide = readFileSync(
      resolve(process.cwd(), "resources/solution-building-v1.md"),
      "utf8",
    );

    // A type's fields have their own `locked`, which is a read-only cell and
    // nothing more. Same word, unrelated blast radius.
    expect(guide).toContain("unrelated to a record's");
    expect(guide).toContain("`meta.locked`");
  });
});
