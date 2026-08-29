import { describe, expect, it } from "@jest/globals";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createMcpServer } from "../mcp.js";

/**
 * Pressing a button.
 *
 * A button-format cell stores BUTTON_ACTION_TYPE "automation" and
 * BUTTON_ACTION_VALUE. The only documentation for that was one clause saying
 * the two props "wire a button-format cell to an automation", which left the
 * important part unsaid: BUTTON_ACTION_VALUE is the workflow's NAME, and
 * anydb_execute_workflow took only an id. An agent could read a button and had
 * nothing to do with what it read (ISSUE - 22).
 *
 * The reporter's own guess — that BUTTON_ACTION_VALUE is a workflowId — is
 * exactly the wrong turn these descriptions have to prevent, so the tests
 * assert the tool says "not its id" rather than merely mentioning names.
 */
describe("button-to-workflow", () => {
  async function listTools() {
    const server = createMcpServer({ baseURL: "http://127.0.0.1:1/api" });
    const client = new Client({ name: "button-test", version: "0.0.0" });
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

  const executeTool = async () => {
    const tools = await listTools();
    return tools.find(
      (tool) => tool.name === "anydb_execute_workflow",
    ) as any;
  };

  it("accepts a name as well as an id", async () => {
    const tool = await executeTool();
    const properties = tool.inputSchema.properties;

    expect(properties).toHaveProperty("workflowName");
    expect(properties).toHaveProperty("workflowId");
    // Neither can be required now that either will do.
    expect(tool.inputSchema.required).not.toContain("workflowId");
    expect(tool.inputSchema.required).toEqual(
      expect.arrayContaining(["teamid", "adbid", "simulate"]),
    );
  });

  it("corrects the guess that BUTTON_ACTION_VALUE is an id", async () => {
    const tool = await executeTool();

    expect(tool.description).toContain("BUTTON_ACTION_VALUE");
    expect(tool.description).toContain("NAME, not its id");
    // The round trip, named end to end.
    expect(tool.description).toContain("get_record");
    expect(tool.description).toMatch(/pass its BUTTON_ACTION_VALUE as workflowName/);
    expect(tool.description).toContain("adoid");
  });

  it("says there is no button trigger to look for", async () => {
    const tool = await executeTool();

    // The reporter searched the trigger list for a button trigger and found
    // none, which is correct and worth stating rather than leaving to be
    // rediscovered.
    expect(tool.description).toMatch(/no button-specific trigger/i);
  });

  it("is honest about what a click enforces and this does not", async () => {
    const tool = await executeTool();

    // Same code, same permissions, same attribution...
    expect(tool.description).toMatch(/same record permissions/i);
    expect(tool.description).toMatch(/attribution/i);
    // ...except the one thing that is presentation only.
    expect(tool.description).toContain("CELL_LOCKED");
    expect(tool.description).toMatch(/not checked here/i);
  });

  it("describes name matching where the parameter is", async () => {
    const tool = await executeTool();
    const workflowName = tool.inputSchema.properties.workflowName;

    expect(workflowName.description).toContain("BUTTON_ACTION_VALUE");
    // Two workflows sharing a name is the failure a button cannot see coming.
    expect(workflowName.description).toMatch(/fails rather than guessing/i);
  });

  it("explains buttons in the authoring guide, for whoever builds one", async () => {
    const guide = readFileSync(
      resolve(process.cwd(), "resources/solution-building-v1.md"),
      "utf8",
    );

    expect(guide).toContain("#### Buttons");
    expect(guide).toContain('`BUTTON_ACTION_TYPE` is always `"automation"`');
    expect(guide).toContain("the workflow's **name**, not its id");
    // The consequence an author has to design around.
    expect(guide).toMatch(/renaming a workflow silently breaks every button/i);
    expect(guide).toMatch(/Keep automation names unique within a database/i);
  });
});
