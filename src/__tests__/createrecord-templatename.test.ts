import { describe, expect, it } from "@jest/globals";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createMcpServer } from "../mcp.js";

/**
 * POST /createrecord refuses a `templatename` that names no type in the
 * workspace (422, ISSUE - 236). Before that fix an mcp:write caller with a
 * typo silently got an UNTYPED record, so a model that has seen the old
 * behaviour may still try to "create first, fix the type later". The tool's
 * own parameter description is what the model reads at the moment it picks
 * the name, so the refusal has to be stated there.
 */
describe("create_record templatename describes the unknown-name refusal", () => {
  async function templatenameDescription() {
    const server = createMcpServer({ baseURL: "http://127.0.0.1:1/api" });
    const client = new Client({ name: "templatename-test", version: "0.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    try {
      const { tools } = await client.listTools();
      const tool: any = tools.find((candidate) => candidate.name === "create_record");
      return tool.inputSchema.properties.templatename.description as string;
    } finally {
      await client.close();
      await server.close();
    }
  }

  it("says a name that matches no type is refused, never an untyped record", async () => {
    const description = await templatenameDescription();

    expect(description).toMatch(/refused/);
    expect(description).toMatch(/422/);
    expect(description).toMatch(/untyped record/);
    expect(description).toMatch(/list_templates/);
  });
});
