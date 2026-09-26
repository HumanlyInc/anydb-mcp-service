import { describe, expect, it } from "@jest/globals";

import type { ExtApiClient } from "../ext-api-client.js";
import { callSolutionAuthoringTool, SOLUTION_AUTHORING_TOOLS } from "../solution-authoring-tools.js";

/**
 * ISSUE - 324. The guide came back as one 80 KB result - more than a client's
 * tool-result cap, so it was spilled to a file an agent had to page through,
 * on every authoring task. It now answers the general contract plus an index by
 * default, and one section (or several) by topic.
 */
const call = async (args?: Record<string, unknown>) =>
  (await callSolutionAuthoringTool("anydb_get_authoring_guide", args, {} as ExtApiClient)).content[0]!.text;

describe("anydb_get_authoring_guide topics", () => {
  it("answers the general contract and an index of topics by default, well under a tool-result cap", async () => {
    const text = await call();
    expect(text.length).toBeLessThan(20_000);
    expect(text).toContain("## Authoring Scope");
    expect(text).not.toContain("## Workflows\n");
    for (const topic of ["cells", "formulas", "workflows", "relationships", "record-titles"]) expect(text).toContain(`\`${topic}\``);
  });

  it("answers one section, or several, by topic", async () => {
    const formulas = await call({ topic: "formulas" });
    expect(formulas).toContain("## Formulas");
    expect(formulas).not.toContain("## Cells");
    const two = await call({ topic: "cells,workflows" });
    expect(two).toContain("## Cells");
    expect(two).toContain("## Workflows");
  });

  it("answers the whole guide for topic all, and names the topics for an unknown one", async () => {
    expect((await call({ topic: "all" })).length).toBeGreaterThan(60_000);
    await expect(call({ topic: "nope" })).rejects.toThrow(/formulas/);
  });

  it("advertises the topic parameter", () => {
    const tool = SOLUTION_AUTHORING_TOOLS.find((t) => t.name === "anydb_get_authoring_guide")!;
    expect((tool.inputSchema.properties as Record<string, unknown>).topic).toBeDefined();
  });
});

describe("authoring guide content (ISSUE - 324)", () => {
  it("says how to clear a field's formula, and that a migration leaves records' own formulas in place", async () => {
    const all = await call({ topic: "all" });
    expect(all).toContain('formula: ""');
    expect(all).toContain("does not rewrite a formula a record already holds");
  });
});

describe("authoring guide gaps (ISSUE - 322)", () => {
  it("covers the gaps found during a real build", async () => {
    const all = await call({ topic: "all" });
    for (const needle of [
      "A@CURRREC!N@Project!{{Budget}}[0]",
      "are not functions here",
      "THRESHOLDBYSUM(array, key, threshold)",
      "REGEXREPLACE(text, pattern, replacement",
      "STATES([country])",
      "send the field's `key` with it",
      "https://<host>/<teamid>/<adbid>/<adoid>",
      "Renaming a field key is not reference-safe",
      "position already taken",
      "`VALUE_OVERRIDE` is not `VALUE_OVERRIDE_ENABLED`",
      "moment.js token"
    ]) expect(all).toContain(needle);
  });
});
