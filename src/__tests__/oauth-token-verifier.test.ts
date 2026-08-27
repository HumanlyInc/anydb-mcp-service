import { describe, expect, it, beforeAll } from "@jest/globals";
import { SignJWT, exportJWK, generateKeyPair, type JWK } from "jose";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import {
  TokenVerificationError,
  TokenVerifier,
  extractBearerToken,
} from "../oauth/token-verifier.js";

const ISSUER = "https://as.test.local";
const AUDIENCE = "https://mcp.test.local";

let privateKey: CryptoKey;
let jwksServer: Server;
let jwksUri: string;
let otherPrivateKey: CryptoKey;

/**
 * Serve a real JWKS over HTTP so the verifier exercises its actual remote-key
 * path rather than a stubbed one.
 */
async function startJwksServer(keys: JWK[]): Promise<string> {
  jwksServer = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ keys }));
  });
  await new Promise<void>((resolve) => jwksServer.listen(0, resolve));
  const { port } = jwksServer.address() as AddressInfo;
  return `http://127.0.0.1:${port}/.well-known/jwks.json`;
}

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  const publicJwk = await exportJWK(pair.publicKey);
  publicJwk.kid = "test-key-1";
  publicJwk.alg = "RS256";

  const otherPair = await generateKeyPair("RS256");
  otherPrivateKey = otherPair.privateKey;

  jwksUri = await startJwksServer([publicJwk]);
});

afterAll(async () => {
  await new Promise<void>((resolve) => jwksServer.close(() => resolve()));
});

function makeVerifier() {
  return new TokenVerifier({ jwksUri, issuer: ISSUER, audience: AUDIENCE });
}

async function signToken(
  claims: Record<string, unknown>,
  options?: { key?: CryptoKey; expiresIn?: string },
) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "test-key-1" })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(options?.expiresIn ?? "1h")
    .sign(options?.key ?? privateKey);
}

describe("extractBearerToken", () => {
  it("returns undefined when no header is present", () => {
    expect(extractBearerToken(undefined)).toBeUndefined();
  });

  it("extracts the token regardless of scheme casing", () => {
    expect(extractBearerToken("bearer abc.def.ghi")).toBe("abc.def.ghi");
    expect(extractBearerToken("Bearer  abc.def.ghi")).toBe("abc.def.ghi");
  });

  it("rejects a non-Bearer scheme rather than silently ignoring it", () => {
    expect(() => extractBearerToken("Basic dXNlcjpwYXNz")).toThrow(
      TokenVerificationError,
    );
  });
});

describe("TokenVerifier", () => {
  it("accepts a well-formed token and returns its identity", async () => {
    const token = await signToken({
      sub: "user-123",
      scope: "mcp:read mcp:write",
      email: "jsmith@anydb.com",
      client_id: "mcp_c_1",
      jti: "tok-1",
    });

    const result = await makeVerifier().verify(token);
    expect(result.subject).toBe("user-123");
    expect(result.email).toBe("jsmith@anydb.com");
    expect(result.clientId).toBe("mcp_c_1");
    expect(result.scopes).toEqual(["mcp:read", "mcp:write"]);
    expect(result.tokenId).toBe("tok-1");
  });

  it("rejects a token minted for a different audience", async () => {
    const token = await new SignJWT({ sub: "user-123", scope: "mcp:read" })
      .setProtectedHeader({ alg: "RS256", kid: "test-key-1" })
      .setIssuedAt()
      .setIssuer(ISSUER)
      .setAudience("https://someone-else.example.com")
      .setExpirationTime("1h")
      .sign(privateKey);

    await expect(makeVerifier().verify(token)).rejects.toThrow(
      TokenVerificationError,
    );
  });

  it("rejects a token from a different issuer", async () => {
    const token = await new SignJWT({ sub: "user-123", scope: "mcp:read" })
      .setProtectedHeader({ alg: "RS256", kid: "test-key-1" })
      .setIssuedAt()
      .setIssuer("https://evil.example.com")
      .setAudience(AUDIENCE)
      .setExpirationTime("1h")
      .sign(privateKey);

    await expect(makeVerifier().verify(token)).rejects.toThrow(
      TokenVerificationError,
    );
  });

  it("rejects a token signed by an unknown key", async () => {
    const token = await signToken(
      { sub: "user-123", scope: "mcp:read" },
      { key: otherPrivateKey },
    );
    await expect(makeVerifier().verify(token)).rejects.toThrow(
      TokenVerificationError,
    );
  });

  it("rejects an expired token", async () => {
    const token = await signToken(
      { sub: "user-123", scope: "mcp:read" },
      { expiresIn: "-5m" },
    );
    await expect(makeVerifier().verify(token)).rejects.toThrow(
      TokenVerificationError,
    );
  });

  it("rejects an unsigned token", async () => {
    const unsigned = `${Buffer.from(
      JSON.stringify({ alg: "none", typ: "JWT" }),
    ).toString("base64url")}.${Buffer.from(
      JSON.stringify({ sub: "user-123", aud: AUDIENCE, iss: ISSUER }),
    ).toString("base64url")}.`;

    await expect(makeVerifier().verify(unsigned)).rejects.toThrow(
      TokenVerificationError,
    );
  });

  it("reports insufficient_scope with a 403 when no known scope is present", async () => {
    const token = await signToken({ sub: "user-123", scope: "some:other" });
    await expect(makeVerifier().verify(token)).rejects.toMatchObject({
      code: "insufficient_scope",
      status: 403,
    });
  });

  it("treats a missing scope claim as insufficient rather than full access", async () => {
    const token = await signToken({ sub: "user-123" });
    await expect(makeVerifier().verify(token)).rejects.toMatchObject({
      code: "insufficient_scope",
    });
  });

  it("rejects a token with no subject", async () => {
    const token = await signToken({ scope: "mcp:read" });
    await expect(makeVerifier().verify(token)).rejects.toThrow(
      TokenVerificationError,
    );
  });
});
