#!/usr/bin/env node

// Redirect console.log to console.error to prevent breaking MCP JSON-RPC protocol
// This ensures that any console.log calls (from dependencies like the SDK) don't write to stdout
const originalLog = console.log;
console.log = (...args: any[]) => {
  console.error(...args);
};

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { config } from "./config.js";
import { createMcpServer } from "./mcp.js";

const server = createMcpServer({
  apiKey: config.defaultApiKey || "",
  userEmail: config.defaultUserEmail || "",
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("AnyDB MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
