/**
 * Configuration for AnyDB MCP Service
 * Adjust these values based on your AnyDB API setup
 */

// Debug: Log environment variables
console.error('[Config] ANYDB_DEFAULT_API_KEY:', process.env.ANYDB_DEFAULT_API_KEY ? `${process.env.ANYDB_DEFAULT_API_KEY.substring(0, 8)}...` : 'NOT SET');
console.error('[Config] ANYDB_DEFAULT_USER_EMAIL:', process.env.ANYDB_DEFAULT_USER_EMAIL || 'NOT SET');

export const config = {
  // AnyDB Internal API endpoint (not exposed outside local subnet)
  anydbApiBaseUrl: process.env.ANYDB_API_URL || "http://localhost:3000/api",

  // AnyDB Server source directory (for reading schemas and static data)
  anydbServerSource: process.env.ANYDB_SERVER_SOURCE || "",

  // Default authentication credentials (optional)
  // If set, users won't need to provide apiKey and userEmail via chat
  defaultApiKey: process.env.ANYDB_DEFAULT_API_KEY || undefined,
  defaultUserEmail: process.env.ANYDB_DEFAULT_USER_EMAIL || undefined,

  // Server configuration
  serverName: "anydb-mcp-service",
  serverVersion: "1.0.0",
};
