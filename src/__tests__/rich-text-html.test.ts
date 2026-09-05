import { describe, expect, it } from "@jest/globals";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createMcpServer } from "../mcp.js";

/**
 * A rich-text field holds HTML.
 *
 * anydb-ui edits these with a TipTap editor: it parses the stored value as
 * HTML (content={props.value}) and saves editor.getHTML() back. So a value
 * written as plain text with newlines is parsed as HTML, where newlines are
 * only whitespace, and renders as one unbroken run. Nothing errors and nothing
 * is lost — the field just looks like it forgot its formatting, which is how
 * this went unnoticed.
 *
 * The guide has to say so, because the failure gives no signal at write time.
 */
describe("rich-text guidance", () => {
  const guide = () =>
    readFileSync(
      resolve(process.cwd(), "resources/solution-building-v1.md"),
      "utf8",
    );

  it("states that rich-text stores HTML", () => {
    expect(guide()).toContain(
      "**A `rich-text` field stores HTML, not plain text.**",
    );
  });

  it("connects it to the label a user would recognise", () => {
    // Someone reading the app sees "long text", not "rich-text", so the guide
    // has to bridge the two names or the rule looks like it is about
    // something else.
    expect(guide()).toMatch(/labelled "long\s+text" in the app/);
  });

  it("says newlines and Markdown both do nothing", () => {
    const text = guide();

    // The two things an agent reaches for instead of tags.
    expect(text).toMatch(/Newline characters do nothing/);
    expect(text).toMatch(/Markdown does not work either/);
    expect(text).toMatch(/renders as literal asterisks/);
  });

  it("says it applies to writing records, not only to defining types", () => {
    // The guide is read for type authoring, but the failure happens when
    // writing a record value — so the bullet has to reach past its usual
    // audience.
    expect(guide()).toMatch(
      /applies when writing record values through\s+`create_record` and `update_record`/,
    );
  });

  it("shows the right and wrong form side by side", () => {
    expect(guide()).toContain(
      "Write `<p>First line</p><p>Second line</p>`",
    );
  });
});

/**
 * The guide is not the only thing a model reads. When it is asked to write a
 * cell it reasons from the record-write tool's own `content` description, which
 * is right in front of it. If that description says nothing about HTML, the
 * model has no reason to reach for the guide, and a rich-text value goes in as
 * plain text (ISSUE - 92). So every write tool's content field has to carry the
 * rule itself, not just point at a doc read once at authoring time.
 */
describe("record-write tool content descriptions", () => {
  async function listTools() {
    const server = createMcpServer({ baseURL: "http://127.0.0.1:1/api" });
    const client = new Client({ name: "rich-text-test", version: "0.0.0" });
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

  const contentDescriptionOf = async (toolName: string) => {
    const tools = await listTools();
    const tool: any = tools.find((candidate) => candidate.name === toolName);
    const content =
      toolName === "bulk_create_records" || toolName === "bulk_update_records"
        ? tool.inputSchema.properties.records.items.properties.content
        : tool.inputSchema.properties.content;
    return content.description as string;
  };

  it.each([
    "create_record",
    "update_record",
    "bulk_create_records",
    "bulk_update_records",
  ])("tells %s's content that rich-text cells store HTML", async (toolName) => {
    const description = await contentDescriptionOf(toolName);

    // The rule itself.
    expect(description).toContain("stores HTML");
    // Named the way it appears in the app, so the model can match a cell to it.
    expect(description).toMatch(/rich-text \("long text"\)/);
    // The two things a model reaches for instead of tags, and that they fail.
    expect(description).toMatch(/newline/i);
    expect(description).toMatch(/Markdown is not parsed/);
    // A real tag to imitate, not just a prohibition.
    expect(description).toContain("<p>");
  });
});
