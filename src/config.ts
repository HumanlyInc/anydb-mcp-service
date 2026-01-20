/**
 * Configuration for AnyDB MCP Service
 * Adjust these values based on your AnyDB API setup
 */

export const config = {
  // AnyDB Internal API endpoint (not exposed outside local subnet)
  anydbApiBaseUrl: process.env.ANYDB_API_URL || "http://localhost:3000/api",

  // AnyDB Server source directory (for reading schemas and static data)
  anydbServerSource: process.env.ANYDB_SERVER_SOURCE || "",

  // Server configuration
  serverName: "anydb-mcp-service",
  serverVersion: "1.0.0",
};
