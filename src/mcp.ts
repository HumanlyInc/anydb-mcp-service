#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { lookup as lookupMimeType } from "mime-types";
import { config } from "./config.js";
import { ExtApiClient, FILE_TEMPLATE_ADOID } from "./ext-api-client.js";
import { normalizeRecordContent } from "./record-update.js";
import {
  callSolutionAuthoringTool,
  isSolutionAuthoringTool,
  SOLUTION_AUTHORING_TOOLS,
} from "./solution-authoring-tools.js";
import {
  callSolutionDiscoveryTool,
  isSolutionDiscoveryTool,
  SOLUTION_DISCOVERY_TOOLS,
} from "./solution-discovery-tools.js";
import { getSolutionPrompt, listSolutionPrompts } from "./solution-prompts.js";
import {
  callIdentityTool,
  IDENTITY_TOOLS,
  isIdentityTool,
} from "./identity.js";
import type { VerifiedToken } from "./oauth/token-verifier.js";
import { callSetupTool, isSetupTool, SETUP_TOOLS } from "./setup-tools.js";
import {
  callSemanticSearchTool,
  isSemanticSearchTool,
  SEMANTIC_SEARCH_TOOLS,
} from "./semantic-search-tools.js";
import {
  ANYDB_SETUP_GUIDE_URI,
  listSolutionResources,
  readSolutionResource,
  SOLUTION_BUILDING_GUIDE_URI,
} from "./solution-resources.js";

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
 * Upload every file, of any size, with the signed-URL flow:
 * 1. prepare_file_upload with filename, filesize, teamid, adbid, and the PARENT adoid.
 *    It creates a child File record and returns { url, adoid, cellpos, contentType }.
 * 2. PUT the raw bytes to that url, sending the returned contentType as the
 *    Content-Type header. The bytes go straight to storage.
 * 3. complete_file_upload with the adoid PREPARE RETURNED (the File record, not
 *    the parent), plus the same filesize and cellpos.
 *
 * The bytes never pass through the calling model's context, which is the point.
 * upload_file exists only for callers that cannot issue an HTTP PUT of their
 * own: it runs this identical flow server-side, but the base64 payload costs
 * the caller ~33% inflation in its own token budget on the way in.
 *
 * Example: Upload a text file
 *   - prepare_file_upload: filename "document.txt", filesize "11",
 *     teamid/adbid/adoid from your records, cellpos "A1" (optional)
 *   - PUT the bytes to the returned url with Content-Type: text/plain
 *   - complete_file_upload: filesize "11", teamid, adbid, the returned adoid
 *
 * =============================================================================
 */

// Define available tools
const TOOLS: Tool[] = [
  ...SETUP_TOOLS,
  ...IDENTITY_TOOLS,
  ...SOLUTION_AUTHORING_TOOLS,
  ...SOLUTION_DISCOVERY_TOOLS,
  ...SEMANTIC_SEARCH_TOOLS,
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
      "List the teams this connection can access, as teamid, name, and plan. A team is like an organization or workspace with its own databases and users. Use this first to discover available teamid values for other operations. Access control and policy detail are omitted; ask for them only if you genuinely need them, as they are large.",
    inputSchema: {
      type: "object",
      properties: {
        includeRawTeamMetadata: {
          type: "boolean",
          description:
            "Return the complete team documents, including ACL and policy. Very large — tens of thousands of characters for a handful of teams. Leave unset unless you specifically need permission data.",
        },
      },
      required: [],
    },
  },
  {
    name: "anydb_get_inbox",
    description:
      "List what is in YOUR Inbox for a team - the records assigned to the authenticated user, which is the same list the Inbox in the AnyDB app shows. Use it to check that an assignment you made through update_record actually landed, or to see what is waiting on you. A record gets here through meta.assignees on update_record; each entry says whether it was assigned to you directly or through a group you belong to. This reads your own Inbox only: there is no way to read another person's. The list is self-correcting, so a record that was deleted or reassigned away simply is not in it.",
    inputSchema: {
      type: "object",
      properties: {
        teamid: {
          type: "string",
          description:
            "The team whose Inbox to read. Get from list_teams. An Inbox is per team, so a record assigned to you in another team will not appear here.",
        },
      },
      required: ["teamid"],
    },
  },
  {
    name: "anydb_list_views",
    description:
      "List the Views on a type's listing page - the strip reading All, and whatever named filters sit beside it, that a person sees when they open the type in AnyDB. That strip is what a View is in AnyDB: the thing a user creates, names, and clicks. Use this when the user asks what views or saved filters they already have on a type, or to check that a View you created actually landed.",
    inputSchema: {
      type: "object",
      properties: {
        teamid: { type: "string", description: "The team ID." },
        adbid: { type: "string", description: "The database ID." },
        templateName: {
          type: "string",
          description:
            "The stable type name whose listing page you want, e.g. \"Order\". Views are stored per type on the database root record.",
        },
      },
      required: ["teamid", "adbid", "templateName"],
    },
  },
  {
    name: "anydb_create_view",
    description:
      "Create a View on a type's listing page, so a person opening that type in AnyDB sees it next to All. This is what someone means by \"a view showing only X\" - the named filter they can see and click at the top of the type page. View names are unique per type; creating a duplicate name is rejected rather than silently merged.",
    inputSchema: {
      type: "object",
      properties: {
        teamid: { type: "string", description: "The team ID." },
        adbid: { type: "string", description: "The database ID." },
        templateName: {
          type: "string",
          description: "The stable type name to add the View to.",
        },
        view: {
          type: "object",
          description: "The View to add.",
          properties: {
            name: {
              type: "string",
              description:
                "View label, shown to the user. Unique within the type. \"All\" already exists and is the default View.",
            },
            filter: {
              type: "array",
              description: "Filter rows, same shape the app writes. Each is {field, op, type, value, fieldType}. `field` uses {{Field Key}} for a cell (e.g. \"{{Status}}\"). `op` is one of eq, neq, gt, lt, gte, lte, startswith, endswith, contains - note `like` is NOT available, because the listing page cannot run it. `type` is cell, meta or badge. `fieldType` is the field's format, e.g. \"select\". An `id` is generated for you if you omit it.",
              items: { type: "object" },
            },
            sort: {
              type: "array",
              description:
                "Optional sort rows, {by, type, dir} where dir is 1 or -1.",
              items: { type: "object" },
            },
          },
          required: ["name"],
        },
      },
      required: ["teamid", "adbid", "templateName", "view"],
    },
  },
  {
    name: "anydb_update_view",
    description:
      "Change an existing View, found by its current name. Only the keys you send are changed - the View's column widths, displayed columns and sort are preserved, which matters because those are set in the app and cannot be sent through this API. Pass changes.name to rename it.",
    inputSchema: {
      type: "object",
      properties: {
        teamid: { type: "string", description: "The team ID." },
        adbid: { type: "string", description: "The database ID." },
        templateName: {
          type: "string",
          description: "The stable type name the View belongs to.",
        },
        name: {
          type: "string",
          description: "Current View name, from anydb_list_views.",
        },
        changes: {
          type: "object",
          description:
            "Fields to change. Supply name to rename, filter to replace the filter rows, sort to replace the sort. Anything you omit is kept.",
          properties: {
            name: { type: "string" },
            filter: {
              type: "array",
              description: "Filter rows, same shape the app writes. Each is {field, op, type, value, fieldType}. `field` uses {{Field Key}} for a cell (e.g. \"{{Status}}\"). `op` is one of eq, neq, gt, lt, gte, lte, startswith, endswith, contains - note `like` is NOT available, because the listing page cannot run it. `type` is cell, meta or badge. `fieldType` is the field's format, e.g. \"select\". An `id` is generated for you if you omit it.",
              items: { type: "object" },
            },
            sort: { type: "array", items: { type: "object" } },
          },
        },
      },
      required: ["teamid", "adbid", "templateName", "name", "changes"],
    },
  },
  {
    name: "anydb_delete_view",
    description:
      "Remove a View from a type's listing page. Permanent, and it takes that View's saved columns and sort with it. The All view cannot be deleted: it holds the default sort and column layout for the whole listing page.",
    inputSchema: {
      type: "object",
      properties: {
        teamid: { type: "string", description: "The team ID." },
        adbid: { type: "string", description: "The database ID." },
        templateName: {
          type: "string",
          description: "The stable type name the View belongs to.",
        },
        name: {
          type: "string",
          description: "View name to remove, from anydb_list_views.",
        },
      },
      required: ["teamid", "adbid", "templateName", "name"],
    },
  },
  {
    name: "anydb_generate_document",
    description:
      "Generate a document from one record using a Document Generation template, and attach the result to that record so it can be downloaded, emailed or sent on. This is the tool that actually produces the PDF - the other docgen tools only configure which template applies to which type. REGENERATING REPLACES: running this again with the same template on the same record supersedes the previous output rather than adding a second file, so a record never accumulates a pile of near-identical documents. Replacement is per template, so generating a Quote does not remove an Invoice generated from a different template on the same record. The result is an ordinary File record: pass the returned fileRecordId and cellPosition to download_file to fetch the bytes.",
    inputSchema: {
      type: "object",
      properties: {
        teamid: { type: "string", description: "The team ID." },
        adbid: { type: "string", description: "The database ID." },
        docgenId: {
          type: "string",
          description:
            "id of the Document Generation template to run, from anydb_list_docgen_templates.",
        },
        adoid: {
          type: "string",
          description:
            "The record to generate FROM - its field values fill the template's placeholders.",
        },
        attachTo: {
          type: "string",
          description:
            "Optional record to attach the generated document to. Defaults to the record it was generated from, which is almost always what you want. Note this WRITES a file into the workspace, so the user will see it.",
        },
        asPdf: {
          type: "boolean",
          description:
            "Convert the filled template to PDF. Defaults to true, which is what an invoice or quote normally wants; false returns the rendered .docx/.xlsx instead.",
        },
      },
      required: ["teamid", "adbid", "docgenId", "adoid"],
    },
  },
  {
    name: "anydb_list_docgen_templates",
    description:
      "List the Document Generation templates set up in a database - the .docx/.xlsx templates a person can generate a filled document from, shown under Document Generation in the AnyDB app. Each entry gives its id, its name, the workspace type it applies to (templateName), and the File record holding the template (fileAdoId). Call this before creating one to avoid a duplicate, and to find the id that update and delete take. Note the product also calls this feature \"formatted export\" internally, so that is the wording you will see in server logs and URLs.",
    inputSchema: {
      type: "object",
      properties: {
        teamid: { type: "string", description: "The team ID." },
        adbid: { type: "string", description: "The database ID." },
        templateName: {
          type: "string",
          description:
            "Optional. Restrict to templates attached to this one workspace type. Omit to list every Document Generation template in the database.",
        },
      },
      required: ["teamid", "adbid"],
    },
  },
  {
    name: "anydb_create_docgen_template",
    description:
      "Set up a Document Generation template: attach an uploaded .docx or .xlsx file to a workspace type, so documents can be generated from records of that type. THE FILE MUST BE UPLOADED FIRST and the upload must be COMPLETED - use prepare_file_upload, PUT the bytes, then complete_file_upload, and pass the resulting File record's adoid as fileRecordId. A record that is not a File, or a File whose upload never completed, is rejected: an agent that skips complete_file_upload has an adoid that looks usable and is not. The type must already exist.",
    inputSchema: {
      type: "object",
      properties: {
        teamid: { type: "string", description: "The team ID." },
        adbid: { type: "string", description: "The database ID." },
        templateName: {
          type: "string",
          description:
            "Stable workspace type name this template generates documents for, e.g. \"Invoice\". Must already exist.",
        },
        fileRecordId: {
          type: "string",
          description:
            "adoid of the File record holding the .docx/.xlsx template, from complete_file_upload. NOT the record you want to generate a document from.",
        },
        name: {
          type: "string",
          description:
            "Name for this template as the user will see it, e.g. \"Invoice PDF\".",
        },
      },
      required: ["teamid", "adbid", "templateName", "fileRecordId", "name"],
    },
  },
  {
    name: "anydb_update_docgen_template",
    description:
      "Change a Document Generation template - its name, the type it applies to, or the template file behind it. EVERY FIELD IS REQUIRED: the server implements this as a remove followed by an add, so anything you omit is lost rather than preserved, and THE ENTRY COMES BACK WITH A NEW id. Re-read anydb_list_docgen_templates afterwards rather than reusing the id you passed in.",
    inputSchema: {
      type: "object",
      properties: {
        teamid: { type: "string", description: "The team ID." },
        adbid: { type: "string", description: "The database ID." },
        docgenId: {
          type: "string",
          description:
            "id of the template to change, from anydb_list_docgen_templates.",
        },
        templateName: {
          type: "string",
          description: "Workspace type name. Required even if unchanged.",
        },
        fileRecordId: {
          type: "string",
          description:
            "File record adoid for the template file. Required even if unchanged.",
        },
        name: {
          type: "string",
          description: "Display name. Required even if unchanged.",
        },
      },
      required: [
        "teamid",
        "adbid",
        "docgenId",
        "templateName",
        "fileRecordId",
        "name",
      ],
    },
  },
  {
    name: "anydb_delete_docgen_template",
    description:
      "Remove a Document Generation template from a database. This deletes the mapping, not the uploaded template file - the File record stays and can be attached again. Permanent otherwise.",
    inputSchema: {
      type: "object",
      properties: {
        teamid: { type: "string", description: "The team ID." },
        adbid: { type: "string", description: "The database ID." },
        docgenId: {
          type: "string",
          description:
            "id of the template to remove, from anydb_list_docgen_templates.",
        },
      },
      required: ["teamid", "adbid", "docgenId"],
    },
  },
  {
    name: "anydb_run_script",
    description:
      "Run a short server-side script against a database and get back only what it computes. THIS IS THE ESCAPE HATCH FOR BULK AND AGGREGATE WORK - reach for it when the per-record tools would be the wrong instrument, not for ordinary work on a handful of records. Two cases it exists for: (1) a computation over more records than can be read back one by one, such as an NPS score across tens of thousands of responses, where the script reduces the rows server-side and returns one number; (2) a read-modify-write across many records, where fetching each record and sending it back would mean an agent retyping every payload. The script runs sandboxed, as YOU, with exactly your permissions - it cannot see or change anything you could not. Requires the Business or Enterprise plan. YOU MUST SIMULATE FIRST: this tool refuses to run without the runToken that anydb_simulate_script returns for that exact script text. Return values come back through output.set(key, value); output.json/table/csv/markdown instead render a report file. EVERY LOOP BODY MUST CONTAIN AN await (use `await anydb.yield()`), or the script is rejected. Call anydb_list_workflow_actions for the full runtime API available to the script.",
    inputSchema: {
      type: "object",
      properties: {
        teamid: { type: "string", description: "The team ID." },
        adbid: { type: "string", description: "The database ID." },
        script: {
          type: "string",
          description:
            "The script to run. Top-level awaited statements, no async IIFE wrapper. Use output.set(key, value) to return results.",
        },
        runToken: {
          type: "string",
          description:
            "The token returned by anydb_simulate_script for this exact script. Bound to the script text, caller and database, and expires after 15 minutes; if the script changed at all, simulate it again.",
        },
        refIds: {
          type: "array",
          items: { type: "string" },
          description:
            "Optional record IDs to hand the script as input.refIds, for an intentional batch over a known set.",
        },
        timeoutMs: {
          type: "number",
          description:
            "Optional execution timeout in milliseconds. Default and maximum are 5 minutes.",
        },
      },
      required: ["teamid", "adbid", "script", "runToken"],
    },
  },
  {
    name: "anydb_simulate_script",
    description:
      "Dry-run a script and see what it WOULD do, then get a runToken that authorises running it for real. READS ARE REAL; every write is suppressed - createRecord, updateRecord, share and comment changes, email and notifications all report their intent instead of happening. So a read-only aggregation (counting, scoring, summarising) is fully answered here and needs no run at all. Use this to show someone what a script will change before they approve it. Requires the Business or Enterprise plan. CAVEAT: a script that branches on the result of a write will diverge from the real run, because the write did not happen.",
    inputSchema: {
      type: "object",
      properties: {
        teamid: { type: "string", description: "The team ID." },
        adbid: { type: "string", description: "The database ID." },
        script: {
          type: "string",
          description:
            "The script to dry-run. Use output.set(key, value) to return results.",
        },
        refIds: {
          type: "array",
          items: { type: "string" },
          description: "Optional record IDs handed to the script as input.refIds.",
        },
        timeoutMs: {
          type: "number",
          description: "Optional execution timeout in milliseconds.",
        },
      },
      required: ["teamid", "adbid", "script"],
    },
  },
  {
    name: "anydb_validate_script",
    description:
      "Check that a script parses and passes the sandbox's safety rules, WITHOUT running any of it. Cheapest way to catch a syntax error or a blocked construct (process, globalThis, require, eval, Function, tight infinite loops, a loop body with no await) before spending a simulate. It proves nothing about what the script would do - use anydb_simulate_script for that.",
    inputSchema: {
      type: "object",
      properties: {
        script: { type: "string", description: "The script to check." },
      },
      required: ["script"],
    },
  },
  {
    name: "anydb_list_record_versions",
    description:
      "List the saved versions of a record - every point at which it was changed, with the timestamp and who changed it. Use it to answer \"what happened to this record\", and as the first step in recovering content that was overwritten or lost: the timestamps it returns are the only values anydb_get_record_version accepts. NOTE THIS NEEDS DELETE PERMISSION ON THE RECORD, not just read - the server treats history as a stronger privilege than the current content, so a caller who can read a record may still be refused here.",
    inputSchema: {
      type: "object",
      properties: {
        teamid: { type: "string", description: "The team ID." },
        adbid: { type: "string", description: "The database ID." },
        adoid: { type: "string", description: "The record ID." },
      },
      required: ["teamid", "adbid", "adoid"],
    },
  },
  {
    name: "anydb_get_record_version",
    description:
      "Fetch a record as it stood at one point in its history, in the same shape get_record returns. This is how you read content that no longer exists on the record - an overwritten cell, or comments removed by a migration. Pass a ts taken from anydb_list_record_versions; a timestamp that matches no version is REJECTED rather than answered, because the underlying replay would otherwise hand back the record as it is today and you would have no way to tell.",
    inputSchema: {
      type: "object",
      properties: {
        teamid: { type: "string", description: "The team ID." },
        adbid: { type: "string", description: "The database ID." },
        adoid: { type: "string", description: "The record ID." },
        ts: {
          type: "number",
          description:
            "Version timestamp, exactly as returned by anydb_list_record_versions.",
        },
      },
      required: ["teamid", "adbid", "adoid", "ts"],
    },
  },
  {
    name: "anydb_get_record_version_delta",
    description:
      "Fetch only what CHANGED at one version, rather than the whole record. Use it to answer \"what did this edit actually do\" without diffing two full records yourself. Same timestamp rules as anydb_get_record_version.",
    inputSchema: {
      type: "object",
      properties: {
        teamid: { type: "string", description: "The team ID." },
        adbid: { type: "string", description: "The database ID." },
        adoid: { type: "string", description: "The record ID." },
        ts: {
          type: "number",
          description:
            "Version timestamp, exactly as returned by anydb_list_record_versions.",
        },
      },
      required: ["teamid", "adbid", "adoid", "ts"],
    },
  },
  {
    name: "anydb_revert_record_to_version",
    description:
      "Restore a record to the state it had at an earlier version. THIS OVERWRITES THE RECORD'S CURRENT CONTENT: anything added since that version is removed from the record as it stands now - this REPLACES, it does not merge. Do not reach for it to recover one lost field, because it will take everything else back with it; read the old value with anydb_get_record_version and write just that field with update_record instead. Reverting is append-only, so the state you overwrite is still readable in the history afterwards and a mistaken revert can itself be reverted. Pass a ts from anydb_list_record_versions; an unknown one is rejected rather than silently doing nothing. Needs permission to both read the record's history and update the record.",
    inputSchema: {
      type: "object",
      properties: {
        teamid: { type: "string", description: "The team ID." },
        adbid: { type: "string", description: "The database ID." },
        adoid: { type: "string", description: "The record to revert." },
        ts: {
          type: "number",
          description:
            "Version timestamp to restore, exactly as returned by anydb_list_record_versions.",
        },
      },
      required: ["teamid", "adbid", "adoid", "ts"],
    },
  },
  {
    name: "anydb_get_permissions",
    description:
      "Report what a user may do with a team, database, or record: read it, update it, delete it, add records underneath it, and share it. Omit userid to ask about the authenticated user. Read the `can` block for the answer; the raw permission matrix is included for detail. Note that being able to update a record and being able to add records under it are independent — see anydb://guides/permissions/v1.",
    inputSchema: {
      type: "object",
      properties: {
        teamid: {
          type: "string",
          description: "The team ID. Get from list_teams.",
        },
        adbid: {
          type: "string",
          description:
            "Database ID. Omit to ask about the team itself.",
        },
        adoid: {
          type: "string",
          description:
            "Record ID. Omit to ask about the database or team.",
        },
        userid: {
          type: "string",
          description:
            "Whose access to report. Defaults to the authenticated user. Refused unless you can already read the resource.",
        },
      },
      required: ["teamid"],
    },
  },
  {
    name: "anydb_check_permissions",
    description:
      "Check specific permission type/level pairs for a user on a team, database, or record — for example OBJECT_ATTACHED at PERM_CREATE to ask whether they may add records underneath it. Use anydb_get_permissions instead when you want the whole picture. Permission names and what they mean are in anydb://guides/permissions/v1.",
    inputSchema: {
      type: "object",
      properties: {
        teamid: { type: "string", description: "The team ID." },
        adbid: { type: "string", description: "Database ID, when asking about a database or record." },
        adoid: { type: "string", description: "Record ID, when asking about a record." },
        userid: {
          type: "string",
          description: "Whose access to check. Defaults to the authenticated user.",
        },
        checks: {
          type: "array",
          description: "Up to 50 permission questions.",
          items: {
            type: "object",
            properties: {
              permission: {
                type: "string",
                description:
                  "Permission type, e.g. OBJECT_SELF, OBJECT_ATTACHED, OBJECT_SHARE, DB_SELF, DB_ATTACHED, TEAM_SELF.",
              },
              level: {
                type: "string",
                description:
                  "PERM_READ, PERM_CREATE, PERM_UPDATE, PERM_DELETE, or PERM_ALL.",
              },
            },
            required: ["permission", "level"],
          },
        },
      },
      required: ["teamid", "checks"],
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
      "List ADOs (records) in a database. Use parentid with a normal record ID to list its children. You can also filter directly by template and use pagination for large result sets.",
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
            "Optional parent record or View ADO ID (MongoDB ObjectId). A record ID lists direct children. A View ID applies the View's stored criteria; omit templatename and filter in that case. If not provided, root database records are returned.",
        },
        templatename: {
          type: "string",
          description:
            "Optional stable template name to filter records by type. The backend resolves it to the latest template version.",
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
      "Create a new AnyDB record in a specific database. You can optionally attach it to one or more parent records or use a template. AnyDB records support multiple parents, so attach accepts either a single parent ID or an array of parent IDs.",
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
          oneOf: [
            { type: "string" },
            { type: "array", items: { type: "string" } },
          ],
          description:
            "Optional. Parent record IDs (MongoDB ObjectIds). AnyDB records can have more than one parent: pass a single ID for one parent, or an array to attach the record to several parents at once. Omit to create the record at the database root.",
        },
        templatename: {
          type: "string",
          description:
            "Optional stable template/type name. Use the exact workspace type name returned by list_templates or anydb_get_type_definition; do not provide a template ID.",
        },
        content: {
          type: "object",
          description:
            'Optional cell updates keyed by grid position. Each value must be an object, for example {"A1": {"value": "Main Warehouse"}, "D3": {"value": true}}. Existing key, type, format, and props are preserved from the selected template.',
          additionalProperties: {
            type: "object",
          },
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
              attach: {
                oneOf: [
                  { type: "string" },
                  { type: "array", items: { type: "string" } },
                ],
                description:
                  "Optional parent record ID, or an array of parent IDs to attach this record to several parents at once.",
              },
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
    description:
      "Update an existing AnyDB record's metadata and content. Formulas run on write, and the response is the record after evaluation, so computed cells, property expressions, and the record name it returns are already current - do not follow this with a read to see them, and never compute a formula-owned cell yourself and write the result in. This is also the tool that changes a record's parents: meta.attach sets the record's complete parent list, so it is how you attach one record to several parents. Use move_record only for a single-parent reassignment. THREE meta fields are not inert bookkeeping and reach the outside world: meta.assignees emails the people you add, right now; meta.followup schedules an email for later; meta.locked blocks every later write to this record, including your own. Read their descriptions before setting any of them, and do not set them to record your own working state. And meta is not the grid: every meta field is record-level and never touches a cell, even where the names line up. A type's Status or Assigned To field is data in `content`, so when the user asks you to change a record's status or its assignee, they almost always mean that cell - check the record's layout before reaching for meta.",
    inputSchema: {
      type: "object",
      properties: {
        meta: {
          type: "object",
          description:
            "Record metadata including adoid, adbid, teamid, and optional fields like name, description, status, attach, etc. Only the keys you supply are changed; omitted keys are left as they are.",
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
              description:
                "Optional reminder time, as epoch MILLISECONDS. SENDS REAL EMAIL: when that time arrives a follow-up reminder email and an in-app notification go to everyone currently in meta.assignees (group members included). It is not a note to yourself and there is no dry run - do not set it to track your own scheduling. With no assignees on the record nothing is sent at all, so the two fields are only meaningful together. Pass 0 to cancel a pending reminder; null and \"\" are ignored and leave it scheduled. The repeat schedule (followuprepeat) and the last-fired stamp (followedup) cannot be set through this API - a reminder set here fires once.",
            },
            locked: {
              type: "boolean",
              description:
                "Optional. LOCKS YOU OUT: with locked true the server refuses every later write to this record - cell content AND metadata, so even a rename fails - with error 24005 'ADO is locked, update failed'. The only write it accepts is one that passes locked false, which may carry the change in the same call. If the record has a LOCKED_ACCESS rule the unlock itself can be refused, in which case you cannot undo it. This is an editing lock, not a permission: workflow scripts and incoming webhooks still write through it. Set it only when the user asked for the record to be locked.",
            },
            status: {
              type: "string",
              enum: ["NOT_SET", "OPEN", "CLOSED"],
              description:
                "Optional. NOT the record's Status field. This is a separate three-value flag shown in the record header next to Assign and Follow-up, and it is the same three values on every record in AnyDB: NOT_SET, OPEN, CLOSED (exactly, uppercase). Most types define their own Status field in the grid, with whatever options the type's designer chose - 'In Progress', 'Shipped', 'Resolved'. That field is ordinary cell data and this flag is not a copy of it: setting one never changes the other, and neither is wrong. TO CHANGE WHAT A RECORD'S STATUS FIELD SAYS, WRITE THE CELL through `content`, not this. Sending a Status field's value here (\"Closed\", \"Resolved\") is rejected - it is not one of the three.",
            },
            attach: {
              oneOf: [
                { type: "string" },
                { type: "array", items: { type: "string" } },
              ],
              description:
                "Optional parent record IDs (MongoDB ObjectIds). AnyDB records can have multiple parents, so pass an array to attach this record to several parents. The value REPLACES the record's complete parent list, so include every existing parent that must stay attached plus any new ones — read the record's current parents first. Omit attach entirely to leave the parents unchanged; never pass an empty array. To detach from specific parents instead, use delete_record with removefromids.",
            },
            assignees: {
              type: "object",
              description:
                "Optional. SENDS REAL EMAIL, IMMEDIATELY: everyone you ADD here gets an assignment email and an in-app notification during this call, and the record appears in their Inbox until they are unassigned. Groups expand to every member. Only newly added people are notified; assigning yourself notifies nobody. Ask the user before assigning a record to someone else. KNOWN DEFECT: the change is applied only when the NUMBER of assignees changes, so replacing one user with another one-for-one is silently dropped - no error, and the previous assignee stays. To swap, clear the list first with empty arrays, then assign in a second call. Like meta.status, this is record-level and separate from the grid: a type's own person field - 'Assigned To', 'Owner', 'Reviewer' - is ordinary cell data that this does not touch, and writing that cell does not assign anybody. If the user means the field, write the cell through `content`.",
              properties: {
                users: {
                  type: "array",
                  items: { type: "string" },
                  description:
                    "User IDs. REPLACES the current list rather than adding to it, so include everyone who must stay assigned.",
                },
                groups: {
                  type: "array",
                  items: { type: "string" },
                  description:
                    "Group IDs. REPLACES the current list. Every member of every group listed is notified and gets the record in their Inbox.",
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
      "Update up to 100 records in one request. Processing uses bounded concurrency and returns an ordered result for every input; failures do not roll back successful updates. Use clientref to correlate results. meta.assignees, meta.followup and meta.locked carry the same outside-world consequences here as in update_record, multiplied by the batch: a hundred records assigned is a hundred emails sent at once, and there is no rollback once they are out. See update_record for what each field does.",
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
                  followup: {
                    type: "number",
                    description:
                      "Epoch milliseconds. Schedules a real reminder email to this record's assignees. 0 cancels. See update_record.",
                  },
                  locked: {
                    type: "boolean",
                    description:
                      "true blocks every later write to this record until an update passes false. See update_record.",
                  },
                  status: {
                    type: "string",
                    enum: ["NOT_SET", "OPEN", "CLOSED"],
                    description:
                      "The record-level OPEN/CLOSED flag, not the record's Status field. See update_record.",
                  },
                  attach: {
                    oneOf: [
                      { type: "string" },
                      { type: "array", items: { type: "string" } },
                    ],
                    description:
                      "Optional parent record ID, or an array of parent IDs. Replaces the record's complete parent list; include every parent that must stay attached.",
                  },
                  assignees: {
                    type: "object",
                    description:
                      "Emails everyone added, immediately, once per record in the batch. See update_record.",
                  },
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
      "Move an existing AnyDB record so that the supplied parent becomes its ONLY parent. This is a single-parent reassignment: it replaces the record's entire parent list with parentid, detaching it from every other parent it currently has. Use it to reorganize a single-parent hierarchy. To attach a record to several parents, or to add a parent while keeping the existing ones, use update_record with meta.attach as an array instead.",
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
            "The target parent record ID to move this record under (MongoDB ObjectId). The record becomes a child of this parent and is detached from all of its current parents.",
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
    name: "anydb_create_report",
    description:
      "Create a saved report in a database. A report is a grouped, aggregated view over one type - the Reports tab in the product. Use validateOnly: true to check a definition without creating anything; the definition is checked with the same rules the report runtime enforces, so what this accepts is what will actually run.",
    inputSchema: {
      type: "object",
      properties: {
        teamid: { type: "string", description: "The team ID (MongoDB ObjectId)" },
        adbid: {
          type: "string",
          description: "The database ID (MongoDB ObjectId)",
        },
        name: { type: "string", description: "The report's display name." },
        definition: { type: "object", description: "The report definition. templateName (required) is the stable type name the report runs over. groupBy is an array of dimensions - a field key, or {field, dateInterval} where dateInterval is day|week|month|quarter|year and only valid on a date field. selectedFields lists the field keys to show. metrics is an array of {field, operation, alias?} where operation is sum|avg|min|max|count. Optional: filterExpression (Lucene-style, quote literals containing spaces), includeSubtotals, includeGrandTotal (both need at least one metric), maxCandidateRecords, maxGroups, maxCellDocs (positive integers), and timezone (an IANA zone such as America/New_York; defaults to UTC and decides where day/week/month boundaries fall). The same field cannot be grouped twice when either occurrence is a date bucket." },
        validateOnly: {
          type: "boolean",
          description:
            "Validate the definition and return without creating the report.",
        },
      },
      required: ["teamid", "adbid", "name", "definition"],
    },
  },
  {
    name: "anydb_list_reports",
    description:
      "List the saved reports in a database, with their ids and names. Call this before creating one so an equivalent report is reused rather than duplicated.",
    inputSchema: {
      type: "object",
      properties: {
        teamid: { type: "string", description: "The team ID (MongoDB ObjectId)" },
        adbid: {
          type: "string",
          description: "The database ID (MongoDB ObjectId)",
        },
      },
      required: ["teamid", "adbid"],
    },
  },
  {
    name: "anydb_get_report",
    description:
      "Read one report's complete definition. Returns an error if the id is a record that is not a report.",
    inputSchema: {
      type: "object",
      properties: {
        teamid: { type: "string", description: "The team ID (MongoDB ObjectId)" },
        adbid: {
          type: "string",
          description: "The database ID (MongoDB ObjectId)",
        },
        reportId: {
          type: "string",
          description: "The report ID, from anydb_list_reports.",
        },
      },
      required: ["teamid", "adbid", "reportId"],
    },
  },
  {
    name: "anydb_update_report",
    description:
      "Rename a report, replace its definition, or both. Sending a definition REPLACES the whole definition - include every part that should remain. Omit definition to rename only.",
    inputSchema: {
      type: "object",
      properties: {
        teamid: { type: "string", description: "The team ID (MongoDB ObjectId)" },
        adbid: {
          type: "string",
          description: "The database ID (MongoDB ObjectId)",
        },
        reportId: {
          type: "string",
          description: "The report ID, from anydb_list_reports.",
        },
        name: { type: "string", description: "A new display name." },
        definition: { type: "object", description: "The report definition. templateName (required) is the stable type name the report runs over. groupBy is an array of dimensions - a field key, or {field, dateInterval} where dateInterval is day|week|month|quarter|year and only valid on a date field. selectedFields lists the field keys to show. metrics is an array of {field, operation, alias?} where operation is sum|avg|min|max|count. Optional: filterExpression (Lucene-style, quote literals containing spaces), includeSubtotals, includeGrandTotal (both need at least one metric), maxCandidateRecords, maxGroups, maxCellDocs (positive integers), and timezone (an IANA zone such as America/New_York; defaults to UTC and decides where day/week/month boundaries fall). The same field cannot be grouped twice when either occurrence is a date bucket." },
        validateOnly: {
          type: "boolean",
          description: "Validate without saving.",
        },
      },
      required: ["teamid", "adbid", "reportId"],
    },
  },
  {
    name: "anydb_add_comment",
    description:
      "Post a comment on a record, or on one cell of it. Use this rather than writing into a record's comments through update_record: the author is the authenticated user and cannot be set by the caller, the id and timestamp are assigned by the server, and mention notifications fire. Omit cellPosition to comment on the record itself; pass a grid position such as 'A8' to comment on that one cell. Returns the new commentId.",
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
          description: "The record ID (MongoDB ObjectId) to comment on.",
        },
        text: {
          type: "string",
          description:
            "The comment text. Mention someone with [Name](user://<userid>), which is what triggers their notification.",
        },
        cellPosition: {
          type: "string",
          description:
            "Optional grid position such as 'A8'. Given, the comment attaches to that cell's own thread; omitted, it attaches to the record.",
        },
      },
      required: ["teamid", "adbid", "adoid", "text"],
    },
  },
  {
    name: "anydb_resolve_comment",
    description:
      "Mark a comment resolved, or reopen it with resolved: false. The comment's text is preserved. Scope must match where the comment lives: pass the same cellPosition used to create it, or omit it for a record-level comment - a record-level lookup will not find a comment that lives on a cell.",
    inputSchema: {
      type: "object",
      properties: {
        teamid: { type: "string", description: "The team ID (MongoDB ObjectId)" },
        adbid: {
          type: "string",
          description: "The database ID (MongoDB ObjectId)",
        },
        adoid: {
          type: "string",
          description: "The record ID (MongoDB ObjectId) the comment is on",
        },
        commentId: {
          type: "string",
          description:
            "The comment's id, as returned by anydb_add_comment or read from the record.",
        },
        cellPosition: {
          type: "string",
          description:
            "The cell position the comment lives on, if it is a cell comment. Omit for a record-level comment.",
        },
        resolved: {
          type: "boolean",
          description:
            "Defaults to true. Pass false to reopen a resolved comment.",
        },
      },
      required: ["teamid", "adbid", "adoid", "commentId"],
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
      "Fallback upload for callers that cannot issue an HTTP PUT. Prefer prepare_file_upload + complete_file_upload for files of ANY size: this tool runs that identical flow server-side, so the only thing the inline path adds is a base64 payload that inflates the content ~33% and spends that inflation in your own context budget. Size is not the deciding factor; whether you can PUT is. Creates a separate child File record attached to the supplied parent adoid; it does not write into the parent record's content. Base64 is the default encoding; set contentEncoding to 'utf8' for plain text.",
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
      "The standard way to upload a file of ANY size. Creates a child File record under the parent adoid and returns { url, adoid, cellpos, contentType }. PUT the raw bytes to url, sending the returned contentType as the Content-Type header, then call complete_file_upload with the adoid RETURNED HERE - that is the File record, not the parent you passed in. The bytes go straight to storage and never enter your context.",
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
      "Finalize a signed-URL upload once the PUT has succeeded. Pass the adoid that prepare_file_upload returned - the File record it created - not the parent adoid you gave prepare_file_upload, and the same filesize and cellpos. Until this is called the File record exists but has no usable content.",
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

/** What list_teams returns by default. */
export interface TeamSummary {
  teamid: string;
  name: string;
  plan?: string;
}

/**
 * Reduce a team to what a caller actually chooses between.
 *
 * The ext API returns the whole team document, and most of it is the ACL: a
 * permission bitmask per group and per user, per team. Ten teams came to
 * roughly 69,000 characters, nearly all of it unreadable to a model and
 * unusable as an answer to "which team?". That cost is paid on the first call
 * of most sessions, since list_teams is where every other id comes from.
 *
 * The full document is still one flag away, so nothing is lost — it just is
 * not the default any more.
 */
export function summariseTeam(team: Record<string, any>): TeamSummary {
  const plan = team?.license?.planName;
  return {
    teamid: String(team?.teamid ?? ""),
    name: String(team?.name ?? ""),
    ...(typeof plan === "string" && plan ? { plan } : undefined),
  };
}

export function createMcpServer({
  apiKey,
  userEmail,
  accessToken,
  token,
  baseURL,
  originClient,
}: {
  /** Legacy API-key auth. Ignored when accessToken is present. */
  apiKey?: string;
  userEmail?: string;
  /** OAuth 2.1 bearer token, forwarded verbatim to the ext API. */
  accessToken?: string;
  /**
   * Claims from that token, already verified by the caller.
   *
   * Carried so anydb_whoami can answer from a credential that has actually
   * been checked, rather than decoding the token again and trusting whatever
   * it says.
   */
  token?: VerifiedToken;
  baseURL?: string;
  /**
   * Client this server is acting for, when the caller already knows it.
   *
   * The streamable-HTTP transport is stateless -- a server is built per POST,
   * so a tool call arrives on a server that never saw an initialize and whose
   * oninitialized therefore never fires. That path passes the identity from
   * the HTTP request instead. Over stdio the handshake does run, and
   * oninitialized replaces this with the richer clientInfo.
   */
  originClient?: string;
}) {
  const extApiClient = new ExtApiClient({
    apiKey,
    userEmail,
    accessToken,
    baseURL: baseURL || config.anydbApiBaseUrl,
    originClient,
    clientVersion: config.serverVersion,
  });

  // Mirrors what the ext client is sending, so anydb_whoami can report who
  // this service is acting for without reaching into the client's internals.
  let actingFor = originClient;

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
        prompts: {},
      },
      instructions: `For installation, credentials, client configuration, or connection troubleshooting, read ${ANYDB_SETUP_GUIDE_URI} or call anydb_get_setup_guide. Before authoring an AnyDB type or solution, read ${SOLUTION_BUILDING_GUIDE_URI} and anydb://schemas/solution-authoring/v1. A task may require one standalone type or a coordinated multi-type solution. Match the requested scope and never invent related types or workflows merely to broaden a standalone-type task. Design the requested artifacts first, discover and reuse compatible workspace or built-in types, create dependencies in order when present, and create workflows last only when automation is required. Do not mutate types or workflows until the relevant guidance has been read.`,
    },
  );

  // The client names itself during initialize, which is the only point this
  // service learns whether it is serving Claude.ai, Claude Desktop, Cursor or
  // something else. Forward that on to AnyDB so an API call can be attributed
  // to the client that actually asked, not just to this proxy.
  server.oninitialized = () => {
    const client = server.getClientVersion();
    if (!client?.name) return;
    const identity = client.version
      ? `${client.name}/${client.version}`
      : client.name;
    extApiClient.setOriginClient(identity);
    actingFor = identity;
    console.error(`[anydb-mcp] serving MCP client ${identity}`);
  };

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: listSolutionResources(),
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => ({
    contents: [readSolutionResource(request.params.uri)],
  }));

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: listSolutionPrompts(),
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (request) =>
    getSolutionPrompt(request.params.name, request.params.arguments),
  );

  // Handle list tools request
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  // Handle tool execution
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // Log incoming MCP request
    const loggedArgs = isSemanticSearchTool(name)
      ? { ...args, query: args?.query ? "[REDACTED]" : undefined }
      : args;
    console.error(`\n========== MCP Tool Request ==========`);
    console.error(`Tool: ${name}`);
    console.error(`Arguments:`, JSON.stringify(loggedArgs, null, 2));
    console.error(`======================================\n`);

    try {
      if (isSetupTool(name)) {
        return callSetupTool(name);
      }

      // Ahead of the credential gate, like the setup guide: "nothing is
      // connected" is one of the answers this tool exists to give, and a
      // diagnostic that only runs once you are already authenticated cannot
      // help you find out why you are not.
      if (isIdentityTool(name)) {
        return callIdentityTool(name, {
          token,
          apiKey,
          userEmail,
          originClient: actingFor,
          serverName: config.serverName,
          serverVersion: config.serverVersion,
          apiBaseUrl: baseURL || config.anydbApiBaseUrl,
        });
      }

      // An OAuth bearer is a complete credential on its own. Requiring the
      // API-key pair regardless meant an authenticated OAuth session was told
      // to go configure ANYDB_DEFAULT_API_KEY — advice that cannot apply to a
      // hosted client, which has no environment to set it in.
      if (!accessToken && (!apiKey || !userEmail)) {
        throw new Error(
          "AnyDB credentials are not configured. Call anydb_get_setup_guide, then either connect this client over OAuth or set ANYDB_DEFAULT_API_KEY and ANYDB_DEFAULT_USER_EMAIL in the MCP client environment and restart the client.",
        );
      }

      if (isSolutionAuthoringTool(name)) {
        return await callSolutionAuthoringTool(name, args, extApiClient);
      }

      if (isSolutionDiscoveryTool(name)) {
        return await callSolutionDiscoveryTool(name, args, extApiClient);
      }

      if (isSemanticSearchTool(name)) {
        return await callSemanticSearchTool(args, extApiClient);
      }

      switch (name) {
        case "list_templates": {
          const teamid = args?.teamid as string;
          const adbid = args?.adbid as string;
          if (!teamid || !adbid) {
            throw new Error("teamid and adbid are required");
          }
          const templates = await extApiClient.listTemplates(teamid, adbid);
          return {
            content: [
              { type: "text", text: JSON.stringify(templates, null, 2) },
            ],
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
            content: [
              { type: "text", text: JSON.stringify(template, null, 2) },
            ],
          };
        }

        case "get_record": {
          const teamid = args?.teamid as string;
          const adbid = args?.adbid as string;
          const adoid = args?.adoid as string;
          if (!teamid || !adbid || !adoid) {
            throw new Error("teamid, adbid, and adoid are required");
          }
          const record = await extApiClient.getRecord(teamid, adbid, adoid);
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
          const teams = await extApiClient.listTeams();
          const raw = args?.includeRawTeamMetadata === true;
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  raw ? teams : teams.map(summariseTeam),
                  null,
                  2,
                ),
              },
            ],
          };
        }

        case "anydb_get_permissions": {
          const permissions = await extApiClient.getEffectivePermissions({
            teamid: args?.teamid as string,
            adbid: args?.adbid as string | undefined,
            adoid: args?.adoid as string | undefined,
            userid: args?.userid as string | undefined,
          });
          return {
            content: [
              { type: "text", text: JSON.stringify(permissions, null, 2) },
            ],
          };
        }

        case "anydb_check_permissions": {
          const checks = args?.checks as
            | Array<{ permission: string; level: string }>
            | undefined;
          if (!Array.isArray(checks) || checks.length === 0) {
            throw new Error("checks must be a non-empty array");
          }
          const result = await extApiClient.checkPermissions({
            teamid: args?.teamid as string,
            adbid: args?.adbid as string | undefined,
            adoid: args?.adoid as string | undefined,
            userid: args?.userid as string | undefined,
            checks,
          });
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        case "list_databases_for_team": {
          const teamid = args?.teamid as string;
          if (!teamid) {
            throw new Error("teamid is required");
          }
          const databases = await extApiClient.listDatabasesForTeam(teamid);
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
          const records = await extApiClient.listRecords({
            teamid,
            adbid,
            parentid,
            templatename,
            pagesize,
            lastmarker,
            filter,
          });
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
            attach: args?.attach as string | string[] | undefined,
            templatename: args?.templatename as string | undefined,
            content: args?.content as Record<string, any> | undefined,
          };
          const record = await extApiClient.createRecord(params);
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
            attach?: string | string[];
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
          const current = await extApiClient.getRecord(
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
          const record = await extApiClient.updateRecord(params);
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
            const current = await extApiClient.getRecord(
              record.meta.teamid,
              record.meta.adbid,
              record.meta.adoid,
            );
            normalizedRecords.push({
              ...record,
              content: normalizeRecordContent(current, record.content),
            });
          }
          const result =
            await extApiClient.bulkUpdateRecords(normalizedRecords);
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
          const result = await extApiClient.removeRecord(params);
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
              (args?.attachmentsmode as
                "noattachments" | "link" | "duplicate") || "link",
          };
          const result = await extApiClient.copyRecord(params);
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
          const result = await extApiClient.moveRecord(params);
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
          const results = await extApiClient.searchRecords(params);
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

          const databases = await extApiClient.listDatabasesForTeam(teamid);
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
              const records = await extApiClient.searchRecords({
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
          const result = await extApiClient.downloadFile({
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
            (args?.contentEncoding as "base64" | "utf8" | undefined) ||
            "base64";

          const content = Buffer.from(fileContent, contentEncoding);

          const result = await extApiClient.uploadFile({
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

        case "anydb_create_report": {
          const result = await extApiClient.createReport({
            teamid: args?.teamid as string,
            adbid: args?.adbid as string,
            name: args?.name as string,
            definition: args?.definition as Record<string, unknown>,
            validateOnly: args?.validateOnly as boolean | undefined,
          });
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        case "anydb_list_views": {
          const result = await extApiClient.listListingTabs({
            teamid: args?.teamid as string,
            adbid: args?.adbid as string,
            templateName: args?.templateName as string,
          });
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        case "anydb_create_view": {
          const result = await extApiClient.createListingTab({
            teamid: args?.teamid as string,
            adbid: args?.adbid as string,
            templateName: args?.templateName as string,
            tab: args?.view as Record<string, unknown>,
          });
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        case "anydb_update_view": {
          const result = await extApiClient.updateListingTab({
            teamid: args?.teamid as string,
            adbid: args?.adbid as string,
            templateName: args?.templateName as string,
            name: args?.name as string,
            changes: args?.changes as Record<string, unknown>,
          });
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        case "anydb_delete_view": {
          const result = await extApiClient.deleteListingTab({
            teamid: args?.teamid as string,
            adbid: args?.adbid as string,
            templateName: args?.templateName as string,
            name: args?.name as string,
          });
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        case "anydb_generate_document": {
          const result = await extApiClient.generateDocument({
            teamid: args?.teamid as string,
            adbid: args?.adbid as string,
            docgenId: args?.docgenId as string,
            adoid: args?.adoid as string,
            ...(args?.attachTo ? { attachTo: args.attachTo as string } : {}),
            ...(args?.asPdf !== undefined
              ? { asPdf: args.asPdf as boolean }
              : {}),
          });
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        case "anydb_list_docgen_templates": {
          const result = await extApiClient.listDocGenTemplates({
            teamid: args?.teamid as string,
            adbid: args?.adbid as string,
            ...(args?.templateName
              ? { templateName: args.templateName as string }
              : {}),
          });
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        case "anydb_create_docgen_template": {
          const result = await extApiClient.createDocGenTemplate({
            teamid: args?.teamid as string,
            adbid: args?.adbid as string,
            templateName: args?.templateName as string,
            fileRecordId: args?.fileRecordId as string,
            name: args?.name as string,
          });
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        case "anydb_update_docgen_template": {
          const result = await extApiClient.updateDocGenTemplate({
            teamid: args?.teamid as string,
            adbid: args?.adbid as string,
            docgenId: args?.docgenId as string,
            templateName: args?.templateName as string,
            fileRecordId: args?.fileRecordId as string,
            name: args?.name as string,
          });
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        case "anydb_delete_docgen_template": {
          const result = await extApiClient.deleteDocGenTemplate({
            teamid: args?.teamid as string,
            adbid: args?.adbid as string,
            docgenId: args?.docgenId as string,
          });
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        case "anydb_validate_script": {
          const result = await extApiClient.validateScript({
            script: args?.script as string,
          });
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        case "anydb_simulate_script": {
          const result = await extApiClient.simulateScript({
            teamid: args?.teamid as string,
            adbid: args?.adbid as string,
            script: args?.script as string,
            refIds: args?.refIds as string[] | undefined,
            timeoutMs: args?.timeoutMs as number | undefined,
          });
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        case "anydb_run_script": {
          const result = await extApiClient.runScript({
            teamid: args?.teamid as string,
            adbid: args?.adbid as string,
            script: args?.script as string,
            runToken: args?.runToken as string,
            refIds: args?.refIds as string[] | undefined,
            timeoutMs: args?.timeoutMs as number | undefined,
          });
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        case "anydb_list_record_versions": {
          const result = await extApiClient.listRecordVersions({
            teamid: args?.teamid as string,
            adbid: args?.adbid as string,
            adoid: args?.adoid as string,
          });
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        case "anydb_get_record_version": {
          const result = await extApiClient.getRecordVersion({
            teamid: args?.teamid as string,
            adbid: args?.adbid as string,
            adoid: args?.adoid as string,
            ts: Number(args?.ts),
          });
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        case "anydb_get_record_version_delta": {
          const result = await extApiClient.getRecordVersionDelta({
            teamid: args?.teamid as string,
            adbid: args?.adbid as string,
            adoid: args?.adoid as string,
            ts: Number(args?.ts),
          });
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        case "anydb_revert_record_to_version": {
          const result = await extApiClient.revertRecordToVersion({
            teamid: args?.teamid as string,
            adbid: args?.adbid as string,
            adoid: args?.adoid as string,
            ts: Number(args?.ts),
          });
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        case "anydb_get_inbox": {
          const result = await extApiClient.listInbox({
            teamid: args?.teamid as string,
          });
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        case "anydb_list_reports": {
          const result = await extApiClient.listReports({
            teamid: args?.teamid as string,
            adbid: args?.adbid as string,
          });
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        case "anydb_get_report": {
          const result = await extApiClient.getReport({
            teamid: args?.teamid as string,
            adbid: args?.adbid as string,
            reportId: args?.reportId as string,
          });
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        case "anydb_update_report": {
          const result = await extApiClient.updateReport({
            teamid: args?.teamid as string,
            adbid: args?.adbid as string,
            reportId: args?.reportId as string,
            name: args?.name as string | undefined,
            definition: args?.definition as Record<string, unknown> | undefined,
            validateOnly: args?.validateOnly as boolean | undefined,
          });
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        case "anydb_add_comment": {
          const result = await extApiClient.addComment({
            teamid: args?.teamid as string,
            adbid: args?.adbid as string,
            adoid: args?.adoid as string,
            text: args?.text as string,
            cellPosition: args?.cellPosition as string | undefined,
          });
          return {
            content: [
              { type: "text", text: JSON.stringify(result, null, 2) },
            ],
          };
        }

        case "anydb_resolve_comment": {
          const result = await extApiClient.resolveComment({
            teamid: args?.teamid as string,
            adbid: args?.adbid as string,
            adoid: args?.adoid as string,
            commentId: args?.commentId as string,
            cellPosition: args?.cellPosition as string | undefined,
            resolved: args?.resolved as boolean | undefined,
          });
          return {
            content: [
              { type: "text", text: JSON.stringify(result, null, 2) },
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

          const fileRecord = await extApiClient.createRecord({
            name: filename,
            teamid,
            adbid,
            attach: parentAdoid,
            template: FILE_TEMPLATE_ADOID,
          });
          const fileAdoid = fileRecord.meta.adoid;
          const url = await extApiClient.getUploadUrl({
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
          const completed = await extApiClient.completeUpload({
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
      const errorMessage =
        error instanceof Error ? error.message : String(error);
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

  return server;
}
