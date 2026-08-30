export const DESIGN_ANYDB_SOLUTION_PROMPT = {
  name: "design_anydb_solution",
  description:
    "Plan an AnyDB solution before mutation, including types, fields, relationships, formulas, creation order, and workflows.",
  arguments: [
    {
      name: "goal",
      description: "The business process or solution to design",
      required: true,
    },
    {
      name: "constraints",
      description: "Optional business, data, licensing, or rollout constraints",
      required: false,
    },
  ],
};

export const DESIGN_ANYDB_TYPE_PROMPT = {
  name: "design_anydb_type",
  description:
    "Plan one standalone AnyDB type without requiring a broader solution or workflow.",
  arguments: [
    {
      name: "goal",
      description: "The purpose and requirements of the standalone type",
      required: true,
    },
    {
      name: "constraints",
      description: "Optional field, layout, reuse, or rollout constraints",
      required: false,
    },
  ],
};

export const AUTHOR_WORKFLOW_SCRIPT_PROMPT = {
  name: "author_anydb_workflow_script",
  description:
    "Author a new AnyDB workflow script action, or review and revise the script of an existing workflow, against the current script runtime contract.",
  arguments: [
    {
      name: "goal",
      description:
        "The automation the script must perform, or the change requested to an existing script",
      required: true,
    },
    {
      name: "workflowId",
      description:
        "Optional workflowId of an existing workflow whose script should be reviewed and revised",
      required: false,
    },
    {
      name: "constraints",
      description:
        "Optional trigger, licensing, data-volume, or rollout constraints",
      required: false,
    },
  ],
};

export function listSolutionPrompts() {
  return [
    DESIGN_ANYDB_TYPE_PROMPT,
    DESIGN_ANYDB_SOLUTION_PROMPT,
    AUTHOR_WORKFLOW_SCRIPT_PROMPT,
  ];
}

export function getSolutionPrompt(
  name: string,
  args: Record<string, string> | undefined,
) {
  if (
    name !== DESIGN_ANYDB_TYPE_PROMPT.name &&
    name !== DESIGN_ANYDB_SOLUTION_PROMPT.name &&
    name !== AUTHOR_WORKFLOW_SCRIPT_PROMPT.name
  ) {
    throw new Error(`Unknown AnyDB prompt: ${name}`);
  }

  const goal = args?.goal?.trim();
  if (!goal) {
    throw new Error("goal is required");
  }
  const constraints = args?.constraints?.trim();

  if (name === AUTHOR_WORKFLOW_SCRIPT_PROMPT.name) {
    const workflowId = args?.workflowId?.trim();
    return {
      description: AUTHOR_WORKFLOW_SCRIPT_PROMPT.description,
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `${workflowId ? "Review and revise the script action of an existing AnyDB workflow" : "Author an AnyDB workflow script action"} for this goal:

${goal}
${workflowId ? `\nExisting workflowId: ${workflowId}\n` : ""}${constraints ? `\nConstraints:\n${constraints}\n` : ""}
Before writing or changing any script source:
1. Read anydb://guides/solution-building/v1, in particular its Script Actions and Reviewing and Updating a Script Action sections.
2. Call anydb_list_workflow_actions and read the action_script entry's guidance. Its globals, anydbApis, outputApis, recordShape, and rules describe the running server and override any remembered API name. Confirm availableForCurrentTeam before planning a script action.
3. Call anydb_list_workflow_triggers and choose the trigger that actually produces the event. Only form-submit, record-create, and record-update triggers bind input.recordId automatically.
4. Resolve exact type names, field keys, field formats, and select option literals with anydb_discover_types and anydb_get_type_definition. Never guess a field name or its casing.
${workflowId ? "5. Call anydb_get_workflow and read the stored source at the action_script entry's config.script, plus the latest executionHistory entries and their output.logLines. Diagnose the actual defect before rewriting; preserve behavior the request does not ask you to change.\n" : ""}
Then build an internal checklist of every condition, mutation, side effect, ordering constraint, and output in the goal, and write the script so that:
- It is an executable body with no async IIFE wrapper, using only documented anydb.* and output.* members accessed by literal name.
- A triggering-record script requires input.recordId and loads it with await anydb.getRecordById(input.recordId), failing before any side effect when it is missing. refIds or query criteria are only for intentional scheduled, manual, or batch runs.
- Every data call and mutation helper is awaited, and every loop body begins with await anydb.yield().
- Branch selection is free of side effects, mandatory records and recipients are preflighted before the first write, and a failure is never swallowed by an empty catch.
- Update-triggered side effects are idempotent or transition the record out of the triggering condition.
- Field names keep exact schema casing, select values use declared option literals, checkboxes are booleans, and date, datetime, and time values are integer epoch seconds.
- It ends with explicit output.set(...) values and a concise output.summary(...), and uses log(...) for diagnostics without logging sensitive content.

${workflowId ? "Apply the revision with anydb_update_workflow by resending the complete ordered action chain, including every other action config value and binding." : "Create the workflow disabled, using validateOnly first if the design is uncertain."} Then verify with anydb_execute_workflow using simulate: true, then a real run against test data, and inspect executionHistory[].artifactExecutions[].output.logLines before reporting the automation as working.

Return the script and a short account of how it covers the checklist, not chain-of-thought.`,
          },
        },
      ],
    };
  }

  if (name === DESIGN_ANYDB_TYPE_PROMPT.name) {
    return {
      description: DESIGN_ANYDB_TYPE_PROMPT.description,
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Design one standalone AnyDB type for this goal:

${goal}
${constraints ? `\nConstraints:\n${constraints}\n` : ""}
Before mutation:
1. Read anydb://guides/solution-building/v1 and anydb://schemas/solution-authoring/v1.
2. Define the stable type name, fields, value types, formats, layout, formulas, badges, and child policy. Identify any requested filtered View or record/form share as a separate artifact rather than embedding it in the type.
3. Call anydb_discover_types with source "workspace", then inspect promising definitions with anydb_get_type_definition. Compare semantic content and behavior, not names or descriptions: field purposes, types/formats, requiredness/options, relationships, formulas/lookups, and workflow-facing keys. Reuse content that fulfills the use case.
4. Only if no content-compatible workspace type exists, search source "builtin" and inspect promising definitions by the same criteria. Import a compatible built-in before using it.
5. Define a new type only if neither workspace nor built-in content can fulfill the use case. A matching name is insufficient, and a different name does not rule out reuse.

Return a concise standalone-type blueprint, not chain-of-thought. Do not introduce additional types or workflows unless they are required by the stated goal. Do not call mutation tools until the type blueprint is coherent.`,
          },
        },
      ],
    };
  }

  return {
    description: DESIGN_ANYDB_SOLUTION_PROMPT.description,
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `Design a multi-type AnyDB solution for this goal:

${goal}
${constraints ? `\nConstraints:\n${constraints}\n` : ""}
Before any mutation:
1. Read anydb://guides/solution-building/v1 and anydb://schemas/solution-authoring/v1.
2. Build an internal implementation checklist covering type roles, stable type and field names, value types and formats, layouts, relationships, formulas, badges, child policies, filtered Views, requested record/form shares, creation order, and workflows.
3. For every proposed type, call anydb_discover_types with source "workspace" and inspect promising definitions with anydb_get_type_definition. Compare semantic content and behavior, not names or descriptions: field purposes, types/formats, requiredness/options, relationships, formulas/lookups, and workflow-facing keys. Reuse content that fulfills the use case.
4. Only when no content-compatible workspace type exists, search source "builtin" and inspect promising definitions with anydb_get_type_definition by the same criteria. Import a compatible built-in before using it.
5. Define a new type only when neither source's content can fulfill the use case. A matching name is insufficient, and a different name does not rule out reuse.
6. Call anydb_list_views for each type that needs one, and anydb_list_shares, to identify reusable or conflicting artifacts before planning new Views or shares. A View is a tab on a type listing page, so anydb_list_views is per type.
7. Call anydb_list_workflows and identify reusable or conflicting automation.
8. Add a workflow only when a required event or record change must cause a mutation, notification, or external side effect. Prefer formulas/lookups for derived values, consolidate compatible automation, and treat five or more workflows as a design-review signal rather than a hard limit.
9. For requested private shares, plan email recipients and discover exact group names with anydb_list_team_groups. For public shares, reuse an existing compatible link or plan to return the generated publicUrl.

Return a concise implementation blueprint, not chain-of-thought. Include the ordered artifacts, dependencies, reuse decisions, unresolved questions, and validation risks. Do not call mutation tools until the complete blueprint is coherent.`,
        },
      },
    ],
  };
}
