import { describe, expect, it } from "@jest/globals";

import { getSolutionPrompt, listSolutionPrompts } from "../solution-prompts.js";

describe("solution prompts", () => {
  it("lists the opt-in solution design prompt", () => {
    expect(listSolutionPrompts()).toEqual([
      expect.objectContaining({ name: "design_anydb_type" }),
      expect.objectContaining({ name: "design_anydb_solution" }),
    ]);
  });

  it("builds a standalone type prompt without forcing a solution", () => {
    const result = getSolutionPrompt("design_anydb_type", {
      goal: "Capture meeting notes",
    });
    const text = result.messages[0].content.text;

    expect(text).toContain("one standalone AnyDB type");
    expect(text).toContain("anydb_discover_types");
    expect(text).toContain('source "workspace"');
    expect(text).toContain('source "builtin"');
    expect(text).toContain("Compare semantic content and behavior, not names");
    expect(text).toContain("A matching name is insufficient");
    expect(text).toContain("record/form share as a separate artifact");
    expect(text).toContain("Do not introduce additional types or workflows");
  });

  it("builds a discovery-first implementation blueprint prompt", () => {
    const result = getSolutionPrompt("design_anydb_solution", {
      goal: "Track orders and fulfillment",
      constraints: "Reuse existing product types",
    });
    const text = result.messages[0].content.text;

    expect(text).toContain("Track orders and fulfillment");
    expect(text).toContain("anydb://guides/solution-building/v1");
    expect(text).toContain("anydb_get_type_definition");
    expect(text).toContain('source "workspace"');
    expect(text).toContain('source "builtin"');
    expect(text).toContain("Compare semantic content and behavior, not names");
    expect(text).toContain("A matching name is insufficient");
    expect(text).toContain("anydb_list_views");
    expect(text).toContain("anydb_list_shares");
    expect(text).toContain("anydb_list_workflows");
    expect(text).toContain(
      "workflow only when a required event or record change",
    );
    expect(text).toContain("Prefer formulas/lookups for derived values");
    expect(text).toContain("five or more workflows as a design-review signal");
    expect(text).toContain("anydb_list_team_groups");
    expect(text).toContain("generated publicUrl");
    expect(text).toContain("Do not call mutation tools");
  });

  it("requires a business goal", () => {
    expect(() => getSolutionPrompt("design_anydb_solution", {})).toThrow(
      "goal is required",
    );
  });
});
