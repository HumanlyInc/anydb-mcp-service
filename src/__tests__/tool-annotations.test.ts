import { describe, expect, it } from "@jest/globals";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createMcpServer } from "../mcp.js";
import { TOOL_ANNOTATIONS } from "../tool-annotations.js";

/**
 * Tool annotations are what directory reviewers (OpenAI Plugins, the Claude
 * Connectors Directory) check first, and a tool without them is rejected. They
 * are also what a client uses to decide which calls need the user's say-so, so
 * a wrong hint is not cosmetic: a destructive tool marked read-only can run
 * without the user ever being asked.
 *
 * The first test is the one that matters day to day. A new tool added without
 * an entry in TOOL_ANNOTATIONS fails here instead of failing a directory scan.
 */
describe("tool annotations", () => {
  async function listTools() {
    const server = createMcpServer({ baseURL: "http://127.0.0.1:1/api" });
    const client = new Client({ name: "annotations-test", version: "0.0.0" });
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

  const annotationsOf = async (name: string) => {
    const tools = await listTools();
    return tools.find((tool) => tool.name === name)?.annotations;
  };

  it("gives every advertised tool a title and all three hints", async () => {
    const tools = await listTools();
    const incomplete = tools
      .filter(
        (tool) =>
          !tool.title ||
          tool.annotations?.title !== tool.title ||
          typeof tool.annotations?.readOnlyHint !== "boolean" ||
          typeof tool.annotations?.destructiveHint !== "boolean" ||
          typeof tool.annotations?.openWorldHint !== "boolean",
      )
      .map((tool) => tool.name);

    expect(incomplete).toEqual([]);
  });

  it("has no entries for tools that are not advertised", async () => {
    const advertised = new Set((await listTools()).map((tool) => tool.name));
    const stale = Object.keys(TOOL_ANNOTATIONS).filter(
      (name) => !advertised.has(name),
    );

    expect(stale).toEqual([]);
  });

  it("never marks a read-only tool as destructive or open-world", async () => {
    const tools = await listTools();
    const contradictory = tools
      .filter(
        (tool) =>
          tool.annotations?.readOnlyHint &&
          (tool.annotations.destructiveHint || tool.annotations.openWorldHint),
      )
      .map((tool) => tool.name);

    expect(contradictory).toEqual([]);
  });

  it("marks deletes and revokes destructive", async () => {
    for (const name of [
      "delete_record",
      "anydb_delete_view",
      "anydb_delete_report",
      "anydb_delete_docgen_template",
      "anydb_revoke_share",
    ]) {
      expect(await annotationsOf(name)).toMatchObject({
        readOnlyHint: false,
        destructiveHint: true,
      });
    }
  });

  it("marks tools that can email people or run automation as open-world", async () => {
    for (const name of [
      "update_record",
      "bulk_update_records",
      "anydb_execute_workflow",
      "anydb_run_script",
    ]) {
      expect(await annotationsOf(name)).toMatchObject({
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: true,
      });
    }
  });

  // ISSUE - 471: the OpenAI plugin scan held these updates. A share exposes
  // content to people outside the workspace and revoking it later does not undo
  // what they already saw, so the scanner reads "destructiveHint: false" as an
  // understatement. Do not relax these back to match the old assertion.
  it("marks share creation and updates destructive and open-world", async () => {
    for (const name of ["anydb_create_share", "anydb_update_share"]) {
      expect(await annotationsOf(name)).toMatchObject({
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: true,
      });
    }
  });

  // ISSUE - 471: comments and @mentions email people, so the effect leaves the
  // workspace even though nothing existing is replaced.
  it("marks comments open-world but not destructive", async () => {
    expect(await annotationsOf("anydb_add_comment")).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    });
  });

  // ISSUE - 564: OpenAI rejected plugin v2.0.0 because "one or more" tool's
  // annotations did not match its behavior. A simulation suppresses writes and
  // email, but it still executes caller-supplied code and issues a runToken
  // that authorizes the real run, so it is not presented as read-only. Owner
  // decision 2026-10-09; do not flip this back to readOnlyHint: true.
  it("does not treat a script simulation as read-only", async () => {
    expect(await annotationsOf("anydb_simulate_script")).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    });
  });

  // ISSUE - 564: these tools set up or change automation that later runs
  // unattended, and a workflow's or agent's actions can send email and run
  // scripts. That effect leaves the workspace, the same rule that makes
  // anydb_execute_workflow open-world.
  it("marks tools that set up or change unattended automation as open-world", async () => {
    expect(await annotationsOf("anydb_create_workflow")).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    });
    for (const name of [
      "anydb_update_workflow",
      "anydb_update_workflow_trigger",
      "anydb_publish_agent",
    ]) {
      expect(await annotationsOf(name)).toMatchObject({
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: true,
      });
    }
  });

  // ISSUE - 564: OpenAI held both email tools with "marked destructiveHint: false, but its behavior appears to
  // cause material loss or a hard-to-reverse change". A sent email cannot be recalled, the same reason
  // anydb_agent_send_email is already destructive.
  it("marks tools that send email destructive as well as open-world", async () => {
    for (const name of ["anydb_email_report", "anydb_agent_email_report", "anydb_agent_email_document", "anydb_agent_send_email"]) {
      expect([name, await annotationsOf(name)]).toEqual([
        name,
        expect.objectContaining({ readOnlyHint: false, destructiveHint: true, openWorldHint: true }),
      ]);
    }
  });
});
