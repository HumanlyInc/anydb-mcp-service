#!/usr/bin/env node

/**
 * AnyDB MCP Server
 * Provides MCP tools for AI agents to create and manage AnyDB templates
 *
 * =============================================================================
 * IMPORTANT: Understanding AnyDB Terminology
 * =============================================================================
 *
 * - **teamid**: MongoDB ObjectId identifying a team/organization. Each team is
 *   a separate workspace with its own databases and users. Use list_teams to
 *   discover available teams.
 *
 * - **adbid**: MongoDB ObjectId for an ADB (AnyDB Database). Each team can have
 *   multiple databases. Think of it like a spreadsheet file or a table. Use
 *   list_databases_for_team to find databases within a team.
 *
 * - **adoid**: MongoDB ObjectId for an ADO (AnyDB Object/Record). This is a
 *   single row/record within a database, similar to a row in a spreadsheet.
 *
 * - **cellpos**: Cell position identifier (e.g., "A1", "B2"). Each record has
 *   cells organized in a grid. Cells contain typed data like text, numbers,
 *   dates, files, formulas, etc. The cellpos identifies which cell in the record
 *   contains the data you want to access.
 *
 * =============================================================================
 * Working with Records and Cells
 * =============================================================================
 *
 * Records in AnyDB work like spreadsheet rows with typed cells:
 * - Each cell has a position (A1, B2, etc.) and a type (text, number, date, file, etc.)
 * - Use get_record to fetch a complete record with all its cell data
 * - Cell types include: text, number, date, checkbox, dropdown, file, formula,
 *   relation, and many more
 * - Files are stored in cells and accessed using cellpos (e.g., "C5" might contain a PDF)
 *
 * =============================================================================
 * File Download Workflow
 * =============================================================================
 *
 * When using download_file:
 * 1. The tool returns a JSON response with a "url" field containing the download link
 * 2. **Important**: The MCP client/host must handle this URL appropriately:
 *    - For human users: Create a clickable download button/link in the UI
 *    - For LLM processing: Fetch the file content from the URL and pass it to the LLM
 * 3. The URL may be temporary (pre-signed), so use it promptly
 * 4. Use redirect=true for direct browser downloads, redirect=false for API access
 * 5. Use preview=true to display the file inline instead of downloading
 *
 * Example response: {"url": "https://storage.../file.pdf", "redirect": false}
 *
 * =============================================================================
 * File Upload Workflow (3-Step Process)
 * =============================================================================
 *
 * Uploading files requires 3 sequential steps:
 *
 * Step 1: get_upload_url
 *   - Request a pre-signed URL to upload the file
 *   - Provide: filename, teamid, adbid, adoid, filesize, optional cellpos
 *   - Returns: {url: "https://storage.../upload", ...}
 *
 * Step 2: upload_file_to_url
 *   - Upload the actual file content to the URL from step 1
 *   - Provide: uploadUrl, fileContent (base64 or text), optional contentType
 *   - This uploads directly to cloud storage (S3, etc.)
 *
 * Step 3: complete_upload
 *   - Notify AnyDB that the upload is complete
 *   - Provide: filesize, teamid, adbid, optional adoid, optional cellpos
 *   - AnyDB processes and attaches the file to the record
 *
 * All 3 steps must complete successfully for the upload to work.
 *
 * =============================================================================
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { AnyDBClient } from "./anydb-client.js";
import { config } from "./config.js";
import { schemaReader } from "./schema-reader.js";
import type { TemplateStructure } from "./types.js";

// Initialize AnyDB client
const anydbClient = new AnyDBClient();

// Common authentication parameters for all tools (multi-tenant support)
const AUTH_PARAMS = {
  apiKey: {
    type: "string",
    description:
      "Your AnyDB API key for authentication. Required for multi-tenant access to your team's data.",
  },
  userEmail: {
    type: "string",
    description:
      "Your email address associated with the API key. Required for user identification.",
  },
};

// Define available tools
const TOOLS: Tool[] = [
  {
    name: "get_record",
    description:
      "Get a specific AnyDB record by its fully qualified address (teamid, adbid, adoid).",
    inputSchema: {
      type: "object",
      properties: {
        ...AUTH_PARAMS,
        teamid: {
          type: "string",
          description: "The team ID (MongoDB ObjectId)",
        },
        adbid: {
          type: "string",
          description: "The database ID (MongoDB ObjectId)",
        },
        adoid: {
          type: "string",
          description: "The record ID (MongoDB ObjectId)",
        },
      },
      required: ["teamid", "adbid", "adoid", "apiKey", "userEmail"],
    },
  },
  {
    name: "list_teams",
    description:
      "List all teams that the provided API key has access to. A team is like an organization or workspace with its own databases and users. Use this first to discover available teamid values for other operations.",
    inputSchema: {
      type: "object",
      properties: {
        ...AUTH_PARAMS,
      },
      required: ["apiKey", "userEmail", "userEmail"],
    },
  },
  {
    name: "list_databases_for_team",
    description:
      "Get all ADBs (databases) for a specific team. An ADB is like a spreadsheet file or a database table containing records. Use this to discover available adbid values within a team.",
    inputSchema: {
      type: "object",
      properties: {
        ...AUTH_PARAMS,
        teamid: {
          type: "string",
          description: "The team ID (MongoDB ObjectId). Get from list_teams.",
        },
      },
      required: ["teamid", "apiKey", "userEmail"],
    },
  },
  {
    name: "list_records",
    description:
      "List all ADOs (records) in a database. Optionally filter by parent record ID to get child records.",
    inputSchema: {
      type: "object",
      properties: {
        ...AUTH_PARAMS,
        teamid: {
          type: "string",
          description: "The team ID (MongoDB ObjectId)",
        },
        adbid: {
          type: "string",
          description: "The database ID (MongoDB ObjectId)",
        },
        parentid: {
          type: "string",
          description:
            "Optional parent record ID to filter child records (MongoDB ObjectId)",
        },
      },
      required: ["teamid", "adbid", "apiKey", "userEmail"],
    },
  },
  {
    name: "create_record",
    description:
      "Create a new AnyDB record in a specific database. You can optionally attach it to a parent record or use a template.",
    inputSchema: {
      type: "object",
      properties: {
        ...AUTH_PARAMS,
        adbid: {
          type: "string",
          description:
            "The database ID where the record will be created (MongoDB ObjectId)",
        },
        teamid: {
          type: "string",
          description: "The team ID (MongoDB ObjectId)",
        },
        name: {
          type: "string",
          description: "The name of the record",
        },
        attach: {
          type: "string",
          description:
            "Optional parent record ID to attach this record to (MongoDB ObjectId)",
        },
        template: {
          type: "string",
          description:
            "Optional template ID to use for creating the record (MongoDB ObjectId)",
        },
        content: {
          type: "object",
          description: "Optional content data for the record (key-value pairs)",
        },
      },
      required: ["adbid", "teamid", "name", "apiKey", "userEmail"],
    },
  },
  {
    name: "update_record",
    description: "Update an existing AnyDB record's metadata and content.",
    inputSchema: {
      type: "object",
      properties: {
        ...AUTH_PARAMS,
        meta: {
          type: "object",
          description:
            "Record metadata including adoid, adbid, teamid, and optional fields like name, description, status, etc.",
          properties: {
            adoid: {
              type: "string",
              description: "The record ID (MongoDB ObjectId)",
            },
            adbid: {
              type: "string",
              description: "The database ID (MongoDB ObjectId)",
            },
            teamid: {
              type: "string",
              description: "The team ID (MongoDB ObjectId)",
            },
            name: {
              type: "string",
              description: "Optional new name for the record",
            },
            description: {
              type: "string",
              description: "Optional description",
            },
            icon: {
              type: "string",
              description: "Optional icon",
            },
            followup: {
              type: "number",
              description: "Optional followup timestamp",
            },
            locked: {
              type: "boolean",
              description: "Optional locked status",
            },
            status: {
              type: "string",
              description: "Optional status",
            },
            assignees: {
              type: "object",
              description: "Optional assignees",
              properties: {
                users: {
                  type: "array",
                  items: { type: "string" },
                  description: "Array of user IDs",
                },
                groups: {
                  type: "array",
                  items: { type: "string" },
                  description: "Array of group IDs",
                },
              },
            },
          },
          required: ["adoid", "adbid", "teamid"],
        },
        content: {
          type: "object",
          description: "Optional content updates (key-value pairs)",
        },
      },
      required: ["meta", "apiKey", "userEmail"],
    },
  },
  {
    name: "search_records",
    description:
      "Search for records in a database using a keyword. Optionally filter by parent record and specify pagination.",
    inputSchema: {
      type: "object",
      properties: {
        ...AUTH_PARAMS,
        adbid: {
          type: "string",
          description: "The database ID to search in (MongoDB ObjectId)",
        },
        teamid: {
          type: "string",
          description: "The team ID (MongoDB ObjectId)",
        },
        search: {
          type: "string",
          description: "The search keyword",
        },
        parentid: {
          type: "string",
          description:
            "Optional parent record ID to filter results (MongoDB ObjectId)",
        },
        start: {
          type: "string",
          description: "Optional start offset for pagination",
        },
        limit: {
          type: "string",
          description: "Optional limit for number of results",
        },
      },
      required: ["adbid", "teamid", "search", "apiKey", "userEmail"],
    },
  },
  {
    name: "download_file",
    description:
      "Download a file or get download URL from a record cell. Returns JSON with a 'url' field containing the file download link. IMPORTANT: The MCP client/host must handle this URL appropriately: (1) For human users, create a clickable download button/link in the UI. (2) For LLM processing, fetch the file content from the URL and provide it to the LLM. The URL may be temporary/pre-signed, so use it promptly. First use get_record to see which cells contain files and their cellpos values (e.g., A1, B5, etc.).",
    inputSchema: {
      type: "object",
      properties: {
        ...AUTH_PARAMS,
        teamid: {
          type: "string",
          description: "The team ID (MongoDB ObjectId). Get from list_teams.",
        },
        adbid: {
          type: "string",
          description:
            "The database ID (MongoDB ObjectId). Get from list_databases_for_team.",
        },
        adoid: {
          type: "string",
          description:
            "The record ID (MongoDB ObjectId). Get from list_records or search_records.",
        },
        cellpos: {
          type: "string",
          description:
            "The cell position where the file is stored (e.g., 'A1', 'B2', 'C5'). Use get_record first to see cell layout and find file cells.",
        },
        redirect: {
          type: "boolean",
          description:
            "If true, returns a redirect URL for direct browser download. If false (default), returns JSON with URL for API access.",
        },
        preview: {
          type: "boolean",
          description:
            "If true, returns a preview URL to display the file inline instead of downloading it.",
        },
      },
      required: ["teamid", "adbid", "adoid", "cellpos", "apiKey", "userEmail"],
    },
  },
  {
    name: "get_upload_url",
    description:
      "Step 1 of 3: Request a pre-signed URL from AnyDB to upload a file. This is the first step in the 3-step upload process. Returns JSON with a 'url' field where you'll upload the file in step 2. Must be followed by upload_file_to_url and complete_upload.",
    inputSchema: {
      type: "object",
      properties: {
        ...AUTH_PARAMS,
        filename: {
          type: "string",
          description:
            "The name of the file to upload (e.g., 'document.pdf', 'image.png')",
        },
        teamid: {
          type: "string",
          description: "The team ID (MongoDB ObjectId). Get from list_teams.",
        },
        adbid: {
          type: "string",
          description:
            "The database ID (MongoDB ObjectId). Get from list_databases_for_team.",
        },
        adoid: {
          type: "string",
          description:
            "The record ID (MongoDB ObjectId) where the file will be attached. Get from list_records or create with create_record.",
        },
        filesize: {
          type: "string",
          description:
            "The size of the file in bytes (as string, e.g., '1024' for 1KB)",
        },
        cellpos: {
          type: "string",
          description:
            "Optional cell position where the file will be stored (e.g., 'A1', 'B2'). If omitted, AnyDB assigns a position.",
        },
      },
      required: [
        "filename",
        "teamid",
        "adbid",
        "adoid",
        "filesize",
        "apiKey",
        "userEmail",
      ],
    },
  },
  {
    name: "upload_file_to_url",
    description:
      "Step 2 of 3: Upload file content to a pre-signed URL. This is the second step in the 3-step upload process. Use the URL from get_upload_url (step 1). This uploads directly to cloud storage (S3, etc.). After this succeeds, you MUST call complete_upload (step 3) to finalize the upload.",
    inputSchema: {
      type: "object",
      properties: {
        uploadUrl: {
          type: "string",
          description:
            "The pre-signed URL obtained from get_upload_url (step 1)",
        },
        fileContent: {
          type: "string",
          description:
            "The file content as a base64-encoded string (preferred) or plain text for text files",
        },
        contentType: {
          type: "string",
          description:
            "The MIME type of the file (e.g., 'image/png', 'application/pdf', 'text/plain'). Important for proper file handling.",
        },
      },
      required: ["uploadUrl", "fileContent"],
    },
  },
  {
    name: "complete_upload",
    description:
      "Step 3 of 3: Notify AnyDB that the file has been uploaded. This is the final step in the 3-step upload process. Call this ONLY after successfully uploading the file with upload_file_to_url (step 2). This tells AnyDB to process and attach the file to the record. Use the same parameters as step 1 (get_upload_url).",
    inputSchema: {
      type: "object",
      properties: {
        ...AUTH_PARAMS,
        filesize: {
          type: "string",
          description:
            "The size of the uploaded file in bytes (must match step 1)",
        },
        teamid: {
          type: "string",
          description: "The team ID (must match step 1)",
        },
        adbid: {
          type: "string",
          description: "The database ID (must match step 1)",
        },
        adoid: {
          type: "string",
          description:
            "The record ID (optional, must match step 1 if provided)",
        },
        cellpos: {
          type: "string",
          description:
            "The cell position (optional, must match step 1 if provided)",
        },
      },
      required: ["filesize", "teamid", "adbid", "apiKey", "userEmail"],
    },
  },
];

// Create MCP server
const server = new Server(
  {
    name: config.serverName,
    version: config.serverVersion,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle list tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // Log incoming MCP request
  console.error(`\n========== MCP Tool Request ==========`);
  console.error(`Tool: ${name}`);
  console.error(`Arguments:`, JSON.stringify(args, null, 2));
  console.error(`======================================\n`);

  try {
    switch (name) {
      case "get_record": {
        const teamid = args?.teamid as string;
        const adbid = args?.adbid as string;
        const adoid = args?.adoid as string;
        if (!teamid || !adbid || !adoid) {
          throw new Error("teamid, adbid, and adoid are required");
        }
        const apiKey = args?.apiKey as string | undefined;
        const userEmail = args?.userEmail as string | undefined;
        const record = await anydbClient.getRecord(
          teamid,
          adbid,
          adoid,
          apiKey,
          userEmail
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(record, null, 2),
            },
          ],
        };
      }

      case "list_teams": {
        const apiKey = args?.apiKey as string | undefined;
        const userEmail = args?.userEmail as string | undefined;
        const teams = await anydbClient.listTeams(apiKey, userEmail);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(teams, null, 2),
            },
          ],
        };
      }

      case "list_databases_for_team": {
        const teamid = args?.teamid as string;
        if (!teamid) {
          throw new Error("teamid is required");
        }
        const apiKey = args?.apiKey as string | undefined;
        const userEmail = args?.userEmail as string | undefined;
        const databases = await anydbClient.listDatabasesForTeam(
          teamid,
          apiKey,
          userEmail
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(databases, null, 2),
            },
          ],
        };
      }

      case "list_records": {
        const teamid = args?.teamid as string;
        const adbid = args?.adbid as string;
        if (!teamid || !adbid) {
          throw new Error("teamid and adbid are required");
        }
        const parentid = args?.parentid as string | undefined;
        const apiKey = args?.apiKey as string | undefined;
        const userEmail = args?.userEmail as string | undefined;
        const records = await anydbClient.listRecords(
          teamid,
          adbid,
          parentid,
          apiKey,
          userEmail
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(records, null, 2),
            },
          ],
        };
      }

      case "create_record": {
        const adbid = args?.adbid as string;
        const teamid = args?.teamid as string;
        const name = args?.name as string;
        if (!adbid || !teamid || !name) {
          throw new Error("adbid, teamid, and name are required");
        }
        const params = {
          adbid,
          teamid,
          name,
          attach: args?.attach as string | undefined,
          template: args?.template as string | undefined,
          content: args?.content as Record<string, any> | undefined,
        };
        const apiKey = args?.apiKey as string | undefined;
        const userEmail = args?.userEmail as string | undefined;
        const record = await anydbClient.createRecord(
          params,
          apiKey,
          userEmail
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(record, null, 2),
            },
          ],
        };
      }

      case "update_record": {
        const meta = args?.meta as any;
        if (!meta || !meta.adoid || !meta.adbid || !meta.teamid) {
          throw new Error("meta with adoid, adbid, and teamid are required");
        }
        const params = {
          meta,
          content: args?.content as Record<string, any> | undefined,
        };
        const apiKey = args?.apiKey as string | undefined;
        const userEmail = args?.userEmail as string | undefined;
        const record = await anydbClient.updateRecord(
          params,
          apiKey,
          userEmail
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(record, null, 2),
            },
          ],
        };
      }

      case "search_records": {
        const adbid = args?.adbid as string;
        const teamid = args?.teamid as string;
        const search = args?.search as string;
        if (!adbid || !teamid || !search) {
          throw new Error("adbid, teamid, and search are required");
        }
        const params = {
          adbid,
          teamid,
          search,
          parentid: args?.parentid as string | undefined,
          start: args?.start as string | undefined,
          limit: args?.limit as string | undefined,
        };
        const apiKey = args?.apiKey as string | undefined;
        const userEmail = args?.userEmail as string | undefined;
        const results = await anydbClient.searchRecords(
          params,
          apiKey,
          userEmail
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      }

      case "download_file": {
        const teamid = args?.teamid as string;
        const adbid = args?.adbid as string;
        const adoid = args?.adoid as string;
        const cellpos = args?.cellpos as string;
        if (!teamid || !adbid || !adoid || !cellpos) {
          throw new Error("teamid, adbid, adoid, and cellpos are required");
        }
        const redirect = args?.redirect as boolean | undefined;
        const preview = args?.preview as boolean | undefined;
        const apiKey = args?.apiKey as string | undefined;
        const userEmail = args?.userEmail as string | undefined;
        const result = await anydbClient.downloadFile(
          { teamid, adbid, adoid, cellpos, redirect, preview },
          apiKey,
          userEmail
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "get_upload_url": {
        const filename = args?.filename as string;
        const teamid = args?.teamid as string;
        const adbid = args?.adbid as string;
        const adoid = args?.adoid as string;
        const filesize = args?.filesize as string;
        if (!filename || !teamid || !adbid || !adoid || !filesize) {
          throw new Error(
            "filename, teamid, adbid, adoid, and filesize are required"
          );
        }
        const cellpos = args?.cellpos as string | undefined;
        const apiKey = args?.apiKey as string | undefined;
        const userEmail = args?.userEmail as string | undefined;
        const result = await anydbClient.getUploadUrl(
          { filename, teamid, adbid, adoid, filesize, cellpos },
          apiKey,
          userEmail
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "upload_file_to_url": {
        const uploadUrl = args?.uploadUrl as string;
        const fileContent = args?.fileContent as string;
        if (!uploadUrl || !fileContent) {
          throw new Error("uploadUrl and fileContent are required");
        }
        const contentType = args?.contentType as string | undefined;

        // Convert base64 string to Buffer if needed
        let content: Buffer | string = fileContent;
        try {
          content = Buffer.from(fileContent, "base64");
        } catch (error) {
          // If not base64, use as-is (text content)
          content = fileContent;
        }

        await anydbClient.uploadFileToUrl(uploadUrl, content, contentType);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { success: true, message: "File uploaded successfully" },
                null,
                2
              ),
            },
          ],
        };
      }

      case "complete_upload": {
        const filesize = args?.filesize as string;
        const teamid = args?.teamid as string;
        const adbid = args?.adbid as string;
        if (!filesize || !teamid || !adbid) {
          throw new Error("filesize, teamid, and adbid are required");
        }
        const adoid = args?.adoid as string | undefined;
        const cellpos = args?.cellpos as string | undefined;
        const apiKey = args?.apiKey as string | undefined;
        const userEmail = args?.userEmail as string | undefined;
        const result = await anydbClient.completeUpload(
          { filesize, teamid, adbid, adoid, cellpos },
          apiKey,
          userEmail
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`\n========== MCP Tool Error ==========`);
    console.error(`Tool: ${name}`);
    console.error(`Error: ${errorMessage}`);
    console.error(`====================================\n`);
    return {
      content: [
        {
          type: "text",
          text: `Error: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("AnyDB MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
