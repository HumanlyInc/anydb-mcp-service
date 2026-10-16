/**
 * ISSUE - 672: every tool name the service mentions must be a tool the client can call.
 *
 * Tool descriptions, input-schema text, server instructions, guide resources and prompts
 * are scanned per profile. A reference to a tool that does not exist (renamed, or a
 * wrong prefix), or to one the profile hides (/reviewed has no scripts or generic
 * workflow authoring), sends a model after something it cannot call.
 *
 * Only tool-shaped names are checked: anydb_* and the record verbs (get_, list_, ...).
 * A parameter or field a description names is not checked here; ext-route-drift.test.ts
 * checks parameters against the server's routes.
 */
import { describe, expect, it } from "@jest/globals";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { AGENT_TOOLS } from "../agent-tools.js";
import { createMcpServer } from "../mcp.js";

const TOOL_NAME = /\b(anydb_[a-z0-9_]+|(?:get|list|create|update|delete|search|bulk|copy|move|upload|download|prepare|complete)_[a-z_]+)\b/g;

/** Tool-shaped words that are not tool names. */
const NOT_TOOLS = new Set(["update_available"]);

/** Known bad references, `<profile> <name> <- <where>`, each with the issue that removes it. */
const KNOWN: Record<string, string> = {
  // /reviewed descriptions still point at tools that profile hides.
  "reviewed anydb_update_workflow <- anydb_delete_workflow": "ISSUE - 670",
  "reviewed anydb_update_workflow <- anydb_save_agent": "ISSUE - 670",
  "reviewed anydb_update_workflow <- anydb_validate_agent": "ISSUE - 670",
  "reviewed anydb_create_workflow <- anydb_list_workflow_triggers": "ISSUE - 670",
  "reviewed anydb_create_workflow <- anydb_get_workflow": "ISSUE - 670",
  "reviewed anydb_create_workflow <- anydb_get_workflow_execution_history": "ISSUE - 670",
  "reviewed anydb_publish_agent <- anydb_save_agent": "ISSUE - 670",
  "reviewed anydb_publish_agent <- anydb_validate_agent": "ISSUE - 670",
  "reviewed anydb_execute_workflow <- anydb_save_agent": "ISSUE - 670",
  "reviewed anydb_execute_workflow <- anydb_validate_agent": "ISSUE - 670",
  "reviewed anydb_test_agent <- anydb_save_agent": "ISSUE - 670",
  "reviewed anydb_test_agent <- anydb_validate_agent": "ISSUE - 670",
  "reviewed anydb_run_script <- bulk_create_records": "ISSUE - 670",
};

async function badReferences(toolProfile: "full" | "reviewed"): Promise<string[]> {
  const server: any = createMcpServer({ apiKey: "key", userEmail: "someone@example.com", toolProfile } as any);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "reference-test", version: "1" });
  await Promise.all([server.connect(a), client.connect(b)]);

  const { tools } = await client.listTools();
  // The anydb_agent_* tools are listed only on a workflow-agent connection, but an
  // agent's configuration names them, so a reference to one is to a real tool.
  const names = new Set([...tools.map((t) => t.name), ...AGENT_TOOLS.map((t) => t.name)]);
  const texts: Array<[string, string]> = [["instructions", client.getInstructions() ?? ""]];
  for (const t of tools) texts.push([t.name, JSON.stringify({ d: t.description, s: t.inputSchema })]);
  for (const r of (await client.listResources()).resources) {
    const read: any = await client.readResource({ uri: r.uri });
    texts.push([r.uri, read.contents.map((c: any) => c.text ?? "").join("\n")]);
  }
  for (const p of (await client.listPrompts()).prompts) {
    const args = Object.fromEntries((p.arguments ?? []).map((arg) => [arg.name, "x"]));
    texts.push([`prompt:${p.name}`, JSON.stringify(await client.getPrompt({ name: p.name, arguments: args }))]);
  }

  const bad = new Set<string>();
  for (const [where, text] of texts) {
    for (const [, name] of text.matchAll(TOOL_NAME)) {
      if (!names.has(name) && !NOT_TOOLS.has(name)) bad.add(`${toolProfile} ${name} <- ${where}`);
    }
  }
  await client.close();
  return [...bad];
}

describe("tool names the service mentions (ISSUE - 672)", () => {
  for (const profile of ["full", "reviewed"] as const) {
    it(`names only tools the ${profile} profile lists`, async () => {
      const bad = await badReferences(profile);
      expect(bad.filter((k) => !(k in KNOWN))).toEqual([]);
      // A fixed reference must leave KNOWN too, so the list only shrinks.
      const stale = Object.keys(KNOWN).filter((k) => k.startsWith(`${profile} `) && !bad.includes(k));
      expect(stale).toEqual([]);
    });
  }
});
