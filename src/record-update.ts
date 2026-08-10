export interface RecordForUpdate {
  content?: Record<string, object>;
}

export function normalizeRecordContent(
  record: RecordForUpdate,
  updates?: Record<string, unknown>,
): Record<string, any> | undefined {
  if (!updates) return undefined;

  return Object.fromEntries(
    Object.entries(updates).map(([cellpos, rawUpdate]) => {
      if (
        !rawUpdate ||
        typeof rawUpdate !== "object" ||
        Array.isArray(rawUpdate)
      ) {
        throw new Error(`Invalid cell update at ${cellpos}`);
      }

      const update = rawUpdate as Record<string, unknown>;
      const pos = typeof update.pos === "string" ? update.pos : cellpos;
      const existing = (record.content?.[pos] || {}) as Record<string, unknown>;
      const key =
        typeof update.key === "string"
          ? update.key
          : typeof existing.key === "string"
            ? existing.key
            : pos;

      return [cellpos, { ...existing, ...update, pos, key }];
    }),
  );
}
