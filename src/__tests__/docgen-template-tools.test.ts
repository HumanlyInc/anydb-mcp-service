import { describe, expect, it } from "@jest/globals";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createMcpServer } from "../mcp.js";

/**
 * Document Generation templates.
 *
 * The product has two names for this feature: users see "Document Generation",
 * while internally it is a "formatted export" served from /dbs/exportmappings.
 * That is why searching the tool catalog for docgen, pdf or document
 * generation came back empty (ISSUE - 27) — the capability was there and
 * unreachable, under a name nobody would look for.
 *
 * These tools take the user's word. The tests pin the two things an agent gets
 * wrong otherwise: that the template file has to be uploaded AND completed
 * first, and that update is a full replace which hands back a new id.
 */
describe("docgen template tools", () => {
  async function listTools() {
    const server = createMcpServer({ baseURL: "http://127.0.0.1:1/api" });
    const client = new Client({ name: "docgen-test", version: "0.0.0" });
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

  it("advertises the full family", async () => {
    const names = (await listTools()).map((tool) => tool.name);

    expect(names).toContain("anydb_list_docgen_templates");
    expect(names).toContain("anydb_create_docgen_template");
    expect(names).toContain("anydb_update_docgen_template");
    expect(names).toContain("anydb_delete_docgen_template");
  });

  it("names the internal word too, so the feature is findable", async () => {
    const tool = await toolNamed("anydb_list_docgen_templates");

    // An agent reading server logs or URLs will meet "formatted export" and
    // otherwise have no reason to connect it to these tools.
    expect(tool.description).toMatch(/formatted export/i);
    expect(tool.description).toContain("Document Generation");
  });

  it("spells out the upload prerequisite, including completing it", async () => {
    const tool = await toolNamed("anydb_create_docgen_template");

    expect(tool.description).toMatch(/MUST BE UPLOADED FIRST/);
    // The half-done case is the trap: a File record exists from prepare
    // onwards, so the adoid looks usable before the upload finishes.
    expect(tool.description).toContain("complete_file_upload");
    expect(tool.description).toMatch(/looks usable and is not/i);
  });

  it("warns against passing the record to generate from", async () => {
    const tool = await toolNamed("anydb_create_docgen_template");
    const fileRecordId =
      tool.inputSchema.properties.fileRecordId.description;

    // The obvious wrong adoid to reach for.
    expect(fileRecordId).toMatch(
      /NOT the record you want to generate a document from/i,
    );
  });

  it("says update replaces everything and reissues the id", async () => {
    const tool = await toolNamed("anydb_update_docgen_template");

    // Both halves matter: omitting a field loses it, and reusing the old id
    // afterwards silently addresses a mapping that no longer exists.
    expect(tool.description).toMatch(/EVERY FIELD IS REQUIRED/);
    expect(tool.description).toMatch(/NEW id/);
    expect(tool.inputSchema.required).toEqual([
      "teamid",
      "adbid",
      "docgenId",
      "templateName",
      "fileRecordId",
      "name",
    ]);
  });

  it("says delete keeps the uploaded file", async () => {
    const tool = await toolNamed("anydb_delete_docgen_template");

    expect(tool.description).toMatch(/not the uploaded template file/i);
  });
});
