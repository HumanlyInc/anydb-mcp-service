import { describe, expect, it } from "@jest/globals";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createMcpServer } from "../mcp.js";
import {
  ANYDB_PERMISSIONS_GUIDE_URI,
  readSolutionResource,
} from "../solution-resources.js";

/**
 * The permission tools.
 *
 * AnyDB's ACL is a permission *type* crossed with a *level*, and the pairing
 * that matters most is the least guessable: whether someone may add records
 * under a parent is OBJECT_ATTACHED at PERM_CREATE, on the parent, and it is
 * independent of whether they may edit that parent. These check that the tools
 * forward faithfully and that the guide says so.
 */
describe("permission tools", () => {
  /** Records what the ext API was asked, and replies with a canned report. */
  async function withStubbedApi<T>(
    run: (
      baseURL: string,
      seen: { url?: string; body?: string },
    ) => Promise<T>,
  ): Promise<T> {
    const seen: { url?: string; body?: string } = {};

    const http: HttpServer = createServer((req, res) => {
      seen.url = req.url;
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(chunk as Buffer));
      req.on("end", () => {
        seen.body = Buffer.concat(chunks).toString("utf8") || undefined;

        if (req.url?.startsWith("/integrations/ext/permissions/check")) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              status: "success",
              data: {
                resource: { kind: "record", teamid: "t1" },
                user: { userid: "u2" },
                results: [
                  {
                    permission: "OBJECT_ATTACHED",
                    level: "PERM_CREATE",
                    allowed: false,
                  },
                ],
              },
            }),
          );
          return;
        }

        if (req.url?.startsWith("/integrations/ext/permissions")) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              status: "success",
              data: {
                resource: { kind: "record", teamid: "t1", adoid: "o1" },
                user: { userid: "u2", email: "sam@anydb.com" },
                can: {
                  read: true,
                  update: true,
                  delete: false,
                  addChildren: false,
                  share: false,
                },
                roleIds: ["READ_WRITE_ROLE"],
                permissions: {
                  OBJECT_ATTACHED: {
                    description: "Operations on child objects",
                    PERM_CREATE: { allowed: false },
                  },
                },
              },
            }),
          );
          return;
        }

        res.writeHead(404).end();
      });
    });

    await new Promise<void>((resolve) =>
      http.listen(0, "127.0.0.1", () => resolve()),
    );
    const { port } = http.address() as AddressInfo;

    try {
      return await run(`http://127.0.0.1:${port}`, seen);
    } finally {
      await new Promise<void>((resolve) => http.close(() => resolve()));
    }
  }

  async function callTool(name: string, args: Record<string, unknown>) {
    return withStubbedApi(async (baseURL, seen) => {
      const server = createMcpServer({
        accessToken: "header.body.sig",
        baseURL,
      });
      const client = new Client({ name: "perm-test", version: "0.0.0" });
      const [clientTransport, serverTransport] =
        InMemoryTransport.createLinkedPair();

      await Promise.all([
        server.connect(serverTransport),
        client.connect(clientTransport),
      ]);

      try {
        const result: any = await client.callTool({ name, arguments: args });
        return {
          text: String(result.content?.[0]?.text || ""),
          isError: result.isError === true,
          seen,
        };
      } finally {
        await client.close();
        await server.close();
      }
    });
  }

  it("returns the capability summary for a record", async () => {
    const { text } = await callTool("anydb_get_permissions", {
      teamid: "t1",
      adbid: "d1",
      adoid: "o1",
      userid: "u2",
    });
    const report = JSON.parse(text);

    expect(report.can.update).toBe(true);
    // The distinction the whole model turns on: editable, but nothing may be
    // added underneath.
    expect(report.can.addChildren).toBe(false);
    expect(report.roleIds).toEqual(["READ_WRITE_ROLE"]);
  });

  it("passes the resource and subject through to the API", async () => {
    const { seen } = await callTool("anydb_get_permissions", {
      teamid: "t1",
      adbid: "d1",
      adoid: "o1",
      userid: "u2",
    });

    expect(seen.url).toContain("teamid=t1");
    expect(seen.url).toContain("adoid=o1");
    expect(seen.url).toContain("userid=u2");
  });

  it("omits a subject that was not asked for, so the server defaults to the caller", async () => {
    const { seen } = await callTool("anydb_get_permissions", { teamid: "t1" });

    expect(seen.url).toContain("teamid=t1");
    expect(seen.url).not.toContain("userid=");
  });

  it("sends the questions verbatim when checking", async () => {
    const { text, seen } = await callTool("anydb_check_permissions", {
      teamid: "t1",
      adoid: "o1",
      checks: [{ permission: "OBJECT_ATTACHED", level: "PERM_CREATE" }],
    });

    expect(JSON.parse(seen.body || "{}").checks).toEqual([
      { permission: "OBJECT_ATTACHED", level: "PERM_CREATE" },
    ]);
    expect(JSON.parse(text).results[0].allowed).toBe(false);
  });

  it("refuses an empty check list rather than calling the API", async () => {
    const { text, isError } = await callTool("anydb_check_permissions", {
      teamid: "t1",
      checks: [],
    });

    expect(isError).toBe(true);
    expect(text).toContain("non-empty");
  });

  it("advertises both tools and points at the guide", async () => {
    const server = createMcpServer({ baseURL: "http://127.0.0.1:1/api" });
    const client = new Client({ name: "perm-test", version: "0.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    try {
      const { tools } = await client.listTools();
      const get = tools.find((tool) => tool.name === "anydb_get_permissions");
      const check = tools.find(
        (tool) => tool.name === "anydb_check_permissions",
      );

      expect(get).toBeDefined();
      expect(check).toBeDefined();
      // The independence of update and addChildren is the thing a caller is
      // most likely to assume wrongly, so the tool itself has to say it.
      expect(get?.description).toContain("independent");
      expect(get?.description).toContain(ANYDB_PERMISSIONS_GUIDE_URI);
    } finally {
      await client.close();
      await server.close();
    }
  });

  describe("the guide", () => {
    const guide = () => readSolutionResource(ANYDB_PERMISSIONS_GUIDE_URI).text;

    it("names the pairing that governs adding children", () => {
      expect(guide()).toContain("OBJECT_ATTACHED");
      expect(guide()).toContain("PERM_CREATE");
      expect(guide()).toContain("on the PARENT");
    });

    it("warns off the key that does not do what it looks like", () => {
      // OBJECT_SELF/PERM_CREATE is the shared-View "+ New" flag, not the
      // create gate. Left unsaid, it is the obvious wrong guess.
      expect(guide()).toContain("OBJECT_SELF/PERM_CREATE");
      expect(guide()).toContain("shared View");
    });

    it("is listed as a resource", () => {
      const uris = readSolutionResource(ANYDB_PERMISSIONS_GUIDE_URI);
      expect(uris.mimeType).toBe("text/markdown");
    });
  });
});
