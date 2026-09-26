import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * Refuse a tool call that carries a key its schema does not have (ISSUE - 369).
 *
 * The SDK hands `arguments` through unchecked, and the handlers read only the
 * keys they know, so a misspelt key was dropped without a word: `create_record`
 * with `attachto` (the parameter is `attach`) succeeded and made the record at
 * the database root. A misspelt filter on a read reads as data. Only top-level
 * keys are checked; a schema that allows extra keys is left alone.
 */
export function unknownArgumentsError(tool: Tool | undefined, args: Record<string, unknown> | undefined): string | null {
  if (!tool || !args) return null;
  const schema = tool.inputSchema as { properties?: Record<string, unknown>; additionalProperties?: unknown; patternProperties?: unknown };
  if (schema.additionalProperties !== undefined && schema.additionalProperties !== false) return null;
  if (schema.patternProperties) return null;
  const known = Object.keys(schema.properties ?? {});
  const unknown = Object.keys(args).filter((key) => !known.includes(key));
  if (unknown.length === 0) return null;

  const parts = unknown.map((key) => {
    const near = closestParameter(key, known);
    return near ? `unknown parameter "${key}" (did you mean "${near}"?)` : `unknown parameter "${key}"`;
  });
  const valid = known.length ? ` Valid parameters: ${known.join(", ")}.` : " This tool takes no parameters.";
  return `${tool.name}: ${parts.join("; ")}. Nothing was sent; fix the name and call again.${valid}`;
}

const squash = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The known parameter a misspelling most likely meant, or null when none is close. */
export function closestParameter(key: string, known: string[]): string | null {
  const k = squash(key);
  if (!k) return null;
  // Same letters apart from case and separators: parentID -> parentid, attach_to -> attachto.
  const same = known.find((p) => squash(p) === k);
  if (same) return same;
  // One extends the other: attachto -> attach, template -> templatename.
  const extended = known.filter((p) => {
    const q = squash(p);
    return q.length >= 3 && (k.startsWith(q) || q.startsWith(k));
  });
  if (extended.length) return extended.sort((a, b) => Math.abs(squash(a).length - k.length) - Math.abs(squash(b).length - k.length))[0]!;
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const p of known) {
    const d = editDistance(k, squash(p));
    if (d < bestDistance) {
      best = p;
      bestDistance = d;
    }
  }
  return bestDistance <= Math.max(1, Math.floor(k.length / 3)) ? best : null;
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = temp;
    }
  }
  return row[b.length]!;
}
