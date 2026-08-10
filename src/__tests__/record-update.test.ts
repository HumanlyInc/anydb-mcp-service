import { describe, expect, it } from "@jest/globals";

import { normalizeRecordContent } from "../record-update.js";

describe("normalizeRecordContent", () => {
  it("completes a value-only update from the persisted cell", () => {
    const result = normalizeRecordContent(
      {
        content: {
          A1: {
            pos: "A1",
            key: "A1",
            type: "string",
            format: "richtext",
            value: "Old text",
          },
        },
      },
      { A1: { value: "New text" } },
    );

    expect(result).toEqual({
      A1: {
        pos: "A1",
        key: "A1",
        type: "string",
        format: "richtext",
        value: "New text",
      },
    });
  });

  it("defaults pos and key for a new cell", () => {
    expect(normalizeRecordContent({}, { B2: { value: "New cell" } })).toEqual({
      B2: { pos: "B2", key: "B2", value: "New cell" },
    });
  });

  it("rejects non-object cell updates", () => {
    expect(() => normalizeRecordContent({}, { A1: "invalid" })).toThrow(
      "Invalid cell update at A1",
    );
  });
});
