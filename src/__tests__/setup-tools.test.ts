import { describe, expect, it } from "@jest/globals";

import { callSetupTool, isSetupTool, SETUP_TOOLS } from "../setup-tools.js";

describe("setup tools", () => {
  it("advertises a credential-free setup guide tool", () => {
    expect(SETUP_TOOLS).toEqual([
      expect.objectContaining({
        name: "anydb_get_setup_guide",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      }),
    ]);
    expect(isSetupTool("anydb_get_setup_guide")).toBe(true);
    expect(isSetupTool("list_teams")).toBe(false);
  });

  it("returns actionable setup instructions without an API client", () => {
    const result = callSetupTool("anydb_get_setup_guide");

    expect(result.content[0].text).toContain("ANYDB_DEFAULT_API_KEY");
    expect(result.content[0].text).toContain("ANYDB_DEFAULT_USER_EMAIL");
    expect(result.content[0].text).toContain("ANYDB_API_URL");
    expect(result.content[0].text).toContain("List my AnyDB teams");
  });
});
