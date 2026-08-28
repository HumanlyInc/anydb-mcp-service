import { describe, expect, it } from "@jest/globals";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createMcpServer } from "../mcp.js";
import {
  readSolutionResource,
  SOLUTION_BUILDING_GUIDE_URI,
} from "../solution-resources.js";

/**
 * The file upload tools.
 *
 * Every upload goes through the same three steps server-side, so the inline
 * base64 path buys nothing at the transport layer: `upload_file` calls
 * getUploadUrl, PUTs, then completeUpload internally, exactly as
 * prepare_file_upload + complete_file_upload do. The one difference is that
 * base64 inflates the payload ~33% and spends that inflation in the calling
 * model's context budget.
 *
 * The descriptions used to frame the choice as small file vs large file, which
 * steered agents to base64 by default. These assert the framing that replaced
 * it — capability, not size — and the two things a caller most reliably gets
 * wrong: which adoid step 3 takes, and that step 3 is required at all.
 */
describe("file upload tools", () => {
  async function listTools() {
    const server = createMcpServer({ baseURL: "http://127.0.0.1:1/api" });
    const client = new Client({ name: "upload-test", version: "0.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    try {
      const { tools } = await client.listTools();
      return tools;
    } finally {
      await client.close();
      await server.close();
    }
  }

  it("makes the signed-URL pair the default for any size", async () => {
    const tools = await listTools();
    const prepare = tools.find((tool) => tool.name === "prepare_file_upload");
    const complete = tools.find((tool) => tool.name === "complete_file_upload");

    expect(prepare).toBeDefined();
    expect(complete).toBeDefined();

    expect(prepare?.description).toContain("ANY size");
    // The returned contentType has to reach the PUT as a header, or the stored
    // file gets the wrong type. The description is the only place that says so.
    expect(prepare?.description).toContain("Content-Type");
    // The adoid changes meaning between the two calls; passing the parent to
    // complete_file_upload is the obvious wrong guess.
    expect(prepare?.description).toContain("not the parent");
    expect(complete?.description).toContain("not the parent");

    // Nothing may reintroduce a size-based split.
    expect(prepare?.description).not.toContain("large file");
  });

  it("keeps upload_file available but framed as the fallback", async () => {
    const tools = await listTools();
    const upload = tools.find((tool) => tool.name === "upload_file");

    // Still present: a client with no HTTP of its own has no other option.
    expect(upload).toBeDefined();
    expect(upload?.description).toContain("cannot issue an HTTP PUT");
    expect(upload?.description).toContain("prepare_file_upload");
    // The old wording sold this as the small-file path. It is not.
    expect(upload?.description).not.toContain("Upload a small file");
    expect(upload?.description).not.toContain("For large files");
  });

  describe("the authoring guide", () => {
    const guide = () => readSolutionResource(SOLUTION_BUILDING_GUIDE_URI).text;

    it("documents the three-step flow", () => {
      const text = guide();

      expect(text).toContain("## File Uploads");
      expect(text).toContain("prepare_file_upload");
      expect(text).toContain("complete_file_upload");
      expect(text).toContain("Content-Type");
    });

    it("warns that skipping the completion call silently loses the file", () => {
      expect(guide()).toContain("Step 3 is not optional");
    });

    it("tells authors not to default to the base64 path", () => {
      expect(guide()).toContain("Do not reach for `upload_file` by default");
    });
  });
});
