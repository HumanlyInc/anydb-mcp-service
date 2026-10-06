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

/** Adds something new, but the effect reaches people outside the workspace (email). */
const addsAndReachesOut = (title: string): ToolAnnotations => ({
  title,
  readOnlyHint: false,
  destructiveHint: false,
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
  // ISSUE - 506: authoring custom workflow agents. Saving replaces a draft (a published revision is immutable);
  // validate and test spend AI tokens and write run records; publishing makes a revision runnable.
  anydb_save_agent: replaces("Save agent draft"),
  anydb_list_agents: reads("List agents"),
  anydb_get_agent: reads("Get agent"),
  anydb_validate_agent: adds("Validate agent"),
  anydb_test_agent: adds("Test agent"),
  anydb_publish_agent: replaces("Publish agent"),
  anydb_list_agent_runs: reads("List agent runs"),
  anydb_get_agent_run: reads("Get agent run"),
  anydb_agent_read_record: reads("Read agent record overlay"),
  anydb_agent_update_fields: replaces("Update scoped agent fields"),
  anydb_agent_set_cell_lock: replaces("Set scoped agent cell lock"),
  anydb_agent_send_email: replacesAndReachesOut("Send scoped agent email"),
  anydb_agent_email_report: addsAndReachesOut("Email scoped report export"),
  anydb_agent_email_document: addsAndReachesOut("Email scoped rendered document"),
  anydb_agent_create_record: { title: "Create scoped agent child record", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  // Guides and identity
  anydb_get_setup_guide: reads("Get setup guide"),
  anydb_whoami: reads("Show connected AnyDB identity"),
  anydb_get_authoring_guide: reads("Get solution authoring guide"),

  // Teams, databases, permissions
  list_teams: reads("List teams"),
  // ISSUE - 418: inbound webhooks. Creating one makes a public URL; replaying adds a record.
  anydb_create_inbound_webhook: publishes("Create inbound webhook"),
  anydb_list_inbound_webhooks: reads("List inbound webhooks"),
  anydb_get_inbound_webhook: reads("Get inbound webhook"),
  anydb_update_inbound_webhook: replaces("Update inbound webhook"),
  anydb_set_inbound_webhook_status: replaces("Set inbound webhook status"),
  anydb_rotate_inbound_webhook_secret: replaces("Rotate inbound webhook secret"),
  // Destructive: it also deletes every stored submission.
  anydb_delete_inbound_webhook: replaces("Delete inbound webhook"),
  anydb_list_inbound_webhook_deliveries: reads("List inbound webhook deliveries"),
  anydb_get_inbound_webhook_delivery: reads("Get inbound webhook delivery"),
  anydb_replay_inbound_webhook_delivery: adds("Replay inbound webhook delivery"),

  // ISSUE - 297: installed apps, read-only.
  anydb_list_apps: reads("List installed apps"),
  anydb_get_app: reads("Get installed app"),
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
  // ISSUE - 471: a comment emails the record's creator and anyone @mentioned.
  anydb_add_comment: addsAndReachesOut("Add comment"),
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
  // ISSUE - 284. Running writes a new snapshot (and clears the previous
  // one); reading and exporting a snapshot read.
  anydb_run_report: replaces("Run report"),
  anydb_get_report_result: reads("Get report result"),
  anydb_export_report: reads("Export report"),
  // ISSUE - 501. Reads a snapshot and emails it to people outside the workspace.
  anydb_email_report: addsAndReachesOut("Email report"),
  anydb_delete_report: replaces("Delete report"),

  // Document generation
  anydb_list_docgen_templates: reads("List document templates"),
  anydb_create_docgen_template: adds("Create document template"),
  // Implemented as remove-then-add; omitted fields are lost.
  anydb_update_docgen_template: replaces("Update document template"),
  anydb_delete_docgen_template: replaces("Delete document template"),
  // Regenerating supersedes the previous output of the same template; with an email block the new
  // document is also mailed to people outside the workspace (ISSUE - 501).
  anydb_generate_document: replacesAndReachesOut("Generate document"),

  // Recipient shared items; finalizing can trigger automation and notifications.
  anydb_list_shared_records: reads("List records shared with me"),
  anydb_get_shared_record: reads("Read shared record"),
  anydb_list_shared_forms: reads("List forms shared with me"),
  anydb_get_shared_form: reads("Inspect shared form"),
  anydb_start_form_submission: { ...adds("Start form submission"), idempotentHint: true },
  anydb_get_form_submission: reads("Read form submission"),
  anydb_update_form_submission: replaces("Update form draft"),
  anydb_submit_form_submission: replacesAndReachesOut("Submit shared form"),

  // Shares
  anydb_list_shares: reads("List shares"),
  anydb_get_share: reads("Get share"),
  // ISSUE - 471: a share exposes content outside the workspace, and revoking it
  // does not undo what recipients already saw, so it is marked destructive too.
  anydb_create_share: replacesAndReachesOut("Create share"),
  // Recipient lists, expiry and child forms are replaced or edited in place, and
  // changing recipients changes who outside the workspace can open the share.
  anydb_update_share: replacesAndReachesOut("Update share"),
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
