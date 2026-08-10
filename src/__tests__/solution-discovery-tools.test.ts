import { describe, expect, it, jest } from "@jest/globals";

import type { ExtApiClient } from "../ext-api-client.js";
import {
  callSolutionDiscoveryTool,
  isSolutionDiscoveryTool,
  SOLUTION_DISCOVERY_TOOLS,
} from "../solution-discovery-tools.js";

function createClient() {
  return {
    discoverTypes: jest.fn(),
    getTypeDefinition: jest.fn(),
    listWorkflows: jest.fn(),
  } as unknown as ExtApiClient;
}

describe("solution discovery tools", () => {
  it("advertises all read-only solution discovery tools", () => {
    expect(SOLUTION_DISCOVERY_TOOLS.map((tool) => tool.name)).toEqual([
      "anydb_discover_types",
      "anydb_get_type_definition",
      "anydb_list_workflows",
    ]);
    expect(isSolutionDiscoveryTool("anydb_get_type_definition")).toBe(true);
    expect(isSolutionDiscoveryTool("anydb_create_type")).toBe(false);
  });

  it("gets a selected built-in type definition", async () => {
    const client = createClient();
    jest.mocked(client.getTypeDefinition).mockResolvedValue({
      source: "builtin",
      templateName: "Inventory Item",
      templateId: "507f1f77bcf86cd799439011",
      status: "ok",
      definition: { meta: { name: "Inventory Item" } },
    });

    const result = await callSolutionDiscoveryTool(
      "anydb_get_type_definition",
      {
        teamid: "507f1f77bcf86cd799439012",
        adbid: "507f1f77bcf86cd799439013",
        templateName: "Inventory Item",
        source: "builtin",
      },
      client,
    );

    expect(client.getTypeDefinition).toHaveBeenCalledWith({
      teamid: "507f1f77bcf86cd799439012",
      adbid: "507f1f77bcf86cd799439013",
      templateName: "Inventory Item",
      source: "builtin",
    });
    expect(JSON.parse(result.content[0].text)).toMatchObject({ status: "ok" });
  });

  it("lists workflows for the selected database", async () => {
    const client = createClient();
    jest.mocked(client.listWorkflows).mockResolvedValue([]);

    await callSolutionDiscoveryTool(
      "anydb_list_workflows",
      {
        teamid: "507f1f77bcf86cd799439012",
        adbid: "507f1f77bcf86cd799439013",
      },
      client,
    );

    expect(client.listWorkflows).toHaveBeenCalledWith(
      "507f1f77bcf86cd799439012",
      "507f1f77bcf86cd799439013",
    );
  });

  it("rejects an invalid definition source", async () => {
    const client = createClient();
    await expect(
      callSolutionDiscoveryTool(
        "anydb_get_type_definition",
        {
          teamid: "507f1f77bcf86cd799439012",
          adbid: "507f1f77bcf86cd799439013",
          templateName: "Inventory Item",
          source: "all",
        },
        client,
      ),
    ).rejects.toThrow("source must be workspace or builtin");
  });
});
