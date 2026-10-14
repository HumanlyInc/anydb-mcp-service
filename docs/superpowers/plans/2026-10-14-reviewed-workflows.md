# Reviewed Workflows Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans with independent boundary fixes delegated under superpowers:dispatching-parallel-agents. Steps use checkbox syntax for tracking.

**Goal:** Implement individually exposed workflow operations without breaking the full MCP interface.

**Architecture:** Reuse the existing authenticated MCP transport and workflow services. The reviewed transport profile is selected by server route; typed step tools forward to narrow permission-enforcing server operations. The full profile retains legacy tools and descriptors.

**Tech Stack:** TypeScript, MCP SDK, Express, existing AnyDB workflow services and Jest.

**Spec:** ../specs/2026-10-14-reviewed-workflows.md

## Global Constraints

- Default HTTP/stdio APIs remain compatible; no User-Agent selection.
- Existing caller identity/ACL/license checks remain mandatory.
- No new generic operation selector; all ten allowed step types have fixed schemas.
- No .env reads, production actions, deployments or OpenAI submission. The user authorized commits, pushes and PR creation on 2026-10-14 after local verification.

## Review Focus

- Calls to hidden names and forged profile/actionType arguments fail before backend I/O.
- Existing unsafe workflows authored elsewhere cannot be enabled/executed through the reviewed profile.
- Binding/order/key roundtrips survive step upsert/remove/reorder without clobbering other configs.
- Simulation performs no fetch/provider I/O; real public fetch still works.
- Default catalog/credentials/script/workflow capabilities remain tested.

### Task 1: Server workflow operations (ISSUE-564)

Files: ext.controller.ts, ext.service.ts, workflow.service.ts, workflow.model.ts; focused live ext workflow regression.

- [x] Observe failing disabled empty-draft, typed step roundtrip, authorization and unsafe legacy workflow tests.
- [x] Add optional reviewedOnly service gates and narrow step upsert/remove/reorder routes; keep default routes unchanged.
- [x] Verify real API roundtrips and neighboring workflow suites.

### Task 2: Script boundary (ISSUE-640)

Files: script.runtime.ts, focused egress helper/tests.

- [x] Observe failing private-address and simulation I/O tests.
- [x] Reuse public-host checks with pinned transport and redirect validation; refuse simulation fetch/AI.
- [x] Verify real runtime and public method/header/body/response/abort compatibility.

### Task 3: Find ACL (ISSUE-641)

Files: action.find.ts and focused live ACL tests.

- [x] Observe unauthorized result leakage when skipAclCheck is supplied.
- [x] Remove flag from public schema; always enforce existing read checks while preserving internal call compatibility.
- [x] Verify authorized workflows and script Find paths.

### Task 4: MCP profile and typed tools

Files: reviewed-workflow-tools.ts, fixed resource schemas, mcp.ts, http.ts, ext-api-client.ts, README and Jest tests.

- [x] Observe missing explicit tools/profile isolation tests failing first.
- [x] Add typed operation tools with explicit annotations and strict input handling; add authenticated /reviewed selection and dispatch guard.
- [x] Verify direct hidden calls, safe preview metadata, server gate forwarding, full-profile compatibility and build/full Jest suite.

### Task 5: Integrated verification

- [x] Review all changes together; compare type failures with baseline.
- [x] Run focused real server regressions and the full MCP suite; identify existing environmental failures separately.
- [x] Update tracked issues/Verification with local evidence and deployment/review limitations.

## Final evidence

- MCP build clean; full Jest 473 passed, one skipped (53 passing suites).
- Integrated server Jest 216 passed, one skipped (15 passing suites).
- Same-HEAD server type baseline and final both158 identical errors after path/line normalization; no added type diagnostics. Changed production ESLint clean; six unchanged quote errors in existing test lines.
- Independent review findings fixed with red/green regressions, including route variants, hidden agent execution, exact identifier guidance, unsafe persisted workflows, concurrent edits/adoption/run completion, rate-window pruning, and fetch body abort reasons.
- ISSUE-564/640/641 Resolution and Inconclusive Verification updated in Dev1; resubmission checklist saved on ISSUE-564 and docs/issue-564-resubmission.md. ISSUE-644 tracks existing generic writer concurrency.
- User authorized commits, pushes and PR creation after this local verification. Dev1/public reviewer validation, deployment and directory acceptance remain outstanding.
