import { describe, expect, it } from "@jest/globals";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createMcpServer } from "../mcp.js";
import {
  readSolutionResource,
  SOLUTION_BUILDING_GUIDE_URI,
} from "../solution-resources.js";
import { TOOL_ANNOTATIONS } from "../tool-annotations.js";

/**
 * ISSUE - 297. The installed apps were invisible to an agent: every "is the
 * app installed, healthy, bound here, current?" check went through a browser
 * or ssh. Two read-only tools over the ext routes anydb-server PR #2264 adds.
 */
describe("app tools", () => {
  async function listTools() {
    const server = createMcpServer({ baseURL: "http://127.0.0.1:1/api" });
    const client = new Client({ name: "app-test", version: "0.0.0" });
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

  it("advertises anydb_list_apps and anydb_get_app, read-only", async () => {
    const names = (await listTools()).map((tool) => tool.name);
    expect(names).toContain("anydb_list_apps");
    expect(names).toContain("anydb_get_app");
    for (const name of ["anydb_list_apps", "anydb_get_app"]) {
      expect(TOOL_ANNOTATIONS[name]).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
      });
    }
  });

  it("says what a listing answers, and that adbid narrows to one workspace", async () => {
    const tools = await listTools();
    const list: any = tools.find((tool) => tool.name === "anydb_list_apps");
    expect(list.description).toMatch(/status/);
    expect(list.description).toMatch(/updateAvailableVersion/);
    expect(list.description).toMatch(/bound/);
    expect(list.inputSchema.required).toEqual(["teamid"]);
    expect(list.inputSchema.properties.adbid.type).toEqual("string");
  });

  it("the single read carries the activity log and says it cannot change anything", async () => {
    const tools = await listTools();
    const get: any = tools.find((tool) => tool.name === "anydb_get_app");
    expect(get.description).toMatch(/events|activity/);
    expect(get.description).toMatch(/Update|owner/);
    expect(get.inputSchema.required).toEqual(["teamid", "pluginId"]);
    expect(get.inputSchema.properties.eventsLimit).toMatchObject({ type: "integer", minimum: 1, maximum: 100 });
  });

  it("the guide tells an agent to check the app before blaming it", () => {
    const guide = readSolutionResource(SOLUTION_BUILDING_GUIDE_URI).text;
    expect(guide).toContain("anydb_list_apps");
    expect(guide).toContain("anydb_get_app");
  });
});
