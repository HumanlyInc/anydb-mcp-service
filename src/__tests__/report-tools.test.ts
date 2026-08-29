import { describe, expect, it } from "@jest/globals";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createMcpServer } from "../mcp.js";
import {
  readSolutionResource,
  SOLUTION_BUILDING_GUIDE_URI,
} from "../solution-resources.js";

/**
 * The report tools.
 *
 * Reports are a first-class tab alongside Views and Workflows, and both of
 * those had a full tool family while Reports had none — the subsystem was
 * invisible to MCP authoring (ISSUE - 15).
 *
 * A report is structurally a View: an ADO on a predefined template with its
 * payload in meta.metaprops. So these tools mirror the View family, and the
 * thing worth asserting is that an author can learn the definition's shape
 * from the tool itself rather than by reading server source.
 */
describe("report tools", () => {
  async function listTools() {
    const server = createMcpServer({ baseURL: "http://127.0.0.1:1/api" });
    const client = new Client({ name: "report-test", version: "0.0.0" });
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

  it("advertises the whole family, as Views and Workflows have", async () => {
    const names = (await listTools()).map((tool) => tool.name);

    for (const name of [
      "anydb_create_report",
      "anydb_list_reports",
      "anydb_get_report",
      "anydb_update_report",
    ]) {
      expect(names).toContain(name);
    }
  });

  it("describes the definition well enough to write one", async () => {
    const tools = await listTools();
    const create: any = tools.find(
      (tool) => tool.name === "anydb_create_report",
    );
    const definition = create.inputSchema.properties.definition.description;

    // Every part an author has to supply or choose between.
    expect(definition).toContain("templateName");
    expect(definition).toContain("groupBy");
    expect(definition).toContain("selectedFields");
    expect(definition).toContain("sum|avg|min|max|count");
    expect(definition).toContain("day|week|month|quarter|year");
  });

  it("states the constraints that fail late rather than obviously", async () => {
    const tools = await listTools();
    const create: any = tools.find(
      (tool) => tool.name === "anydb_create_report",
    );
    const definition = create.inputSchema.properties.definition.description;

    // Subtotals without metrics, a non-IANA timezone, and repeating a date
    // group field are all rejected by the runtime. An author who does not know
    // that finds out only when the create call fails.
    expect(definition).toContain("both need at least one metric");
    expect(definition).toContain("IANA");
    expect(definition).toContain("cannot be grouped twice");
  });

  it("warns that update replaces the definition wholesale", async () => {
    const tools = await listTools();
    const update = tools.find((tool) => tool.name === "anydb_update_report");

    // Same trap as update_view's targets: a partial definition silently drops
    // whatever was left out.
    expect(update?.description).toContain("REPLACES the whole definition");
    expect(update?.description).toContain("rename only");
  });

  it("offers validateOnly on both writes", async () => {
    const tools = await listTools();
    const create: any = tools.find(
      (tool) => tool.name === "anydb_create_report",
    );
    const update: any = tools.find(
      (tool) => tool.name === "anydb_update_report",
    );

    expect(create.inputSchema.properties.validateOnly.type).toEqual("boolean");
    expect(update.inputSchema.properties.validateOnly.type).toEqual("boolean");
  });

  it("is covered by the authoring guide", () => {
    const guide = readSolutionResource(SOLUTION_BUILDING_GUIDE_URI).text;

    expect(guide).toContain("## Reports");
    expect(guide).toContain("anydb_list_reports");
    expect(guide).toContain("replaces the whole definition");
  });
});
