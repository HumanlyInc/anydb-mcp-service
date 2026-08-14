import { createHash } from "node:crypto";
import { describe, expect, it } from "@jest/globals";
import axios from "axios";
import { ExtApiClient } from "../ext-api-client.js";

const fixture = {
  apiKey: process.env.ANYDB_DEFAULT_API_KEY,
  userEmail: process.env.ANYDB_DEFAULT_USER_EMAIL,
  baseURL: process.env.ANYDB_API_URL || "https://app.anydb.com/api",
  teamid: process.env.ANYDB_TEST_TEAM_ID,
  adbid: process.env.ANYDB_TEST_DATABASE_ID,
  adoid: process.env.ANYDB_TEST_FILE_RECORD_ID,
  cellpos: process.env.ANYDB_TEST_FILE_CELL_POS,
  expectedSha256: process.env.ANYDB_TEST_FILE_SHA256,
};

const canRun = Boolean(
  fixture.apiKey &&
  fixture.userEmail &&
  fixture.teamid &&
  fixture.adbid &&
  fixture.adoid &&
  fixture.cellpos,
);

(canRun ? describe : describe.skip)("headless file download", () => {
  it("fetches a presigned URL without AnyDB authentication headers", async () => {
    const client = new ExtApiClient({
      apiKey: fixture.apiKey!,
      userEmail: fixture.userEmail!,
      baseURL: fixture.baseURL,
    });
    const download = await client.downloadFile({
      teamid: fixture.teamid!,
      adbid: fixture.adbid!,
      adoid: fixture.adoid!,
      cellpos: fixture.cellpos!,
      redirect: false,
      preview: false,
    });

    expect(download.url).toBeTruthy();
    const response = await axios.get<ArrayBuffer>(download.url!, {
      responseType: "arraybuffer",
      timeout: 30000,
    });
    const bytes = Buffer.from(response.data);

    expect(response.status).toBe(200);
    expect(bytes.length).toBeGreaterThan(0);
    if (fixture.expectedSha256) {
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(
        fixture.expectedSha256.toLowerCase(),
      );
    }
  }, 40000);
});
