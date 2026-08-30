import { describe, expect, it } from "@jest/globals";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createMcpServer } from "../mcp.js";

/**
 * A View is not a tab.
 *
 * The tabs along the top of a type's listing page are stored as an encoded
 * list in a per-type metaprops key on the DATABASE ROOT record
 * (anydb-ui reads `metaprops[LISTING_VIEWS_<TYPE>]`). A View is a separate ADO
 * that keeps its own criteria under the plain key `LISTING_VIEWS`. Same
 * prefix, different key, different object — so they are two constructs that
 * look like one feature (ISSUE - 17).
 *
 * That caught someone out in both directions at once: a View created here
 * never showed up as a tab, and the tabs they already had never came back from
 * anydb_list_views. Both are correct behaviour, and neither was written down.
 *
 * The remedy chosen was to document the separation rather than link the two,
 * because a tab entry is COPIED criteria and not a reference to a View, so
 * wiring them together would duplicate a filter that then drifts. These tests
 * pin the wording; they do not pin the separation itself, which lives in
 * anydb-ui.
 */
describe("Views are not listing-page tabs", () => {
  async function listTools() {
    const server = createMcpServer({ baseURL: "http://127.0.0.1:1/api" });
    const client = new Client({ name: "views-tabs-test", version: "0.0.0" });
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

  const describeOf = async (toolName: string) => {
    const tools = await listTools();
    return tools.find((tool) => tool.name === toolName)?.description ?? "";
  };

  it("tells the writer that creating a View adds no tab", async () => {
    const description = await describeOf("anydb_create_view");

    expect(description).toContain("DOES NOT ADD A TAB");
    // Naming where they really live is what stops the next person hunting for
    // a missing parameter on this tool.
    expect(description).toMatch(/stored on the database root record/i);
  });

  it("still says the View works, so it does not read as a failure", async () => {
    const description = await describeOf("anydb_create_view");

    // The View is real; only its visibility is different. Without this the
    // warning reads as "this tool is broken".
    expect(description).toMatch(/A View created here is real and works/i);
    expect(description).toContain("parentid");
    expect(description).toContain("list_records");
  });

  it("tells the reader that an empty list is not an empty screen", async () => {
    const description = await describeOf("anydb_list_views");

    expect(description).toContain("This lists Views only");
    // The wrong conclusion to head off: "no Views returned" reading as "this
    // user has no saved filters", when their tabs are sitting right there.
    expect(description).toMatch(/not evidence that the user has no saved filters/i);
  });

  it("points at the tool that CAN read the tabs", async () => {
    const description = await describeOf("anydb_list_views");

    // This used to assert the tabs could not be read at all, which was true
    // until ISSUE - 24 added the listing-tab tools. Leaving that assertion in
    // place would have pinned a sentence that had become false — the failure
    // it produced is the test doing its job.
    expect(description).toMatch(/use anydb_list_listing_tabs/i);
  });

  it("carries the same boundary in the authoring guide", async () => {
    const guide = readFileSync(
      resolve(process.cwd(), "resources/solution-building-v1.md"),
      "utf8",
    );

    expect(guide).toContain("**A View is not a tab on a type's listing page.**");
    // The request that most often ends in this confusion.
    expect(guide).toMatch(/add a filter they can see/i);
    // Since ISSUE - 24 the guide must also name the tools that reach tabs, and
    // say which of the two constructs the user actually means.
    expect(guide).toContain("Tabs have their own tools");
    expect(guide).toContain("anydb_create_listing_tab");
  });
});
