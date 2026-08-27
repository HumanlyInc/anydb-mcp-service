import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

/**
 * Verifies OAuth 2.1 access tokens issued by the AnyDB authorization server.
 *
 * The MCP service is a pure resource server: it validates tokens against the
 * AS's published JWKS and never mints them. See docs/token-contract.md for the
 * normative claim set and verification rules.
 */

export interface TokenVerifierOptions {
  jwksUri: string;
  issuer: string;
  /** Canonical resource URI; the audience a token must carry. */
  audience: string;
  /** Seconds of tolerated clock skew. Defaults to 60. */
  clockToleranceSec?: number;
}

export interface VerifiedToken {
  subject: string;
  email?: string;
  clientId?: string;
  scopes: string[];
  tokenId?: string;
  expiresAt?: number;
}

export const KNOWN_SCOPES = ["mcp:read", "mcp:write", "mcp:author"] as const;

/**
 * Thrown when a token is present but unusable. `status` distinguishes an
 * unusable credential (401) from a usable one lacking authority (403), which
 * the caller turns into the matching WWW-Authenticate challenge.
 */
export class TokenVerificationError extends Error {
  constructor(
    message: string,
    readonly code: "invalid_token" | "insufficient_scope",
    readonly status: 401 | 403 = 401,
  ) {
    super(message);
    this.name = "TokenVerificationError";
  }
}

function parseScopes(payload: JWTPayload): string[] {
  const raw = (payload as { scope?: unknown }).scope;
  if (typeof raw !== "string") return [];
  return raw.split(/\s+/).filter(Boolean);
}

export class TokenVerifier {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly clockTolerance: number;

  constructor(private readonly options: TokenVerifierOptions) {
    this.clockTolerance = options.clockToleranceSec ?? 60;
    // createRemoteJWKSet caches keys and coalesces refetches on an unknown
    // `kid`, with a cooldown — an unknown-kid flood cannot become a DoS
    // amplifier against the authorization server.
    this.jwks = createRemoteJWKSet(new URL(options.jwksUri), {
      cooldownDuration: 30_000,
      cacheMaxAge: 10 * 60_000,
    });
  }

  /**
   * Verify a bearer token and return the identity it carries.
   *
   * Signature algorithm is pinned to RS256: without pinning, a token could
   * assert `alg: none` or an HMAC algorithm and be verified against the public
   * key as if it were a shared secret.
   */
  async verify(token: string): Promise<VerifiedToken> {
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, this.jwks, {
        algorithms: ["RS256"],
        issuer: this.options.issuer,
        audience: this.options.audience,
        clockTolerance: this.clockTolerance,
      }));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new TokenVerificationError(reason, "invalid_token");
    }

    if (typeof payload.sub !== "string" || !payload.sub) {
      throw new TokenVerificationError(
        "Token is missing a subject claim",
        "invalid_token",
      );
    }

    const scopes = parseScopes(payload);
    if (!scopes.some((scope) => KNOWN_SCOPES.includes(scope as never))) {
      throw new TokenVerificationError(
        `Token carries no recognized scope. Expected at least one of: ${KNOWN_SCOPES.join(", ")}`,
        "insufficient_scope",
        403,
      );
    }

    const email = (payload as { email?: unknown }).email;
    const clientId = (payload as { client_id?: unknown }).client_id;

    return {
      subject: payload.sub,
      email: typeof email === "string" ? email : undefined,
      clientId: typeof clientId === "string" ? clientId : undefined,
      scopes,
      tokenId: typeof payload.jti === "string" ? payload.jti : undefined,
      expiresAt: payload.exp,
    };
  }
}

/**
 * Extract a bearer token from an Authorization header.
 *
 * Returns undefined when the header is absent, and throws when it is present
 * but malformed — a client sending a broken Authorization header should be
 * told so, not silently downgraded to unauthenticated.
 */
export function extractBearerToken(
  header: string | undefined,
): string | undefined {
  if (!header) return undefined;
  const match = /^Bearer[ ]+(.+)$/i.exec(header.trim());
  if (!match) {
    throw new TokenVerificationError(
      "Authorization header must use the Bearer scheme",
      "invalid_token",
    );
  }
  return match[1].trim();
}
