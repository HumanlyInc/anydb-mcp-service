import { describe, expect, it } from "@jest/globals";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createMcpServer } from "../mcp.js";

/**
 * The View tools.
 *
 * A View is the tab on a type's listing page — `All` and the named filters
 * beside it. That is what the word means to a user, and anydb-ui agrees: the
 * provider is `src/providers/listing/views.provider.tsx` and the row type is
 * `ListingViewItemFilter`. The frontend has always called this a View.
 *
 * The MCP layer used to disagree. `anydb_create_view` built a standalone View
 * ADO that no listing page ever showed, so an agent asked for "a view showing
 * only X" called the tool whose name matched, got `persisted: true` and a real
 * viewId, and the user saw nothing change (ISSUE - 17). ISSUE - 24 added the
 * tabs under deliberately neutral `listing_tab` names to avoid a breaking
 * rename mid-flight; ISSUE - 30 is that rename.
 *
 * The View ADO tools are retired rather than renamed. Madhan's call: MCP is
 * new, nothing depends on them yet, and it is cheaper to fix the vocabulary
 * now than after publication.
 *
 * These tests replace views-vs-tabs.test.ts, which existed solely to pin the
 * distinction this rename removes.
 */
describe("view tools", () => {
  async function listTools() {
    const server = createMcpServer({ baseURL: "http://127.0.0.1:1/api" });
    const client = new Client({ name: "views-test", version: "0.0.0" });
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

  it("advertises the full set, read and write", async () => {
    const names = (await listTools()).map((tool) => tool.name);

    expect(names).toContain("anydb_list_views");
    expect(names).toContain("anydb_create_view");
    expect(names).toContain("anydb_update_view");
    expect(names).toContain("anydb_delete_view");
  });

  it("retires the View ADO family instead of leaving it beside the new one", async () => {
    const names = (await listTools()).map((tool) => tool.name);

    // There is no per-tab get, so this name does not come back under the new
    // meaning. It has to be gone rather than still pointing at the old
    // construct: mcp.ts checks isSolutionAuthoringTool BEFORE its own switch,
    // so a leftover entry would have quietly won every anydb_create_view call
    // and the rename would have been a no-op with extra steps.
    expect(names).not.toContain("anydb_get_view");
    expect(names.filter((name) => name === "anydb_create_view")).toHaveLength(1);
    expect(names.filter((name) => name === "anydb_list_views")).toHaveLength(1);
  });

  it("cannot silently accept a call written for the old tools", async () => {
    const create = await toolNamed("anydb_create_view");
    const del = await toolNamed("anydb_delete_view");

    // This is what makes reusing the name safe. The ticket's own objection was
    // that a name which keeps working while building something different is
    // the worst failure mode. It does not arise here, because the two families
    // share no required argument set: the old tools took a viewId or a
    // clientRequestId plus a view of {scope, targets}, and none of that
    // satisfies these. An old-shaped call fails a required-field check rather
    // than half-succeeding.
    expect(create.inputSchema.required).toEqual([
      "teamid",
      "adbid",
      "templateName",
      "view",
    ]);
    expect(create.inputSchema.properties.view.required).toEqual(["name"]);
    expect(create.inputSchema.properties.view.properties).not.toHaveProperty(
      "scope",
    );
    expect(create.inputSchema.properties.view.properties).not.toHaveProperty(
      "targets",
    );
    expect(create.inputSchema.properties).not.toHaveProperty("clientRequestId");
    expect(del.inputSchema.required).toEqual([
      "teamid",
      "adbid",
      "templateName",
      "name",
    ]);
    expect(del.inputSchema.properties).not.toHaveProperty("viewId");
  });

  it("describes a View as the thing on the listing page", async () => {
    const create = await toolNamed("anydb_create_view");

    expect(create.description).toMatch(/listing page/i);
    // The phrase a user actually says, so the match is obvious to an agent.
    expect(create.description).toContain("a view showing only X");
    expect(create.description).toMatch(/unique per type/i);
  });

  it("documents the filter shape, including the operator that is NOT allowed", async () => {
    const tool = await toolNamed("anydb_create_view");
    const filter = tool.inputSchema.properties.view.properties.filter;

    // {{Field Key}} syntax, not a grid position.
    expect(filter.description).toContain("{{Field Key}}");
    // `like` is commented out of ListingViewItemFilterOp in anydb-ui, so a
    // caller carrying it over would store a View that silently matches
    // nothing.
    expect(filter.description).toContain("`like` is NOT available");
  });

  it("promises update is a merge, because the layout cannot be resent", async () => {
    const tool = await toolNamed("anydb_update_view");

    // Column widths, displayed columns and sort are set in the app and are
    // not expressible here, so a caller has to know they survive.
    expect(tool.description).toMatch(/Only the keys you send are changed/i);
    expect(tool.description).toMatch(/column widths/i);
    expect(tool.inputSchema.required).toEqual([
      "teamid",
      "adbid",
      "templateName",
      "name",
      "changes",
    ]);
  });

  it("warns that All cannot be deleted, and why", async () => {
    const tool = await toolNamed("anydb_delete_view");

    expect(tool.description).toMatch(/All view cannot be deleted/i);
    // The reason matters: it is a real entry holding the page's defaults.
    expect(tool.description).toMatch(/default sort and column layout/i);
  });

  it("carries the same meaning in the authoring guide", async () => {
    const guide = readFileSync(
      resolve(process.cwd(), "resources/solution-building-v1.md"),
      "utf8",
    );

    expect(guide).toContain("## Views");
    expect(guide).toMatch(/A \*\*View\*\* is a tab on a type's listing page/);
    // Views hang off the root record per type, which is why every call names
    // the type rather than an id.
    expect(guide).toMatch(/stored per type on the database root record/i);
    // The retired family must not survive as advice.
    expect(guide).not.toContain("anydb_get_view");
    expect(guide).not.toContain("viewId");
  });
});
