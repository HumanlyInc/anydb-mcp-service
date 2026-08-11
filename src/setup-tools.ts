import type { Tool } from "@modelcontextprotocol/sdk/types.js";

import {
  ANYDB_SETUP_GUIDE_URI,
  readSolutionResource,
} from "./solution-resources.js";

export const SETUP_TOOLS: Tool[] = [
  {
    name: "anydb_get_setup_guide",
    description:
      "Return the AnyDB MCP installation, API-key, client configuration, verification, and troubleshooting guide. This tool is available even when AnyDB credentials are not configured.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];

export function isSetupTool(name: string): boolean {
  return name === "anydb_get_setup_guide";
}

export function callSetupTool(name: string) {
  if (!isSetupTool(name)) throw new Error(`Unknown setup tool: ${name}`);
  return {
    content: [
      {
        type: "text" as const,
        text: readSolutionResource(ANYDB_SETUP_GUIDE_URI).text,
      },
    ],
  };
}
