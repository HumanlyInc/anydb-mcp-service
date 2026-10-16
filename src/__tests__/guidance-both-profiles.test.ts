/**
 * ISSUE - 671: guidance has to reach a client at the point it acts, on both
 * profiles, without sending it the whole 116 KB guide.
 *
 * Pins wording and wiring only: that the instructions name the topic tool and the
 * projection rule, that the reading topic exists in a form each profile can act
 * on, and that a failed call names a topic that exists. Whether a model then
 * reads it is not something a unit test can show.
 */
import { describe, expect, it } from "@jest/globals";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { TOOL_GUIDE_TOPICS } from "../guide-topics.js";
import { createMcpServer } from "../mcp.js";

async function connect(toolProfile: "full" | "reviewed") {
  const server: any = createMcpServer({ apiKey: "key", userEmail: "someone@example.com", toolProfile, baseURL: "http://127.0.0.1:1/api" } as any);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "guidance-test", version: "1" });
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

const guideText = async (client: Client, topic?: string) => {
  const res: any = await client.callTool({ name: "anydb_get_authoring_guide", arguments: topic ? { topic } : {} });
  return res.content[0].text as string;
};

describe("guidance on both profiles (ISSUE - 671)", () => {
  for (const profile of ["full", "reviewed"] as const) {
    it(`${profile}: instructions carry the projection rule and point at guide topics`, async () => {
      const client = await connect(profile);
      const instructions = client.getInstructions() ?? "";
      expect(instructions).toContain("always pass fields (with values: true)");
      expect(instructions).toContain("anydb_get_authoring_guide");
      // Not the whole guide and schema up front.
      expect(instructions).not.toMatch(/read anydb:\/\/guides\/solution-building\/v1 and anydb:\/\/schemas/);
      await client.close();
    });

    it(`${profile}: the reading-and-analysis topic is listed and says what to do`, async () => {
      const client = await connect(profile);
      expect(await guideText(client)).toContain("`reading-and-analysis`");
      const topic = await guideText(client, "reading-and-analysis");
      expect(topic).toContain("values: true");
      expect(topic).toContain("anydb_run_report");
      if (profile === "full") {
        expect(topic).toContain("anydb_simulate_script");
        expect(topic).toContain("anydb_run_script");
      } else {
        // /reviewed has no script tools; its copy must not send a model to them,
        // nor read as the hidden-tool placeholder.
        expect(topic).not.toMatch(/anydb_(run|simulate)_script/);
        expect(topic).not.toContain("the explicit reviewed workflow tools");
      }
      await client.close();
    });

    it(`${profile}: every topic a tool error can name exists in the guide`, async () => {
      const client = await connect(profile);
      const missing: string[] = [];
      for (const topic of new Set(Object.values(TOOL_GUIDE_TOPICS))) {
        const res: any = await client.callTool({ name: "anydb_get_authoring_guide", arguments: { topic } });
        if (res.isError) missing.push(topic);
      }
      expect(missing).toEqual([]);
      await client.close();
    });
  }

  it("a failed call names the guide topic for that tool", async () => {
    const client = await connect("full");
    const res: any = await client.callTool({ name: "anydb_create_type", arguments: { teamid: "x", adbid: "y" } });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain(`anydb_get_authoring_guide with topic "${TOOL_GUIDE_TOPICS.anydb_create_type}"`);
    await client.close();
  });
});
