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

export function listSolutionPrompts() {
  return [DESIGN_ANYDB_TYPE_PROMPT, DESIGN_ANYDB_SOLUTION_PROMPT];
}

export function getSolutionPrompt(
  name: string,
  args: Record<string, string> | undefined,
) {
  if (
    name !== DESIGN_ANYDB_TYPE_PROMPT.name &&
    name !== DESIGN_ANYDB_SOLUTION_PROMPT.name
  ) {
    throw new Error(`Unknown AnyDB prompt: ${name}`);
  }

  const goal = args?.goal?.trim();
  if (!goal) {
    throw new Error("goal is required");
  }
  const constraints = args?.constraints?.trim();

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
2. Define the stable type name, fields, value types, formats, layout, formulas, badges, and child policy.
3. Call anydb_discover_types for this type across workspace and built-in sources.
4. Call anydb_get_type_definition for promising candidates and decide whether to reuse, import, or define the type.

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
2. Build an internal implementation checklist covering type roles, stable type and field names, value types and formats, layouts, relationships, formulas, badges, child policies, creation order, and workflows.
3. Call anydb_discover_types for every proposed type across workspace and built-in sources.
4. Call anydb_get_type_definition for every promising candidate and decide whether to reuse, import, or define it.
5. Call anydb_list_workflows and identify reusable or conflicting automation.

Return a concise implementation blueprint, not chain-of-thought. Include the ordered artifacts, dependencies, reuse decisions, unresolved questions, and validation risks. Do not call mutation tools until the complete blueprint is coherent.`,
        },
      },
    ],
  };
}
