import type { Tool } from "@modelcontextprotocol/sdk/types.js";

import type { VerifiedToken } from "./oauth/token-verifier.js";

/**
 * "Which AnyDB account am I connected as?"
 *
 * The answer was already sitting in the verified access token and then thrown
 * away, so the only way to work it out was to call a data tool and recognise
 * the results — which fails exactly when it matters, because two accounts that
 * share a team look alike until you read the lists side by side. Switching
 * accounts on a connector is the case that makes this urgent: the flow can
 * succeed and leave you connected as somebody else, with nothing to show it.
 *
 * Deliberately answers without credentials too. "Not authenticated" is a real
 * answer, and a diagnostic that only works once things are working is no use.
 */

export const IDENTITY_TOOLS: Tool[] = [
  {
    name: "anydb_whoami",
    description:
      "Report which AnyDB account this connection is authenticated as, how it authenticated, and what it is allowed to do. Use this to confirm the active account before acting on someone's data, and when results look like they belong to a different account than expected — for example after reconnecting or switching accounts. Returns identity only, never the credential itself. Available even when AnyDB credentials are not configured, in which case it reports that.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];

export function isIdentityTool(name: string): boolean {
  return name === "anydb_whoami";
}

export interface IdentityInput {
  /** Claims from the verified bearer, when the caller presented one. */
  token?: VerifiedToken;
  /** Present only for legacy API-key auth. */
  apiKey?: string;
  userEmail?: string;
  /** The MCP client this service is acting for, as it named itself. */
  originClient?: string;
  serverName: string;
  serverVersion: string;
  apiBaseUrl: string;
}

export interface IdentityReport {
  authenticated: boolean;
  authMethod: "oauth_bearer" | "api_key" | "none";
  /** AnyDB user id. Only OAuth carries one; an API key resolves server-side. */
  userId?: string;
  email?: string;
  /** OAuth client_id, minted by AnyDB's authorization server. */
  clientId?: string;
  scopes?: string[];
  /** ISO 8601. Absent when the token carries no expiry claim. */
  tokenExpiresAt?: string;
  originClient?: string;
  server: { name: string; version: string; apiBaseUrl: string };
  /** What to do about it, when the answer is "nothing is connected". */
  hint?: string;
}

/**
 * Build the identity report.
 *
 * A bearer wins over an API key, matching how ExtApiClient picks its auth
 * header — reporting the key while the token is what actually authenticates
 * every call would be worse than reporting nothing.
 *
 * Fields the credential does not carry are left out rather than guessed. An
 * API key resolves to a user inside AnyDB and this service never learns which,
 * so `userId` is genuinely unknown here and saying so beats inventing it.
 */
export function describeIdentity(input: IdentityInput): IdentityReport {
  const server = {
    name: input.serverName,
    version: input.serverVersion,
    apiBaseUrl: input.apiBaseUrl,
  };

  if (input.token) {
    return {
      authenticated: true,
      authMethod: "oauth_bearer",
      userId: input.token.subject,
      ...(input.token.email ? { email: input.token.email } : undefined),
      ...(input.token.clientId ? { clientId: input.token.clientId } : undefined),
      scopes: input.token.scopes,
      ...(typeof input.token.expiresAt === "number"
        ? { tokenExpiresAt: new Date(input.token.expiresAt * 1000).toISOString() }
        : undefined),
      ...(input.originClient ? { originClient: input.originClient } : undefined),
      server,
    };
  }

  if (input.apiKey) {
    return {
      authenticated: true,
      authMethod: "api_key",
      ...(input.userEmail ? { email: input.userEmail } : undefined),
      ...(input.originClient ? { originClient: input.originClient } : undefined),
      server,
    };
  }

  return {
    authenticated: false,
    authMethod: "none",
    ...(input.originClient ? { originClient: input.originClient } : undefined),
    server,
    hint: "No AnyDB credential is present. Connect this client over OAuth, or set ANYDB_DEFAULT_API_KEY and ANYDB_DEFAULT_USER_EMAIL in the MCP client environment. Call anydb_get_setup_guide for the full instructions.",
  };
}

export function callIdentityTool(name: string, input: IdentityInput) {
  if (!isIdentityTool(name)) throw new Error(`Unknown identity tool: ${name}`);
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(describeIdentity(input), null, 2),
      },
    ],
  };
}
