import { describe, expect, it } from "@jest/globals";
import { spawn } from "node:child_process";
import { createServer } from "node:net";

describe("ISSUE-564 HTTP route selects the reviewed profile", () => {
  it("keeps Express case/trailing-slash variants closed and preserves the default endpoint", async () => {
    const reservation = createServer();
    await new Promise<void>(resolve => reservation.listen(0, "127.0.0.1", resolve));
    const port = (reservation.address() as { port: number }).port;
    await new Promise<void>((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()));
    const child = spawn(process.execPath, ["dist/http.js"], { env: { ...process.env, MCP_HTTP_PORT: String(port), MCP_OAUTH_ENABLED: "false", MCP_HTTP_HOST: "127.0.0.1" }, stdio: ["ignore", "ignore", "pipe"] });
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("HTTP test server did not start")), 10000);
        child.once("exit", code => { clearTimeout(timeout); reject(new Error(`HTTP test server exited ${code}`)); });
        child.stderr!.on("data", data => { if (String(data).includes("listening on")) { clearTimeout(timeout); resolve(); } });
      });
      const tools = async (path: string) => {
        const response = await fetch(`http://127.0.0.1:${port}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "x-anydb-api-key": "test-key", "x-anydb-email": "test@example.invalid" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }) });
        expect(response.status).toBe(200);
        const text = await response.text();
        const data = text.startsWith("{") ? JSON.parse(text) : JSON.parse(text.split("\n").find(line => line.startsWith("data: "))!.slice(6));
        return data.result.tools.map((tool: { name: string }) => tool.name);
      };
      for (const path of ["/reviewed", "/reviewed/", "/REVIEWED"]) {
        const names = await tools(path);
        expect(names).toContain("anydb_create_workflow_draft");
        expect(names).not.toContain("anydb_run_script");
      }
      expect(await tools("/")).toContain("anydb_run_script");
    } finally {
      child.kill("SIGTERM");
      await new Promise<void>(resolve => child.once("exit", () => resolve()));
    }
  }, 20000);
});
