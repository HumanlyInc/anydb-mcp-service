import { describe, expect, it } from "@jest/globals";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createMcpServer } from "../mcp.js";

/**
 * The listing-tab tools.
 *
 * A person could add a tab to a type's listing page in the app; an agent could
 * not, and could not even enumerate the ones already there (ISSUE - 24). The
 * capability existed — it was simply unreachable.
 *
 * The hard part is not the plumbing, it is that the product calls a tab a
 * "View" while anydb_create_view builds something else. So these tests pin the
 * disambiguation as much as the tools: an agent that picks the wrong family
 * still gets a successful response and the user still sees nothing change.
 *
 * Names are deliberately listing_tab rather than view. Taking the "view" name
 * would mean renaming five existing tools, which is breaking — tracked as
 * ISSUE - 30 instead.
 */
describe("listing tab tools", () => {
  async function listTools() {
    const server = createMcpServer({ baseURL: "http://127.0.0.1:1/api" });
    const client = new Client({ name: "tabs-test", version: "0.0.0" });
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

    expect(names).toContain("anydb_list_listing_tabs");
    expect(names).toContain("anydb_create_listing_tab");
    expect(names).toContain("anydb_update_listing_tab");
    expect(names).toContain("anydb_delete_listing_tab");
  });

  it("tells the agent this is the one the user usually means", async () => {
    const tool = await toolNamed("anydb_create_listing_tab");

    // The whole point. Without this an agent hears "view" and reaches for
    // anydb_create_view, which succeeds and changes nothing the user can see.
    expect(tool.description).toMatch(/THIS IS THE ONE A USER USUALLY MEANS/);
    expect(tool.description).toContain("anydb_create_view");
    expect(tool.description).toMatch(/the user sees no change/i);
  });

  it("says a tab is not a View, from the reading side too", async () => {
    const tool = await toolNamed("anydb_list_listing_tabs");

    expect(tool.description).toContain("THESE ARE NOT VIEWS");
    // An empty result from the other tool is not evidence of no tabs.
    expect(tool.description).toContain("anydb_list_views");
  });

  it("documents the filter shape, including the operator that is NOT allowed", async () => {
    const tool = await toolNamed("anydb_create_listing_tab");
    const filter = tool.inputSchema.properties.tab.properties.filter;

    // {{Field Key}} syntax, not a grid position.
    expect(filter.description).toContain("{{Field Key}}");
    // `like` is valid for a View and invalid here. An agent carrying it over
    // would store a tab that silently matches nothing.
    expect(filter.description).toContain("`like` is NOT available here");
    expect(filter.description).toContain("anydb_create_view");
  });

  it("promises update is a merge, because the layout cannot be resent", async () => {
    const tool = await toolNamed("anydb_update_listing_tab");

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
    const tool = await toolNamed("anydb_delete_listing_tab");

    expect(tool.description).toMatch(/All tab cannot be deleted/i);
    // The reason matters: it is a real entry holding the page's defaults.
    expect(tool.description).toMatch(/default sort and column layout/i);
  });
});
