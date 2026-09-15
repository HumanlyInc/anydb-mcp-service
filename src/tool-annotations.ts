import type { Tool, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";

/**
 * MCP tool annotations for every tool this server advertises.
 *
 * Directory reviewers (OpenAI Plugins, the Claude Connectors Directory) reject
 * a server whose tools omit these, and clients use them to decide which calls
 * need the user's confirmation. They are hints, not enforcement, so the rule
 * here is to never understate a tool: when a call CAN overwrite data, remove
 * access, or reach people outside the conversation, it is marked that way even
 * if the common case is harmless.
 *
 * - readOnlyHint: the tool only reads. Nothing in AnyDB changes.
 * - destructiveHint: the tool can replace or remove existing data or access,
 *   so the prior state is not simply still there afterwards.
 * - openWorldHint: the tool's effect leaves the caller's workspace - it sends
 *   email, runs arbitrary automation, or publishes a public link. Everything
 *   else is bounded to the AnyDB workspaces the signed-in user can already see.
 *
 * Every advertised tool must have an entry; a test enforces it.
 */

/** Only reads. */
const reads = (title: string): ToolAnnotations => ({
  title,
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
});

/** Adds something new without replacing or removing anything that exists. */
const adds = (title: string): ToolAnnotations => ({
  title,
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
});

/** Replaces or removes existing data or access inside the workspace. */
const replaces = (title: string): ToolAnnotations => ({
  title,
  readOnlyHint: false,
  destructiveHint: true,
  openWorldHint: false,
});

/** Can replace data AND send email or run automation that leaves AnyDB. */
const replacesAndReachesOut = (title: string): ToolAnnotations => ({
  title,
  readOnlyHint: false,
  destructiveHint: true,
  openWorldHint: true,
});

/** Adds a public link that anyone outside the workspace can open. */
const publishes = (title: string): ToolAnnotations => ({
  title,
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: true,
});

export const TOOL_ANNOTATIONS: Record<string, ToolAnnotations> = {
  // Guides and identity
  anydb_get_setup_guide: reads("Get setup guide"),
  anydb_whoami: reads("Show connected AnyDB identity"),
  anydb_get_authoring_guide: reads("Get solution authoring guide"),

  // Teams, databases, permissions
  list_teams: reads("List teams"),
  list_databases_for_team: reads("List databases in a team"),
  anydb_list_team_groups: reads("List team groups"),
  anydb_get_permissions: reads("Get record permissions"),
  anydb_check_permissions: reads("Check record permissions"),
  anydb_create_workspace: adds("Create workspace"),

  // Records
  list_records: reads("List records"),
  get_record: reads("Get record"),
  search_records: reads("Search records in a database"),
  search_team_records: reads("Search records across a team"),
  anydb_semantic_search: reads("Search records by meaning"),
  anydb_get_inbox: reads("Get my inbox"),
  create_record: adds("Create record"),
  bulk_create_records: adds("Create records in bulk"),
  copy_record: adds("Copy record"),
  // Assigning people emails them now and a follow-up schedules an email.
  update_record: replacesAndReachesOut("Update record"),
  bulk_update_records: replacesAndReachesOut("Update records in bulk"),
  // Replaces the record's entire parent list.
  move_record: replaces("Move record to a new parent"),
  delete_record: replaces("Delete or unlink record"),

  // Record history
  anydb_list_record_versions: reads("List record versions"),
  anydb_get_record_version: reads("Get record version"),
  anydb_get_record_version_delta: reads("Compare record versions"),
  // Overwrites current content; the overwritten state stays in history.
  anydb_revert_record_to_version: replaces("Revert record to a version"),

  // Comments
  anydb_add_comment: adds("Add comment"),
  anydb_resolve_comment: adds("Resolve or reopen comment"),

  // Files
  download_file: reads("Get file download link"),
  upload_file: adds("Upload file"),
  prepare_file_upload: adds("Start file upload"),
  complete_file_upload: adds("Finish file upload"),

  // Types (templates)
  list_templates: reads("List types in a database"),
  get_template: reads("Get type"),
  anydb_discover_types: reads("Discover reusable types"),
  anydb_get_type_definition: reads("Get type definition"),
  anydb_get_type_migration_status: reads("Get type migration status"),
  anydb_create_type: adds("Create type"),
  // Can drop fields, which migrates existing records.
  anydb_update_type: replaces("Update type"),

  // Views
  anydb_list_views: reads("List views"),
  anydb_create_view: adds("Create view"),
  anydb_update_view: replaces("Update view"),
  anydb_delete_view: replaces("Delete view"),

  // Reports
  anydb_list_reports: reads("List reports"),
  anydb_get_report: reads("Get report"),
  anydb_create_report: adds("Create report"),
  // Sending a definition replaces the whole definition.
  anydb_update_report: replaces("Update report"),

  // Document generation
  anydb_list_docgen_templates: reads("List document templates"),
  anydb_create_docgen_template: adds("Create document template"),
  // Implemented as remove-then-add; omitted fields are lost.
  anydb_update_docgen_template: replaces("Update document template"),
  anydb_delete_docgen_template: replaces("Delete document template"),
  // Regenerating supersedes the previous output of the same template.
  anydb_generate_document: replaces("Generate document"),

  // Shares
  anydb_list_shares: reads("List shares"),
  anydb_get_share: reads("Get share"),
  anydb_create_share: publishes("Create share"),
  anydb_revoke_share: replaces("Revoke share"),

  // Workflows
  anydb_list_workflows: reads("List workflows"),
  anydb_get_workflow: reads("Get workflow"),
  anydb_get_workflow_execution_history: reads("Get workflow run history"),
  anydb_list_workflow_triggers: reads("List workflow triggers"),
  anydb_list_workflow_actions: reads("List workflow actions"),
  anydb_create_workflow: adds("Create workflow"),
  // Replaces the complete action chain.
  anydb_update_workflow: replaces("Update workflow"),
  // A workflow's actions can write records and send email.
  anydb_execute_workflow: replacesAndReachesOut("Run workflow"),

  // Scripts
  anydb_validate_script: reads("Validate script"),
  // Reads are real; every write is suppressed and reported as intent.
  anydb_simulate_script: reads("Simulate script"),
  anydb_run_script: replacesAndReachesOut("Run script"),
};

/**
 * Attach each tool's annotations, and mirror the title onto the tool itself,
 * which is where newer clients look for it.
 */
export function annotateTools(tools: Tool[]): Tool[] {
  return tools.map((tool) => {
    const annotations = TOOL_ANNOTATIONS[tool.name];
    if (!annotations) return tool;
    return { ...tool, title: annotations.title, annotations };
  });
}
