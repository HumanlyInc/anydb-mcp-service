import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Configuration for AnyDB MCP Service
 * Adjust these values based on your AnyDB API setup
 */

/**
 * Read the package version so the MCP handshake reports what is actually
 * running. Both src/config.ts and dist/config.js sit one level below the
 * package root, so the relative path resolves in dev and in the published
 * package alike.
 */
function readPackageVersion(): string {
  try {
    const path = fileURLToPath(new URL("../package.json", import.meta.url));
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return typeof parsed.version === "string" ? parsed.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function parseOrigins(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

const oauthIssuer = (
  process.env.MCP_OAUTH_ISSUER || "https://app.anydb.com"
).replace(/\/$/, "");

export const config = {
  // AnyDB Internal API endpoint (not exposed outside local subnet)
  anydbApiBaseUrl: process.env.ANYDB_API_URL || "https://app.anydb.com/api",

  // Default authentication credentials (optional)
  // If set, users won't need to provide apiKey and userEmail via chat
  defaultApiKey: process.env.ANYDB_DEFAULT_API_KEY || undefined,
  defaultUserEmail: process.env.ANYDB_DEFAULT_USER_EMAIL || undefined,

  // Server configuration
  serverName: "anydb-mcp-service",
  serverVersion: readPackageVersion(),

  http: {
    // Dedicated port: the REST server owns REST_API_PORT.
    port: Number(process.env.MCP_HTTP_PORT || 3001),

    // Bind loopback by default. Only widen behind a TLS-terminating proxy.
    host: process.env.MCP_HTTP_HOST || "127.0.0.1",

    // Browser origins allowed to call the MCP endpoint. Empty means no CORS
    // headers are emitted at all, which is correct for non-browser clients.
    allowedOrigins: parseOrigins(process.env.MCP_ALLOWED_ORIGINS),
  },

  oauth: {
    // Canonical resource identifier; the audience tokens must carry.
    resourceUri: (
      process.env.MCP_RESOURCE_URI || "https://mcp.anydb.com"
    ).replace(/\/$/, ""),
    issuer: oauthIssuer,
    jwksUri:
      process.env.MCP_OAUTH_JWKS_URI || `${oauthIssuer}/.well-known/jwks.json`,
    // Bearer auth is on unless explicitly disabled.
    enabled: process.env.MCP_OAUTH_ENABLED !== "false",
    resourceDocumentation:
      "https://www.anydb.com/support/integrations/mcp-claude",
  },
};
