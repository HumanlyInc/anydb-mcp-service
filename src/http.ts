#!/usr/bin/env node

import "dotenv/config";

import express, { type Request, type Response } from "express";
import cors from "cors";
import { config } from "./config.js";
import { createMcpServer } from "./mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  buildAuthenticateHeader,
  protectedResourceMetadata,
} from "./oauth/metadata.js";
import {
  TokenVerificationError,
  TokenVerifier,
  extractBearerToken,
  type VerifiedToken,
} from "./oauth/token-verifier.js";

/**
 * Streamable HTTP transport for the AnyDB MCP server.
 *
 * Stateless: every request builds its own MCP server and transport, so no
 * session state is carried between requests and any instance can serve any
 * request. Accepts either an OAuth 2.1 bearer token or the legacy API-key
 * headers. See docs/token-contract.md.
 */

const app = express();
app.disable("x-powered-by");

// CORS only when origins are configured. Non-browser clients (ChatGPT,
// Claude, Cursor) never send Origin, so the default of no CORS headers is
// correct and avoids the wildcard that would otherwise let any page drive
// this endpoint.
if (config.http.allowedOrigins.length > 0) {
  app.use(
    cors({
      origin: config.http.allowedOrigins,
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "Accept",
        "Mcp-Session-Id",
        "MCP-Protocol-Version",
        "x-anydb-api-key",
        "x-anydb-email",
      ],
      exposedHeaders: ["Mcp-Session-Id", "WWW-Authenticate"],
      maxAge: 600,
    }),
  );
}

app.use(express.json({ limit: "4mb" }));

const verifier = config.oauth.enabled
  ? new TokenVerifier({
      jwksUri: config.oauth.jwksUri,
      issuer: config.oauth.issuer,
      audience: config.oauth.resourceUri,
    })
  : undefined;

/** Credentials resolved from one request, ready to hand to the ext client. */
interface RequestCredentials {
  apiKey?: string;
  userEmail?: string;
  accessToken?: string;
  token?: VerifiedToken;
}

function sendUnauthorized(
  res: Response,
  message: string,
  options?: {
    status?: 401 | 403;
    error?: "invalid_token" | "insufficient_scope";
    scope?: string;
  },
) {
  const status = options?.status ?? 401;
  res
    .status(status)
    .set(
      "WWW-Authenticate",
      buildAuthenticateHeader({
        error: options?.error,
        description: message,
        scope: options?.scope,
      }),
    )
    .json({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32001, message: `Unauthorized: ${message}` },
    });
}

/**
 * Resolve credentials for a request, preferring a bearer token so that an
 * OAuth session never silently falls back to differently-scoped API keys.
 * Responds and returns undefined when the request cannot be authenticated.
 */
async function authenticate(
  req: Request,
  res: Response,
): Promise<RequestCredentials | undefined> {
  let bearer: string | undefined;
  try {
    bearer = extractBearerToken(req.headers.authorization);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Malformed Authorization header";
    sendUnauthorized(res, message, { error: "invalid_token" });
    return undefined;
  }

  if (bearer) {
    if (!verifier) {
      sendUnauthorized(res, "Bearer authentication is not enabled", {
        error: "invalid_token",
      });
      return undefined;
    }
    try {
      const token = await verifier.verify(bearer);
      return { accessToken: bearer, token };
    } catch (error) {
      if (error instanceof TokenVerificationError) {
        sendUnauthorized(res, error.message, {
          status: error.status,
          error: error.code,
          scope:
            error.code === "insufficient_scope" ? "mcp:read" : undefined,
        });
        return undefined;
      }
      sendUnauthorized(res, "Token verification failed", {
        error: "invalid_token",
      });
      return undefined;
    }
  }

  const apiKey = req.headers["x-anydb-api-key"] as string | undefined;
  const userEmail = req.headers["x-anydb-email"] as string | undefined;
  if (apiKey && userEmail) {
    return { apiKey, userEmail };
  }

  sendUnauthorized(
    res,
    "Provide an OAuth bearer token, or x-anydb-api-key with x-anydb-email",
  );
  return undefined;
}

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: config.serverName,
    version: config.serverVersion,
  });
});

// RFC 9728 discovery. Unauthenticated by design: clients read it precisely
// because they do not yet hold a credential.
app.get("/.well-known/oauth-protected-resource", (_req, res) => {
  res.json(protectedResourceMetadata());
});

// The spec also allows the document to be probed with the resource path
// appended, which is how some clients discover a server mounted at a subpath.
app.get("/.well-known/oauth-protected-resource/*", (_req, res) => {
  res.json(protectedResourceMetadata());
});

app.post("/", async (req, res) => {
  const credentials = await authenticate(req, res);
  if (!credentials) return;

  const server = createMcpServer({
    apiKey: credentials.apiKey,
    userEmail: credentials.userEmail,
    accessToken: credentials.accessToken,
  });

  // Stateless: no session id is issued, and nothing is retained between
  // requests.
  const transport = new StreamableHTTPServerTransport();

  // Both are per-request and must be released when the response ends, or each
  // request leaks a server, a transport, and their listeners.
  res.on("close", () => {
    void transport.close().catch(() => {});
    void server.close().catch(() => {});
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("[MCP HTTP] Request failed:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32603, message: "Internal server error" },
      });
    }
  }
});

// In stateless mode there is no standalone SSE stream to open and no session
// to delete. Answering anything else here would hold a connection and a server
// open for the life of the request.
app.all("/", (_req, res) => {
  res.set("Allow", "POST").status(405).json({
    jsonrpc: "2.0",
    id: null,
    error: {
      code: -32000,
      message: "Method not allowed. This endpoint accepts POST only.",
    },
  });
});

const server = app.listen(config.http.port, config.http.host, () => {
  console.error(
    `AnyDB MCP HTTP transport ${config.serverVersion} listening on http://${config.http.host}:${config.http.port}`,
  );
  console.error(
    `  auth: ${config.oauth.enabled ? `bearer (aud ${config.oauth.resourceUri}) + API key` : "API key only"}`,
  );
  console.error(
    `  cors: ${
      config.http.allowedOrigins.length > 0
        ? config.http.allowedOrigins.join(", ")
        : "disabled"
    }`,
  );
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
