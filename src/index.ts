#!/usr/bin/env node

// Redirect console.log to console.error to prevent breaking MCP JSON-RPC protocol
// This ensures that any console.log calls (from dependencies like the SDK) don't write to stdout
const originalLog = console.log;
console.log = (...args: any[]) => {
  console.error(...args);
};

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
 * File Upload Workflow
 * =============================================================================
 *
 * Uploading small files is simple with the upload_file tool:
 * 1. Prepare your file content as a base64-encoded string
 * 2. Call upload_file with filename, fileContent, teamid, adbid, adoid, and optional cellpos
 * 3. The tool creates a separate child File record attached to the supplied parent adoid
 * 4. Upload preparation and completion target the child File record, not the parent
 * 5. Returns the created child File record ID after completing the upload
 *
 * Example: Upload a text file
 *   - filename: "document.txt"
 *   - fileContent: Base64-encoded file content
 *   - teamid, adbid, adoid: IDs from your records
 *   - cellpos: "A1" (optional, defaults to A1)
 *   - contentType: "text/plain" (optional, helps with file handling)
 *
 * =============================================================================
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { AnyDBClient, PredefinedTemplateAdoIds } from "anydb-api-sdk-ts";
import { lookup as lookupMimeType } from "mime-types";
import { config } from "./config.js";
import { ExtApiClient } from "./ext-api-client.js";
import { normalizeRecordContent } from "./record-update.js";
import {
  listSolutionResources,
  readSolutionResource,
  SOLUTION_BUILDING_GUIDE_URI,
} from "./solution-resources.js";
import type { TemplateStructure } from "./types.js";

// Initialize AnyDB client with credentials from environment
if (!config.defaultApiKey || !config.defaultUserEmail) {
  throw new Error(
    "ANYDB_DEFAULT_API_KEY and ANYDB_DEFAULT_USER_EMAIL must be set in environment variables",
  );
}

const anydbClient = new AnyDBClient({
  apiKey: config.defaultApiKey,
  userEmail: config.defaultUserEmail,
  baseURL: config.anydbApiBaseUrl,
});

const extApiClient = new ExtApiClient({
  apiKey: config.defaultApiKey,
  userEmail: config.defaultUserEmail,
  baseURL: config.anydbApiBaseUrl,
});

// Define available tools
const TOOLS: Tool[] = [
  {
    name: "anydb_discover_types",
    description:
      "Search reusable AnyDB types before designing a new solution. Searches workspace templates, the built-in catalog, or both and reports each source's availability independently.",
    inputSchema: {
      type: "object",
      properties: {
        teamid: {
          type: "string",
          description: "The team ID (MongoDB ObjectId)",
        },
        adbid: {
          type: "string",
          description: "The database ID (MongoDB ObjectId)",
        },
        search: {
          type: "string",
          description:
            "A concise description of the type or solution capability needed",
        },
        source: {
          type: "string",
          enum: ["workspace", "builtin", "all"],
          description: "Catalogs to search; defaults to all",
          default: "all",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 50,
          description: "Maximum candidates per source; defaults to 20",
          default: 20,
        },
      },
      required: ["teamid", "adbid", "search"],
    },
  },
  {
    name: "list_templates",
    description:
      "List the templates (types) available in a database. Use this to discover templatename values and cell schemas before creating or updating records.",
    inputSchema: {
      type: "object",
      properties: {
        teamid: {
          type: "string",
          description: "The team ID (MongoDB ObjectId)",
        },
        adbid: {
          type: "string",
          description: "The database ID (MongoDB ObjectId)",
        },
      },
      required: ["teamid", "adbid"],
    },
  },
  {
    name: "get_template",
    description:
      "Get a database template (type) by templatename, including its cell keys, positions, formats, and properties. The terms templatename and typename mean the same thing.",
    inputSchema: {
      type: "object",
      properties: {
        teamid: {
          type: "string",
          description: "The team ID (MongoDB ObjectId)",
        },
        adbid: {
          type: "string",
          description: "The database ID (MongoDB ObjectId)",
        },
        templatename: {
          type: "string",
          description: "The template/type name returned by list_templates",
        },
      },
      required: ["teamid", "adbid", "templatename"],
    },
  },
  {
    name: "get_record",
    description:
      "Get a specific AnyDB record by its fully qualified address (teamid, adbid, adoid).",
    inputSchema: {
      type: "object",
      properties: {
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
      required: ["teamid", "adbid", "adoid"],
    },
  },
  {
    name: "list_teams",
    description:
      "List all teams that the provided API key has access to. A team is like an organization or workspace with its own databases and users. Use this first to discover available teamid values for other operations.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "list_databases_for_team",
    description:
      "Get all ADBs (databases) for a specific team. An ADB is like a spreadsheet file or a database table containing records. Use this to discover available adbid values within a team.",
    inputSchema: {
      type: "object",
      properties: {
        teamid: {
          type: "string",
          description: "The team ID (MongoDB ObjectId). Get from list_teams.",
        },
      },
      required: ["teamid"],
    },
  },
  {
    name: "list_records",
    description:
      "List all ADOs (records) in a database. Optionally filter by parent record ID to get child records, by template to get records of a specific type, and use pagination for large result sets.",
    inputSchema: {
      type: "object",
      properties: {
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
            "Optional parent record ID to filter child records (MongoDB ObjectId). If not provided, then the root database records are returned.",
        },
        templateid: {
          type: "string",
          description:
            "Optional template ID to filter records by type (MongoDB ObjectId). Only returns records created from this template.",
        },
        templatename: {
          type: "string",
          description:
            "Optional template name to filter records by type. Alternative to templateid - provide one or the other, not both.",
        },
        pagesize: {
          type: "string",
          description:
            "Optional page size to limit the number of records returned (numeric string, e.g., '50'). Useful for pagination with large result sets.",
        },
        lastmarker: {
          type: "string",
          description:
            "Optional pagination marker. Use the marker from the previous response to get the next page of results.",
        },
        filter: {
          type: "array",
          description:
            "Optional structured filters. With templatename, field may use '{{Field Name}}' and will be resolved to its cell position. Multiple filters are combined by the backend.",
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: ["meta", "badge", "cell"],
              },
              field: { type: "string" },
              op: {
                type: "string",
                enum: [
                  "eq",
                  "neq",
                  "gt",
                  "lt",
                  "gte",
                  "lte",
                  "like",
                  "contains",
                  "startswith",
                  "endswith",
                  "includes",
                  "notincludes",
                ],
              },
              value: {},
            },
            required: ["type", "field", "op", "value"],
          },
        },
      },
      required: ["teamid", "adbid"],
    },
  },
  {
    name: "create_record",
    description:
      "Create a new AnyDB record in a specific database. You can optionally attach it to a parent record or use a template.",
    inputSchema: {
      type: "object",
      properties: {
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
      required: ["adbid", "teamid", "name"],
    },
  },
  {
    name: "bulk_create_records",
    description:
      "Create up to 100 records in one request. Processing uses bounded concurrency and returns an ordered result for every input; failures do not roll back successful records. Use clientref to correlate results.",
    inputSchema: {
      type: "object",
      properties: {
        teamid: { type: "string", description: "The team ID" },
        adbid: { type: "string", description: "The database ID" },
        records: {
          type: "array",
          minItems: 1,
          maxItems: 100,
          items: {
            type: "object",
            properties: {
              clientref: {
                type: "string",
                description: "Optional caller-generated correlation value",
              },
              name: { type: "string", description: "Record name" },
              attach: { type: "string", description: "Optional parent ID" },
              template: {
                type: "string",
                description: "Optional template ID",
              },
              templatename: {
                type: "string",
                description: "Optional template/type name",
              },
              content: { type: "object" },
            },
            required: ["name"],
          },
        },
      },
      required: ["teamid", "adbid", "records"],
    },
  },
  {
    name: "update_record",
    description: "Update an existing AnyDB record's metadata and content.",
    inputSchema: {
      type: "object",
      properties: {
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
          description:
            "Optional content updates. Each key should be a cell key from the record, and the value should be an object containing 'pos' (cell position like 'A1'), 'key' (cell key), and 'value' (the new cell value). Use get_record first to retrieve the current cell content, then reuse that structure and only update the 'value' or other properties as needed.",
        },
      },
      required: ["meta"],
    },
  },
  {
    name: "bulk_update_records",
    description:
      "Update up to 100 records in one request. Processing uses bounded concurrency and returns an ordered result for every input; failures do not roll back successful updates. Use clientref to correlate results.",
    inputSchema: {
      type: "object",
      properties: {
        records: {
          type: "array",
          minItems: 1,
          maxItems: 100,
          items: {
            type: "object",
            properties: {
              clientref: {
                type: "string",
                description: "Optional caller-generated correlation value",
              },
              meta: {
                type: "object",
                properties: {
                  adoid: { type: "string" },
                  adbid: { type: "string" },
                  teamid: { type: "string" },
                  name: { type: "string" },
                  description: { type: "string" },
                  icon: { type: "string" },
                  followup: { type: "number" },
                  locked: { type: "boolean" },
                  status: { type: "string" },
                  attach: { type: "string" },
                  assignees: { type: "object" },
                },
                required: ["adoid", "adbid", "teamid"],
              },
              content: { type: "object" },
            },
            required: ["meta"],
          },
        },
      },
      required: ["records"],
    },
  },
  {
    name: "delete_record",
    description:
      "Delete or unlink an existing AnyDB record. Records can have multiple parents - you can either unlink the record from specific parent(s) by providing their IDs in removefromids, or permanently delete the record by passing '000000000000000000000000' (NULL_OBJECTID). If removefromids is not specified, the record will be permanently deleted by default.",
    inputSchema: {
      type: "object",
      properties: {
        adoid: {
          type: "string",
          description: "The record ID to delete or unlink (MongoDB ObjectId)",
        },
        adbid: {
          type: "string",
          description: "The database ID (MongoDB ObjectId)",
        },
        teamid: {
          type: "string",
          description: "The team ID (MongoDB ObjectId)",
        },
        removefromids: {
          type: "string",
          description:
            "Comma-separated parent ADOIDs to unlink the record from (e.g., '507f1f77bcf86cd799439011,507f191e810c19729de860ea'), or '000000000000000000000000' (NULL_OBJECTID) to permanently delete the record. Defaults to NULL_OBJECTID for permanent deletion if not specified.",
        },
      },
      required: ["adoid", "adbid", "teamid"],
    },
  },
  {
    name: "copy_record",
    description:
      "Create a copy of an existing AnyDB record. The copy will be an independent record with its own ID. You can optionally attach the copy to a different parent record and control how file attachments are handled. There are three attachment modes: (1) 'noattachments' - Copy without any file attachments (files are not copied), (2) 'link' - Copy with linked attachments (files reference the same storage location as the original), (3) 'duplicate' - Copy with duplicated attachments (files are fully copied to new storage locations, creating true independent copies).",
    inputSchema: {
      type: "object",
      properties: {
        adoid: {
          type: "string",
          description: "The source record ID to copy (MongoDB ObjectId)",
        },
        adbid: {
          type: "string",
          description: "The database ID (MongoDB ObjectId)",
        },
        teamid: {
          type: "string",
          description: "The team ID (MongoDB ObjectId)",
        },
        attachto: {
          type: "string",
          description:
            "Optional parent record ID to attach the copied record to (MongoDB ObjectId). If not provided, the copy will be created at the same level as the original record.",
        },
        attachmentsmode: {
          type: "string",
          description:
            "How to handle file attachments in the copy. Choose one of: 'noattachments' (don't copy files), 'link' (reference same files), or 'duplicate' (create independent file copies). Defaults to 'link' if not specified.",
          enum: ["noattachments", "link", "duplicate"],
        },
      },
      required: ["adoid", "adbid", "teamid"],
    },
  },
  {
    name: "move_record",
    description:
      "Move an existing AnyDB record to a new parent. This changes the parent-child relationship of the record in the database hierarchy. The record itself remains the same, but its location in the tree structure changes. Use this to reorganize records or change their grouping.",
    inputSchema: {
      type: "object",
      properties: {
        adoid: {
          type: "string",
          description: "The record ID to move (MongoDB ObjectId)",
        },
        adbid: {
          type: "string",
          description: "The database ID (MongoDB ObjectId)",
        },
        teamid: {
          type: "string",
          description: "The team ID (MongoDB ObjectId)",
        },
        parentid: {
          type: "string",
          description:
            "The target parent record ID to move this record under (MongoDB ObjectId). The record will become a child of this parent.",
        },
      },
      required: ["adoid", "adbid", "teamid", "parentid"],
    },
  },
  {
    name: "search_records",
    description:
      "Search for records in a database using a keyword. Optionally filter by parent record and specify pagination.",
    inputSchema: {
      type: "object",
      properties: {
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
      required: ["adbid", "teamid", "search"],
    },
  },
  {
    name: "search_team_records",
    description:
      "Search records across every accessible database in a team. This lists the team's databases and runs search_records against each one sequentially. Results are grouped by database, and failures in one database do not discard successful results from others.",
    inputSchema: {
      type: "object",
      properties: {
        teamid: {
          type: "string",
          description: "The team ID (MongoDB ObjectId)",
        },
        search: {
          type: "string",
          description: "The search keyword",
        },
        limit: {
          type: "string",
          description:
            "Optional maximum results per database (numeric string). Defaults to the search_records backend limit.",
        },
      },
      required: ["teamid", "search"],
    },
  },
  {
    name: "download_file",
    description:
      "Download a file or get download URL from a record cell. Returns JSON with a 'url' field containing a presigned file link. Normal file URLs expire after approximately 60 seconds: fetch immediately and do not cache or reuse them. The MCP client/host should render the URL as a link for humans or fetch its bytes for LLM processing. First use get_record to find file cells and their cellpos values.",
    inputSchema: {
      type: "object",
      properties: {
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
      required: ["teamid", "adbid", "adoid", "cellpos"],
    },
  },
  {
    name: "upload_file",
    description:
      "Upload a small file inline using the supported single-call workflow. This creates a separate child File record attached to the supplied parent adoid; it does not write into the parent record's content. Base64 is the default encoding; set contentEncoding to 'utf8' for plain text. For large files, use prepare_file_upload and complete_file_upload instead.",
    inputSchema: {
      type: "object",
      properties: {
        filename: {
          type: "string",
          description:
            "The name of the file to upload (e.g., 'document.pdf', 'image.png')",
        },
        fileContent: {
          type: "string",
          description: "The encoded file content, not a file path.",
        },
        contentEncoding: {
          type: "string",
          enum: ["base64", "utf8"],
          description:
            "Encoding of fileContent. Defaults to 'base64'. Use 'utf8' only for plain text.",
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
            "The parent record ID (MongoDB ObjectId). A separate child File record will be created and attached to this parent.",
        },
        cellpos: {
          type: "string",
          description:
            "Optional file cell position on the new child File record, not on the parent record. Defaults to 'A1'.",
        },
        contentType: {
          type: "string",
          description:
            "Optional MIME type (e.g., 'image/png'). When omitted, it is inferred from filename and falls back to application/octet-stream.",
        },
      },
      required: ["filename", "fileContent", "teamid", "adbid", "adoid"],
    },
  },
  {
    name: "prepare_file_upload",
    description:
      "Create a file record and return a presigned URL for uploading bytes directly with HTTP PUT. Use this for large files, then call complete_file_upload after the PUT succeeds.",
    inputSchema: {
      type: "object",
      properties: {
        filename: { type: "string", description: "The file name" },
        filesize: {
          type: "string",
          description: "Exact file size in bytes as a numeric string",
        },
        teamid: { type: "string", description: "The team ID" },
        adbid: { type: "string", description: "The database ID" },
        adoid: {
          type: "string",
          description: "The parent record ID to attach the file record to",
        },
        cellpos: {
          type: "string",
          description: "File cell position; defaults to A1",
        },
        contentType: {
          type: "string",
          description:
            "Optional MIME type. When omitted, it is inferred from filename and falls back to application/octet-stream.",
        },
      },
      required: ["filename", "filesize", "teamid", "adbid", "adoid"],
    },
  },
  {
    name: "complete_file_upload",
    description:
      "Complete a presigned file upload after the client has PUT the bytes to the URL returned by prepare_file_upload.",
    inputSchema: {
      type: "object",
      properties: {
        filesize: {
          type: "string",
          description: "Exact uploaded file size in bytes",
        },
        teamid: { type: "string", description: "The team ID" },
        adbid: { type: "string", description: "The database ID" },
        adoid: {
          type: "string",
          description: "The file record ID returned by prepare_file_upload",
        },
        cellpos: {
          type: "string",
          description: "File cell position; defaults to A1",
        },
      },
      required: ["filesize", "teamid", "adbid", "adoid"],
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
      resources: {},
    },
    instructions: `Before authoring an AnyDB solution, read ${SOLUTION_BUILDING_GUIDE_URI} and anydb://schemas/solution-authoring/v1. A solution is a coordinated set of types, cells, relationships, formulas, and workflows. Design the complete solution first, discover and reuse compatible workspace or built-in types, create dependencies in order, and create workflows last. Do not mutate types or workflows until the relevant guidance has been read.`,
  },
);

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: listSolutionResources(),
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => ({
  contents: [readSolutionResource(request.params.uri)],
}));

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
      case "anydb_discover_types": {
        const teamid = args?.teamid as string;
        const adbid = args?.adbid as string;
        const search = args?.search as string;
        const source = args?.source as
          | "workspace"
          | "builtin"
          | "all"
          | undefined;
        const limit = args?.limit as number | undefined;
        if (!teamid || !adbid || !search) {
          throw new Error("teamid, adbid, and search are required");
        }
        if (source && !["workspace", "builtin", "all"].includes(source)) {
          throw new Error("source must be workspace, builtin, or all");
        }
        if (
          limit !== undefined &&
          (!Number.isInteger(limit) || limit < 1 || limit > 50)
        ) {
          throw new Error("limit must be an integer from 1 to 50");
        }
        const discovery = await extApiClient.discoverTypes({
          teamid,
          adbid,
          search,
          source,
          limit,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(discovery, null, 2) }],
        };
      }

      case "list_templates": {
        const teamid = args?.teamid as string;
        const adbid = args?.adbid as string;
        if (!teamid || !adbid) {
          throw new Error("teamid and adbid are required");
        }
        const templates = await extApiClient.listTemplates(teamid, adbid);
        return {
          content: [{ type: "text", text: JSON.stringify(templates, null, 2) }],
        };
      }

      case "get_template": {
        const teamid = args?.teamid as string;
        const adbid = args?.adbid as string;
        const templatename = args?.templatename as string;
        if (!teamid || !adbid || !templatename) {
          throw new Error("teamid, adbid, and templatename are required");
        }
        const template = await extApiClient.getTemplate(
          teamid,
          adbid,
          templatename,
        );
        return {
          content: [{ type: "text", text: JSON.stringify(template, null, 2) }],
        };
      }

      case "get_record": {
        const teamid = args?.teamid as string;
        const adbid = args?.adbid as string;
        const adoid = args?.adoid as string;
        if (!teamid || !adbid || !adoid) {
          throw new Error("teamid, adbid, and adoid are required");
        }
        const record = await anydbClient.getRecord(teamid, adbid, adoid);
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
        const teams = await anydbClient.listTeams();
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
        const databases = await anydbClient.listDatabasesForTeam(teamid);
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
        const templateid = args?.templateid as string | undefined;
        const templatename = args?.templatename as string | undefined;
        const pagesize = args?.pagesize as string | undefined;
        const lastmarker = args?.lastmarker as string | undefined;
        const filter = args?.filter as
          | Array<{
              type: "meta" | "badge" | "cell";
              field: string;
              op:
                | "eq"
                | "neq"
                | "gt"
                | "lt"
                | "gte"
                | "lte"
                | "like"
                | "contains"
                | "startswith"
                | "endswith"
                | "includes"
                | "notincludes";
              value: unknown;
            }>
          | undefined;
        const records = filter
          ? await extApiClient.listRecords({
              teamid,
              adbid,
              parentid,
              templateid,
              templatename,
              pagesize,
              lastmarker,
              filter,
            })
          : await anydbClient.listRecords(
              teamid,
              adbid,
              parentid,
              templateid,
              templatename,
              pagesize,
              lastmarker,
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
        const record = await anydbClient.createRecord(params);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(record, null, 2),
            },
          ],
        };
      }

      case "bulk_create_records": {
        const teamid = args?.teamid as string;
        const adbid = args?.adbid as string;
        const records = args?.records as Array<{
          clientref?: string;
          name: string;
          attach?: string;
          template?: string;
          templatename?: string;
          content?: Record<string, unknown>;
        }>;
        if (!teamid || !adbid || !Array.isArray(records) || !records.length) {
          throw new Error(
            "teamid, adbid, and a non-empty records array are required",
          );
        }
        if (records.length > 100) {
          throw new Error("bulk_create_records accepts at most 100 records");
        }
        const result = await extApiClient.bulkCreateRecords({
          teamid,
          adbid,
          records,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "update_record": {
        const meta = args?.meta as any;
        if (!meta || !meta.adoid || !meta.adbid || !meta.teamid) {
          throw new Error("meta with adoid, adbid, and teamid are required");
        }
        const current = await anydbClient.getRecord(
          meta.teamid,
          meta.adbid,
          meta.adoid,
        );
        const params = {
          meta,
          content: normalizeRecordContent(
            current,
            args?.content as Record<string, unknown> | undefined,
          ),
        };
        const record = await anydbClient.updateRecord(params);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(record, null, 2),
            },
          ],
        };
      }

      case "bulk_update_records": {
        const records = args?.records as Array<{
          clientref?: string;
          meta: Record<string, unknown> & {
            adoid: string;
            adbid: string;
            teamid: string;
          };
          content?: Record<string, unknown>;
        }>;
        if (!Array.isArray(records) || !records.length) {
          throw new Error("a non-empty records array is required");
        }
        if (records.length > 100) {
          throw new Error("bulk_update_records accepts at most 100 records");
        }
        const normalizedRecords = [];
        for (const record of records) {
          const current = await anydbClient.getRecord(
            record.meta.teamid,
            record.meta.adbid,
            record.meta.adoid,
          );
          normalizedRecords.push({
            ...record,
            content: normalizeRecordContent(current, record.content),
          });
        }
        const result = await extApiClient.bulkUpdateRecords(normalizedRecords);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "delete_record": {
        const adoid = args?.adoid as string;
        const adbid = args?.adbid as string;
        const teamid = args?.teamid as string;
        if (!adoid || !adbid || !teamid) {
          throw new Error("adoid, adbid, and teamid are required");
        }
        const params = {
          adoid,
          adbid,
          teamid,
          removefromids:
            (args?.removefromids as string) || "000000000000000000000000", // NULL_OBJECTID for permanent deletion
        };
        const result = await anydbClient.removeRecord(params);
        return {
          content: [
            {
              type: "text",
              text: result
                ? "Record deleted successfully"
                : "Failed to delete record",
            },
          ],
        };
      }

      case "copy_record": {
        const adoid = args?.adoid as string;
        const adbid = args?.adbid as string;
        const teamid = args?.teamid as string;
        if (!adoid || !adbid || !teamid) {
          throw new Error("adoid, adbid, and teamid are required");
        }
        const params = {
          adoid,
          adbid,
          teamid,
          attachto: args?.attachto as string | undefined,
          attachmentsmode:
            (args?.attachmentsmode as "noattachments" | "link" | "duplicate") ||
            "link",
        };
        const result = await anydbClient.copyRecord(params);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "move_record": {
        const adoid = args?.adoid as string;
        const adbid = args?.adbid as string;
        const teamid = args?.teamid as string;
        const parentid = args?.parentid as string;
        if (!adoid || !adbid || !teamid || !parentid) {
          throw new Error("adoid, adbid, teamid, and parentid are required");
        }
        const params = {
          adoid,
          adbid,
          teamid,
          parentid,
        };
        const result = await anydbClient.moveRecord(params);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
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
        const results = await anydbClient.searchRecords(params);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      }

      case "search_team_records": {
        const teamid = args?.teamid as string;
        const search = args?.search as string;
        const limit = args?.limit as string | undefined;
        if (!teamid || !search) {
          throw new Error("teamid and search are required");
        }

        const databases = await anydbClient.listDatabasesForTeam(teamid);
        const results: Array<{
          database: { adbid: string; name: string };
          records: unknown;
        }> = [];
        const errors: Array<{
          database: { adbid: string; name: string };
          error: string;
        }> = [];

        for (const database of databases) {
          const databaseInfo = {
            adbid: database.adbid,
            name: database.name,
          };
          try {
            const records = await anydbClient.searchRecords({
              teamid,
              adbid: database.adbid,
              search,
              limit,
            });
            results.push({ database: databaseInfo, records });
          } catch (error) {
            errors.push({
              database: databaseInfo,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  search,
                  databasesSearched: databases.length,
                  results,
                  errors,
                },
                null,
                2,
              ),
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
        const result = await anydbClient.downloadFile({
          teamid,
          adbid,
          adoid,
          cellpos,
          redirect,
          preview,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "upload_file": {
        const filename = args?.filename as string;
        const fileContent = args?.fileContent as string;
        const teamid = args?.teamid as string;
        const adbid = args?.adbid as string;
        const adoid = args?.adoid as string;

        if (!filename || !fileContent || !teamid || !adbid || !adoid) {
          throw new Error(
            "filename, fileContent, teamid, adbid, and adoid are required",
          );
        }

        const cellpos = args?.cellpos as string | undefined;
        const contentType =
          (args?.contentType as string | undefined) ||
          lookupMimeType(filename) ||
          "application/octet-stream";
        const contentEncoding =
          (args?.contentEncoding as "base64" | "utf8" | undefined) || "base64";

        const content = Buffer.from(fileContent, contentEncoding);

        const result = await anydbClient.uploadFile({
          filename,
          fileContent: content,
          teamid,
          adbid,
          adoid,
          cellpos,
          contentType,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "prepare_file_upload": {
        const filename = args?.filename as string;
        const filesize = args?.filesize as string;
        const teamid = args?.teamid as string;
        const adbid = args?.adbid as string;
        const parentAdoid = args?.adoid as string;
        const cellpos = (args?.cellpos as string | undefined) || "A1";
        const contentType =
          (args?.contentType as string | undefined) ||
          lookupMimeType(filename) ||
          "application/octet-stream";
        if (!filename || !filesize || !teamid || !adbid || !parentAdoid) {
          throw new Error(
            "filename, filesize, teamid, adbid, and adoid are required",
          );
        }

        const fileRecord = await anydbClient.createRecord({
          name: filename,
          teamid,
          adbid,
          attach: parentAdoid,
          template: PredefinedTemplateAdoIds.FILE_TEMPLATE_ADOID,
        });
        const fileAdoid = fileRecord.meta.adoid;
        const url = await anydbClient.getUploadUrl({
          filename,
          filesize,
          teamid,
          adbid,
          adoid: fileAdoid,
          cellpos,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { url, adoid: fileAdoid, cellpos, contentType },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "complete_file_upload": {
        const filesize = args?.filesize as string;
        const teamid = args?.teamid as string;
        const adbid = args?.adbid as string;
        const adoid = args?.adoid as string;
        const cellpos = (args?.cellpos as string | undefined) || "A1";
        if (!filesize || !teamid || !adbid || !adoid) {
          throw new Error("filesize, teamid, adbid, and adoid are required");
        }
        const completed = await anydbClient.completeUpload({
          filesize,
          teamid,
          adbid,
          adoid,
          cellpos,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ completed, adoid, cellpos }, null, 2),
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
