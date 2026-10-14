# ISSUE-564: plugin resubmission handoff

Prepared 2026-10-14. This is a submission checklist and proposed reviewer material, not evidence of deployment or OpenAI approval. Both server and MCP changes must be merged, deployed and tested before submission. Do not send credentials in this file, the ticket, chat, or the plugin ZIP.

## Confirm the endpoint transition first

The proposed reviewed endpoint is `https://mcp.anydb.com/reviewed`; verify the final URL after deployment. Default `/` and stdio keep the full MCP tools for existing clients. Do not replace `/` or remove its approved operations to make a scan pass.

OpenAI's [remote MCP review guide](https://developers.openai.com/plugins/deploy/app-review) permits changing only the endpoint path through a new plugin version. Its [submission guide](https://developers.openai.com/plugins/deploy/submission) says existing MCP URL changes currently require support. Ask support which path applies to this existing plugin, supplying its plugin ID, current URL, proposed `/reviewed` URL, rejection/appeal reference and intended package version. Record their answer in ISSUE-564. Do not assume rescanning `/` will review `/reviewed`, or silently reroute existing published traffic.

If an appeal is still active, resolve or withdraw it before rescanning; appeals can pause scans. Keep the currently published version available until an approved replacement is published. Same-endpoint tool fixes normally use deploy plus Rescan; this endpoint change needs the confirmed transition above. [Submission flow](https://developers.openai.com/plugins/deploy/submission), [review maintenance](https://developers.openai.com/plugins/deploy/app-review).

## Provide these review materials

- The plugin ID, submitted version, final HTTPS endpoint, deployed MCP/server revisions and release notes. Include a current successful scan of that exact endpoint, domain verification, and working OAuth discovery/redirect configuration. Read the portal's held-versus-live definitions and preserve compatibility while updates are held.
- A complete plugin package if the portal requires a replacement draft. Preserve intended skills and metadata. Check name/logo, descriptions, developer identity, website, support, privacy policy, terms and localization. Account-only functionality and supported limits must match the listing. [Submission errors](https://developers.openai.com/plugins/deploy/submission-errors).
- Dedicated reviewer demo account access, sample workspace and immediately usable sign-in instructions. Put credentials only in the portal's private Review details. Provide enough permissions for all cases, controlled messaging destinations and repeatable sample data; no employee/customer account or private-network dependency. Keep the account working for later reviews. [Submission flow](https://developers.openai.com/plugins/deploy/submission).
- Exactly five positive and three negative cases, each with prompt, expected tools and observable result, plus an accessible walkthrough video. Run the cases with the actual reviewer identity before submitting. The draft examples below need real sample identifiers and recorded results. [Submission errors](https://developers.openai.com/plugins/deploy/submission-errors).
- Explicit boolean annotations and a behavior-based justification for **each hint on every scanned tool**. Reuse previously accepted text only after verifying it still matches. Include the new tools below, the finite catalog and trigger-edit helper. A text justification does not override the server's advertised values. [Remote review guide](https://developers.openai.com/plugins/deploy/app-review).
- Screenshots only if the scanned integration actually supplies custom UI. A table returned as text is not custom UI. If screenshots apply, follow the portal dimensions and starter-prompt rules. [Submission errors](https://developers.openai.com/plugins/deploy/submission-errors).

## Explain the change to reviewers

Proposed release note:

> Workflow authoring now exposes each supported step as a named tool with a fixed schema. A draft starts disabled. Step operations preserve stable keys, order and bindings. Enabling, previewing, running and trigger edits validate the stored workflow inside the server's permission-enforcing services, including workflows saved by other clients. Generic JavaScript execution and simulation, generic workflow graph mutation/execution, and agent publishing/testing are unavailable on the submitted endpoint. The operation catalog documents a fixed set; it cannot discover new operations for a generic executor. Existing full MCP clients retain their interface on the original endpoint.

Show the actual scanned list. Seven names must be absent and direct calls rejected: `anydb_create_workflow`, `anydb_update_workflow`, `anydb_execute_workflow`, `anydb_run_script`, `anydb_simulate_script`, `anydb_publish_agent`, `anydb_test_agent`. Do not promise script/app/AI/custom-agent steps in starter prompts or bundled skills. `anydb_validate_script` only validates source; it neither executes it nor issues run authorization.

Attach a small comparison of previous findings and concrete remedies: individual named tools, fixed schemas, direct-call denial, persisted-workflow execution gates, correct annotations, script simulation I/O refusal, public HTTP destination checks and record ACL enforcement. These changes address the rejection; passing tests does not predict the review outcome. [Tool-exposure requirements](https://developers.openai.com/plugins/plugin-guidelines).

## New-tool annotation justifications

Columns are `readOnlyHint / destructiveHint / openWorldHint`. Setters can edit live workflows; their effects are considered, not just the configuration write.

| Tools | Values | Justification |
| --- | --- | --- |
| `anydb_create_workflow_draft` | false / false / false | Creates a new disabled, empty workflow; no existing workflow is overwritten and no external operation runs. |
| `anydb_update_workflow_metadata` | false / true / false | Overwrites saved name/description within the account; does not execute actions or change the graph. |
| `anydb_set_workflow_enabled` | false / true / true | Changes enabled state; enabling can start unattended record changes and messages/webhooks that cannot be recalled. Disabling remains available as a safety stop. |
| `anydb_workflow_set_create_record_step`, `anydb_workflow_set_update_record_step` | false / true / true | Replaces step configuration, including on enabled workflows; later record writes can trigger further automation and external effects. |
| `anydb_workflow_set_move_record_step`, `anydb_workflow_set_copy_record_step` | false / true / false | Overwrites an account-scoped movement/copy step and can change its future destination. No open-ended external operation is configured by these steps. |
| `anydb_workflow_set_find_records_step` | false / true / false | Overwrites a real authorized search step, which can change records supplied to later steps; no outbound send is configured by Find. |
| `anydb_workflow_set_generate_document_step` | false / true / false | Overwrites an account-scoped document-generation step; can replace a live workflow's export configuration. |
| `anydb_workflow_set_send_email_step`, `anydb_workflow_set_send_notification_step`, `anydb_workflow_set_send_message_step`, `anydb_workflow_set_call_webhook_step` | false / true / true | Overwrites a live-capable delivery step; later messages, notifications or webhook calls may be irreversible and reach recipients or configured external services. |
| `anydb_workflow_remove_step`, `anydb_workflow_reorder_steps` | false / true / false | Changes the stored action chain; removal loses saved configuration and reordering changes future behavior. Neither operation itself performs an external call. |
| `anydb_preview_workflow` | false / true / false | Reads are real and authorized; record mutations and outbound sends are suppressed. Preview persists runtime/history state, may advance a trigger's lastRun and can evict older bounded history. It is not read-only. |
| `anydb_run_reviewed_workflow` | false / true / true | Executes the validated stored chain as the caller; can change records, generate files and send messages or webhook requests. |

For retained helpers: `anydb_list_workflow_actions` is true/false/false, returning the fixed local catalog; `anydb_update_workflow_trigger` remains false/true/true because changing a live trigger can alter unattended external effects. Confirm every other scanned tool against its existing justification too.

## Proposed five positive cases

1. **Authorized reading.** Prompt: “Find the sample invoices in my review workspace and show their amounts.” Expected: `search_records`/`get_record`; only accessible sample records and correct field values.
2. **Disabled drafting.** Prompt: “Create a disabled manual workflow named Review acknowledgment with one notification step addressed to my demo user.” Expected: `anydb_create_workflow_draft`, `anydb_workflow_set_send_notification_step`, `anydb_get_workflow`; one disabled draft, one saved step, no message sent.
3. **Editing a stored step.** Prompt: “Change the acknowledgment text on the existing notification step and preserve the other steps.” Expected: `anydb_get_workflow`, named setter, readback; same stable key, updated text, other configs/bindings retained and no duplicate on retry.
4. **Preview.** Prompt: “Preview this workflow without sending notifications or changing its records.” Expected: `anydb_preview_workflow`; simulated output and saved simulated history, with no delivery or record mutation. Disclose its runtime-state effects.
5. **Explicit execution and stop.** Prompt: “Enable the demo manual workflow, run it once to send the notification to my demo account, then disable it.” Expected: enable, `anydb_run_reviewed_workflow`, disable, readback; one controlled delivery, execution receipt/history and disabled final state.

## Proposed three negative cases

1. “Run this arbitrary JavaScript, or discover an installed app operation and invoke it.” Expected: explain the unsupported operation; no hidden execution tool or dynamic generic executor called.
2. “Enable or run this existing workflow containing a script/AI/app/custom-agent step.” Expected: inspect and refuse through the reviewed server gate; no execution or enabling. A request to disable it alone must still succeed.
3. “Find records I cannot read by setting skipAclCheck, or edit the protected sample workflow in another workspace.” Expected: reject the bypass input or deny authorization; no protected results or edits. Provision the protected fixture before recording this case.

## Evidence and completion gate

Include deployed inspector/ChatGPT transcripts, tool inputs/results, scan date and status, the deployed catalog/annotation snapshot and regression summary. Exercise normal requests and direct hidden-tool calls, route casing/trailing-slash variants, forged action/profile overrides, unsafe pre-existing workflows, ACL denial, retries/bindings and edit-versus-run concurrency. Redact secrets and unrelated workspace data.

Before resubmission: merge both repositories, deploy server before exposing the new tools, validate on Dev1, then obtain approval for the public submission deployment. Public HTTPS reviewer access and an actual ChatGPT walkthrough are still required; local Jest tests do not replace them. Record OpenAI's outcome per affected tool. Keep ISSUE-564 verification Inconclusive until deployed checks and the review outcome are documented; do not mark it approved merely because code or tests pass. The broader legacy concurrency follow-up is ISSUE-644.
