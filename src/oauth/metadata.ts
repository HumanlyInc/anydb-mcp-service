import { config } from "../config.js";
import { KNOWN_SCOPES } from "./token-verifier.js";

/**
 * RFC 9728 protected-resource metadata. Hosted MCP clients fetch this before
 * they hold any credential, to discover which authorization server to use.
 */
export function protectedResourceMetadata() {
  return {
    resource: config.oauth.resourceUri,
    authorization_servers: [config.oauth.issuer],
    scopes_supported: [...KNOWN_SCOPES],
    bearer_methods_supported: ["header"],
    resource_documentation: config.oauth.resourceDocumentation,
  };
}

/** Absolute URL of this server's protected-resource metadata document. */
export function resourceMetadataUrl(): string {
  return `${config.oauth.resourceUri}/.well-known/oauth-protected-resource`;
}

/**
 * Build a WWW-Authenticate challenge. The resource_metadata pointer is what
 * lets a client that hit a 401 discover where to go authenticate, so it is
 * mandatory on every unauthorized response.
 */
export function buildAuthenticateHeader(options?: {
  error?: "invalid_token" | "insufficient_scope";
  description?: string;
  scope?: string;
}): string {
  const parts = [`resource_metadata="${resourceMetadataUrl()}"`];
  if (options?.error) parts.push(`error="${options.error}"`);
  if (options?.description) {
    // Quoted-string values cannot contain raw quotes or backslashes.
    const safe = options.description.replace(/[\\"]/g, "").slice(0, 200);
    parts.push(`error_description="${safe}"`);
  }
  if (options?.scope) parts.push(`scope="${options.scope}"`);
  return `Bearer ${parts.join(", ")}`;
}
