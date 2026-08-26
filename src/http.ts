#!/usr/bin/env node

import "dotenv/config";

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

app.all("/", async (req, res) => {
  // New connection
  const apiKey = req.headers["x-anydb-api-key"] as string | undefined;
  const userEmail = req.headers["x-anydb-email"] as string | undefined;

  if (!apiKey || !userEmail) {
    res.status(401).json({
      error: "Missing AnyDB credentials",
    });

    return;
  }

  const server = createMcpServer({
    apiKey,
    userEmail,
  });

  const transport = new StreamableHTTPServerTransport();
  await server.connect(transport);

  await transport.handleRequest(req, res, req.body);
});

app.listen(PORT, () => {
  console.log(`AnyDB MCP HTTP transport running on http://localhost:${PORT}`);
});
