import { describe, expect, it } from "@jest/globals";

import { REPORT_RUN_INLINE_LIMIT, slimReportRunResult } from "../result-format.js";

/**
 * ISSUE - 629. Dev1 report "Issues created per week" (8 groups, 549 records)
 * came back from a waited anydb_run_report as 160,508 characters, 109k of them
 * groupDetailsPages, and failed a custom agent's run. Pins the contract: a large
 * answer drops the detail rows and says how to read them; a small one is
 * returned untouched. Does not run a real report; the server shape is copied
 * from that run.
 */
const answer = (rows: number) => ({
  success: true,
  status: "ready",
  result: {
    manifest: { totalGroups: 1, totalMatchedRecords: rows },
    groupsPage: { groups: [{ groupIndex: 0 }] },
    groupDetailsPages: [{ rows: Array.from({ length: rows }, (_, i) => ({ n: i, title: "x".repeat(200) })) }]
  }
});

describe("ISSUE - 629: a waited report run stays within a client's result limit", () => {
  it("drops the detail rows of a large report and says how to read them", () => {
    const big = answer(600);
    expect(JSON.stringify(big).length).toBeGreaterThan(REPORT_RUN_INLINE_LIMIT);
    const out = slimReportRunResult(big) as any;
    expect(out.result.groupDetailsPages).toBeUndefined();
    expect(out.result.manifest.totalMatchedRecords).toBe(600);
    expect(out.detailsOmitted).toContain("anydb_get_report_result");
    expect(JSON.stringify(out).length).toBeLessThan(REPORT_RUN_INLINE_LIMIT);
  });

  it("returns a small report unchanged", () => {
    const small = answer(3);
    expect(slimReportRunResult(small)).toBe(small);
  });

  it("passes through an answer with no result (a job id only)", () => {
    const queued = { success: true, status: "queued", jobId: 1 };
    expect(slimReportRunResult(queued)).toBe(queued);
  });
});
