#!/usr/bin/env node

/**
 * AnyDB REST API Server
 * Provides REST endpoints for ChatGPT Custom GPT integration
 */

import express, { Request, Response } from "express";
import cors from "cors";
import { AnyDBClient } from "./anydb-client.js";

const app = express();
const anydbClient = new AnyDBClient();

// Middleware
app.use(cors());
app.use(express.json());

/**
 * Extract AnyDB API key from request headers
 * Supports multi-tenant authentication
 */
function extractApiKey(req: Request): string | undefined {
  // Check custom header first
  const customHeader = req.headers["x-anydb-api-key"] as string | undefined;
  if (customHeader) return customHeader;

  // Check Authorization header (Bearer token)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.replace("Bearer ", "");
  }

  return undefined;
}

/**
 * Extract user email from request headers
 * Required for user identification
 */
function extractUserEmail(req: Request): string | undefined {
  return req.headers["x-anydb-email"] as string | undefined;
}

// Optional: API Key authentication for REST API itself (ChatGPT)
const CHATGPT_API_KEY = process.env.CHATGPT_API_KEY || "";

const authenticate = (req: Request, res: Response, next: Function) => {
  // This authenticates access to the REST API itself (not AnyDB)
  // For ChatGPT Custom GPT integration
  if (CHATGPT_API_KEY) {
    const providedKey = req.headers["x-rest-api-key"] as string;
    if (providedKey !== CHATGPT_API_KEY) {
      return res
        .status(401)
        .json({ error: "Unauthorized - Invalid REST API key" });
    }
  }
  next();
};

app.use(authenticate);

// ============================================================================
// AnyDB Record Operations
// ============================================================================

// Get a specific record
app.get(
  "/integrations/ext/record",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const { teamid, adbid, adoid } = req.query;
      if (!teamid || !adbid || !adoid) {
        return res.status(400).json({
          success: false,
          error: "teamid, adbid, and adoid are required",
        });
      }
      const apiKey = extractApiKey(req);
      const userEmail = extractUserEmail(req);
      const record = await anydbClient.getRecord(
        teamid as string,
        adbid as string,
        adoid as string,
        apiKey,
        userEmail
      );
      res.json({ success: true, data: record });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

// List teams
app.get(
  "/integrations/ext/listteams",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const apiKey = extractApiKey(req);
      const userEmail = extractUserEmail(req);
      const teams = await anydbClient.listTeams(apiKey, userEmail);
      res.json({ success: true, data: teams });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

// List databases for a team
app.get(
  "/integrations/ext/listdbsforteam",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const { teamid } = req.query;
      if (!teamid) {
        return res.status(400).json({
          success: false,
          error: "teamid is required",
        });
      }
      const apiKey = extractApiKey(req);
      const userEmail = extractUserEmail(req);
      const databases = await anydbClient.listDatabasesForTeam(
        teamid as string,
        apiKey,
        userEmail
      );
      res.json({ success: true, data: databases });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

// List records in a database
app.get(
  "/integrations/ext/list",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const { teamid, adbid, parentid } = req.query;
      if (!teamid || !adbid) {
        return res.status(400).json({
          success: false,
          error: "teamid and adbid are required",
        });
      }
      const apiKey = extractApiKey(req);
      const userEmail = extractUserEmail(req);
      const records = await anydbClient.listRecords(
        teamid as string,
        adbid as string,
        parentid as string | undefined,
        apiKey,
        userEmail
      );
      res.json({ success: true, data: records });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

// Create a new record
app.post(
  "/integrations/ext/createrecord",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const { adbid, teamid, name, attach, template, content } = req.body;
      if (!adbid || !teamid || !name) {
        return res.status(400).json({
          success: false,
          error: "adbid, teamid, and name are required",
        });
      }
      const params = { adbid, teamid, name, attach, template, content };
      const apiKey = extractApiKey(req);
      const userEmail = extractUserEmail(req);
      const record = await anydbClient.createRecord(params, apiKey, userEmail);
      res.json({ success: true, data: record });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

// Update a record
app.put(
  "/integrations/ext/updaterecord",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const { meta, content } = req.body;
      if (!meta || !meta.adoid || !meta.adbid || !meta.teamid) {
        return res.status(400).json({
          success: false,
          error: "meta with adoid, adbid, and teamid are required",
        });
      }
      const params = { meta, content };
      const apiKey = extractApiKey(req);
      const userEmail = extractUserEmail(req);
      const record = await anydbClient.updateRecord(params, apiKey, userEmail);
      res.json({ success: true, data: record });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

// Search records
app.get(
  "/integrations/ext/search",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const { adbid, teamid, parentid, search, start, limit } = req.query;
      if (!adbid || !teamid || !search) {
        return res.status(400).json({
          success: false,
          error: "adbid, teamid, and search are required",
        });
      }
      const params = {
        adbid: adbid as string,
        teamid: teamid as string,
        search: search as string,
        parentid: parentid as string | undefined,
        start: start as string | undefined,
        limit: limit as string | undefined,
      };
      const apiKey = extractApiKey(req);
      const userEmail = extractUserEmail(req);
      const results = await anydbClient.searchRecords(
        params,
        apiKey,
        userEmail
      );
      res.json({ success: true, data: results });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

// Download file from record cell
app.get(
  "/integrations/ext/download",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const { teamid, adbid, adoid, cellpos, redirect, preview } = req.query;
      if (!teamid || !adbid || !adoid || !cellpos) {
        return res.status(400).json({
          success: false,
          error: "teamid, adbid, adoid, and cellpos are required",
        });
      }
      const params = {
        teamid: teamid as string,
        adbid: adbid as string,
        adoid: adoid as string,
        cellpos: cellpos as string,
        redirect: redirect === "true" || redirect === "1",
        preview: preview === "true" || preview === "1",
      };
      const apiKey = extractApiKey(req);
      const userEmail = extractUserEmail(req);
      const result = await anydbClient.downloadFile(params, apiKey, userEmail);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

// Get upload URL (Step 1 of upload process)
app.get(
  "/integrations/ext/getuploadurl",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const { filename, teamid, adbid, adoid, filesize, cellpos } = req.query;
      if (!filename || !teamid || !adbid || !adoid || !filesize) {
        return res.status(400).json({
          success: false,
          error: "filename, teamid, adbid, adoid, and filesize are required",
        });
      }
      const params = {
        filename: filename as string,
        teamid: teamid as string,
        adbid: adbid as string,
        adoid: adoid as string,
        filesize: filesize as string,
        cellpos: cellpos as string | undefined,
      };
      const apiKey = extractApiKey(req);
      const userEmail = extractUserEmail(req);
      const result = await anydbClient.getUploadUrl(params, apiKey, userEmail);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

// Upload file to URL (Step 2 - typically handled client-side, but included for completeness)
app.put(
  "/integrations/ext/uploadtourl",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const { uploadUrl, fileContent, contentType } = req.body;
      if (!uploadUrl || !fileContent) {
        return res.status(400).json({
          success: false,
          error: "uploadUrl and fileContent are required",
        });
      }

      // Convert base64 string to Buffer if needed
      let content: Buffer | string = fileContent;
      try {
        content = Buffer.from(fileContent, "base64");
      } catch (error) {
        content = fileContent;
      }

      await anydbClient.uploadFileToUrl(uploadUrl, content, contentType);
      res.json({ success: true, message: "File uploaded successfully" });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

// Complete upload (Step 3 of upload process)
app.put(
  "/integrations/ext/completeupload",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const { filesize, teamid, adbid, adoid, cellpos } = req.body;
      if (!filesize || !teamid || !adbid) {
        return res.status(400).json({
          success: false,
          error: "filesize, teamid, and adbid are required",
        });
      }
      const params = {
        filesize: filesize as string,
        teamid: teamid as string,
        adbid: adbid as string,
        adoid: adoid as string | undefined,
        cellpos: cellpos as string | undefined,
      };
      const apiKey = extractApiKey(req);
      const userEmail = extractUserEmail(req);
      const result = await anydbClient.completeUpload(
        params,
        apiKey,
        userEmail
      );
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

// OpenAPI specification endpoint
app.get("/openapi.json", (req: Request, res: Response) => {
  const { openApiSpec } = require("./openapi-spec.js");
  res.json(openApiSpec);
});

// Start server
const PORT = process.env.REST_API_PORT || 3001;

if (import.meta.url === `file://${process.argv[1]}`) {
  app.listen(PORT, () => {
    console.log(`AnyDB REST API server running on http://localhost:${PORT}`);
    console.log(
      `OpenAPI spec available at http://localhost:${PORT}/openapi.json`
    );
  });
}

export default app;
