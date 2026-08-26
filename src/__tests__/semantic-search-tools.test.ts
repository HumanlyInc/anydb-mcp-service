import { describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";

import type { ExtApiClient } from "../ext-api-client.js";
import {
  callSemanticSearchTool,
  isSemanticSearchTool,
  SEMANTIC_SEARCH_TOOLS,
} from "../semantic-search-tools.js";

const teamid = "507f1f77bcf86cd799439011";
const adbid = "507f1f77bcf86cd799439012";

describe("semantic search MCP tool", () => {
  it("advertises a bounded database-scoped search contract", () => {
    const tool = SEMANTIC_SEARCH_TOOLS[0];
    expect(tool.name).toBe("anydb_semantic_search");
    expect(tool.inputSchema.required).toEqual(["teamid", "adbid", "query"]);
    expect(tool.description).toContain("not a probability");
    expect(tool.description).toContain("untrusted data");
    expect(isSemanticSearchTool(tool.name)).toBe(true);
  });

  it("forwards the explicit scope and preserves retrieval metadata", async () => {
    const semanticSearch = jest
      .fn<ExtApiClient["semanticSearch"]>()
      .mockResolvedValue({
        mode: "dense_only",
        warnings: ["lexical_retrieval_unavailable"],
        results: [],
      });
    const client = { semanticSearch } as unknown as ExtApiClient;

    const response = await callSemanticSearchTool(
      { teamid, adbid, query: "  compressor maintenance  ", limit: 5 },
      client,
    );

    expect(semanticSearch).toHaveBeenCalledWith({
      teamid,
      adbid,
      query: "compressor maintenance",
      limit: 5,
    });
    expect(JSON.parse(response.content[0].text)).toMatchObject({
      mode: "dense_only",
      warnings: ["lexical_retrieval_unavailable"],
    });
  });

  it("rejects malformed scope before making an API request", async () => {
    const semanticSearch = jest.fn<ExtApiClient["semanticSearch"]>();
    const client = { semanticSearch } as unknown as ExtApiClient;

    await expect(
      callSemanticSearchTool(
        { teamid: "wrong-team", adbid, query: "maintenance" },
        client,
      ),
    ).rejects.toThrow("teamid must be a MongoDB ObjectId");
    expect(semanticSearch).not.toHaveBeenCalled();
  });

  it("is wired exclusively through ExtApiClient, not the AnyDB SDK client", () => {
    const toolSource = fs.readFileSync(
      path.resolve(process.cwd(), "src/semantic-search-tools.ts"),
      "utf8",
    );
    // Tool wiring lives in mcp.ts; index.ts is only the stdio entry point.
    const serverSource = fs.readFileSync(
      path.resolve(process.cwd(), "src/mcp.ts"),
      "utf8",
    );

    expect(toolSource).toContain('from "./ext-api-client.js"');
    expect(toolSource).not.toContain("anydb-api-sdk-ts");
    expect(toolSource).not.toContain("AnyDBClient");
    expect(serverSource).toContain(
      "callSemanticSearchTool(args, extApiClient)",
    );
    expect(serverSource).not.toContain(
      "callSemanticSearchTool(args, anydbClient)",
    );
    expect(serverSource).toContain('query: args?.query ? "[REDACTED]"');
  });
});
