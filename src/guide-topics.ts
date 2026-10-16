/**
 * ISSUE - 671: the authoring-guide topic that explains each tool's rules, named
 * in that tool's error so a client that skipped the guide has a way back.
 * Comma-separated topics are fetched together. Every name must be a `## `
 * section of resources/solution-building-v1.md (guidance-both-profiles.test.ts).
 */
const TYPES = "cells,formulas";
const READING = "reading-and-analysis";
export const TOOL_GUIDE_TOPICS: Record<string, string> = {
  anydb_create_type: TYPES,
  anydb_update_type: TYPES,
  create_record: "cells",
  update_record: "cells",
  bulk_create_records: "cells",
  bulk_update_records: "cells",
  get_record: READING,
  list_records: READING,
  search_records: READING,
  search_team_records: READING,
  anydb_semantic_search: READING,
  anydb_simulate_script: READING,
  anydb_run_script: READING,
  anydb_create_view: "views",
  anydb_update_view: "views",
  anydb_create_share: "sharing",
  anydb_update_share: "sharing",
  anydb_create_report: "reports",
  anydb_update_report: "reports",
  anydb_run_report: "reports",
  anydb_create_workflow: "workflows",
  anydb_update_workflow: "workflows",
  anydb_execute_workflow: "workflows",
  anydb_add_comment: "comments",
  prepare_file_upload: "file-uploads",
  upload_file: "file-uploads",
  complete_file_upload: "file-uploads",
  anydb_create_inbound_webhook: "receiving-form-submissions-inbound-webhooks",
  anydb_start_form_submission: "receiving-shared-records-and-forms",
  anydb_update_form_submission: "receiving-shared-records-and-forms",
  anydb_submit_form_submission: "receiving-shared-records-and-forms",
};

export function guideHint(tool: string): string {
  const topic = TOOL_GUIDE_TOPICS[tool];
  return topic ? `\nThe rules for this call: anydb_get_authoring_guide with topic "${topic}".` : "";
}
