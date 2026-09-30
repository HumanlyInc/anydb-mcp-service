import { afterEach, describe, expect, it } from "@jest/globals";
import { createServer, type Server } from "node:http";

import { ExtApiClient } from "../ext-api-client.js";

/**
 * The ten ext client methods for inbound webhooks: each hits the route the anydb-server ext API
 * exposes under /integrations/ext/inboundwebhooks, sends what it was given, and unwraps `data`.
 * (The test server's base URL has no /api prefix; the real one does.)
 */
describe("ExtApiClient inbound webhooks", () => {
  let server: Server | undefined;
  afterEach(
    () =>
      new Promise<void>((resolve) => {
        if (!server) return resolve();
        server.close(() => resolve());
        server = undefined;
      }),
  );

  type Seen = { method?: string; url?: string; body?: unknown };

  async function setup(answer: unknown = { ok: true }): Promise<{ api: ExtApiClient; seen: Seen }> {
    const seen: Seen = {};
    server = createServer((req, res) => {
      let raw = "";
      req.on("data", (chunk) => (raw += chunk));
      req.on("end", () => {
        seen.method = req.method;
        seen.url = req.url;
        seen.body = raw ? JSON.parse(raw) : undefined;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ status: "success", data: answer }));
      });
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no TCP address");
    const api = new ExtApiClient({ apiKey: "k", userEmail: "e@x.com", baseURL: `http://127.0.0.1:${address.port}` });
    return { api, seen };
  }

  const base = "/integrations/ext/inboundwebhooks";

  it("createInboundWebhook POSTs the body and unwraps data", async () => {
    const { api, seen } = await setup({ endpoint: { hookId: "h1" }, secret: "s", url: "u" });
    const body = {
      teamid: "t", adbid: "a", parentId: "p", templateName: "Lead", name: "Framer", adapter: "framer" as const,
      recordName: "{Name}", startActive: false,
    };
    expect(await api.createInboundWebhook(body)).toEqual({ endpoint: { hookId: "h1" }, secret: "s", url: "u" });
    expect(seen).toEqual({ method: "POST", url: base, body });
  });

  it("listInboundWebhooks GETs with teamid and only the parentId it was given", async () => {
    const one = await setup([]);
    await one.api.listInboundWebhooks({ teamid: "t1" });
    expect(one.seen).toMatchObject({ method: "GET", url: `${base}?teamid=t1` });
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    const two = await setup([]);
    await two.api.listInboundWebhooks({ teamid: "t1", parentId: "p1" });
    expect(two.seen.url).toBe(`${base}?teamid=t1&parentId=p1`);
  });

  it("getInboundWebhook, deleteInboundWebhook and rotateInboundWebhookSecret use the hook path", async () => {
    const get = await setup({ endpoint: {} });
    await get.api.getInboundWebhook({ hookId: "h-1" });
    expect(get.seen).toMatchObject({ method: "GET", url: `${base}/h-1` });
    await new Promise<void>((resolve) => server!.close(() => resolve()));

    const del = await setup({ deleted: true });
    expect(await del.api.deleteInboundWebhook({ hookId: "h-1" })).toEqual({ deleted: true });
    expect(del.seen).toMatchObject({ method: "DELETE", url: `${base}/h-1` });
    await new Promise<void>((resolve) => server!.close(() => resolve()));

    const rot = await setup({ secret: "new" });
    expect(await rot.api.rotateInboundWebhookSecret({ hookId: "h-1" })).toEqual({ secret: "new" });
    expect(rot.seen).toMatchObject({ method: "POST", url: `${base}/h-1/rotate-secret` });
  });

  it("updateInboundWebhook PUTs only the fields, not the id", async () => {
    const { api, seen } = await setup({});
    await api.updateInboundWebhook({ hookId: "h-1", fieldMap: { "Your name": "Name" }, recordName: "{Name}" });
    expect(seen).toEqual({ method: "PUT", url: `${base}/h-1`, body: { fieldMap: { "Your name": "Name" }, recordName: "{Name}" } });
  });

  it("setInboundWebhookStatus PUTs the status", async () => {
    const { api, seen } = await setup({});
    await api.setInboundWebhookStatus({ hookId: "h-1", status: "active" });
    expect(seen).toEqual({ method: "PUT", url: `${base}/h-1/status`, body: { status: "active" } });
  });

  it("listInboundWebhookDeliveries GETs with the limit only when given", async () => {
    const { api, seen } = await setup([]);
    await api.listInboundWebhookDeliveries({ hookId: "h-1", limit: 20 });
    expect(seen).toMatchObject({ method: "GET", url: `${base}/h-1/deliveries?limit=20` });
  });

  it("getInboundWebhookDelivery encodes the delivery key", async () => {
    const { api, seen } = await setup({ deliveryKey: "k/1" });
    await api.getInboundWebhookDelivery({ hookId: "h-1", deliveryKey: "k/1" });
    expect(seen.url).toBe(`${base}/h-1/deliveries/k%2F1`);
  });

  it("replayInboundWebhookDelivery POSTs to the replay path", async () => {
    const { api, seen } = await setup({ adoid: "a1" });
    expect(await api.replayInboundWebhookDelivery({ hookId: "h-1", deliveryKey: "k1" })).toEqual({ adoid: "a1" });
    expect(seen).toMatchObject({ method: "POST", url: `${base}/h-1/deliveries/k1/replay` });
  });

  it("a server error message is thrown, not swallowed", async () => {
    server = createServer((_req, res) => {
      res.statusCode = 403;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ status: "error", message: "Inbound webhooks require a Business or Enterprise plan" }));
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;
    const api = new ExtApiClient({ apiKey: "k", userEmail: "e@x.com", baseURL: `http://127.0.0.1:${port}` });
    await expect(api.getInboundWebhook({ hookId: "h" })).rejects.toThrow(/Business or Enterprise/);
  });
});
