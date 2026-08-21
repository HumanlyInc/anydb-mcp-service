#!/usr/bin/env node

import "dotenv/config";

/**
 * AnyDB MCP Server
 */

import express from "express";
import cors from "cors";
import { createMcpServer } from "./mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Start server
const PORT = process.env.REST_API_PORT || 3001;

app.all("/mcp", async (req, res) => {
  // New connection
  const apiKey = req.headers["x-anydb-api-key"] as string | undefined;
  const email = req.headers["x-anydb-email"] as string | undefined;

  if (!apiKey || !email) {
    res.status(401).json({
      error: "Missing AnyDB credentials",
    });

    return;
  }

  const server = createMcpServer({
    apiKey,
    email,
  });

  const transport = new StreamableHTTPServerTransport();
  await server.connect(transport);

  await transport.handleRequest(req, res, req.body);
});

app.listen(PORT, () => {
  console.log(`AnyDB MCP Server running on http://localhost:${PORT}`);
});
