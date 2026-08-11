import { afterEach, describe, expect, it } from "@jest/globals";
import { createServer, type RequestListener, type Server } from "node:http";

import {
  ExtApiClient,
  type CreateTypeRequest,
  type CreateViewRequest,
  type UpdateViewRequest,
  type UpdateWorkflowRequest,
} from "../ext-api-client.js";

describe("ExtApiClient", () => {
  let server: Server | undefined;

  afterEach(
    () =>
      new Promise<void>((resolve) => {
        if (!server) return resolve();
        server.close(() => resolve());
        server = undefined;
      }),
  );

  async function listen(handler: RequestListener): Promise<string> {
    server = createServer(handler);
    await new Promise<void>((resolve) =>
      server!.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Test server did not expose a TCP address");
    }
    return `http://127.0.0.1:${address.port}`;
  }

  const request: CreateTypeRequest = {
    teamid: "69b42543b78e125defa011d2",
    adbid: "6a7a30bee59ebbded551602f",
    mode: "define",
    clientRequestId: "inv-solution-location-probe-min",
    validateOnly: true,
    type: {
      name: "Location Probe",
      fields: [
        {
          key: "Name",
          valueType: "string",
          format: "general",
          layout: { position: "A1", colspan: 6, rowspan: 1 },
        },
      ],
    },
  };

  it("posts the create type request unchanged", async () => {
    let receivedBody: unknown;
    const baseURL = await listen((incoming, response) => {
      const chunks: Buffer[] = [];
      incoming.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      incoming.on("end", () => {
        receivedBody = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        response.setHeader("Content-Type", "application/json");
        response.end(
          JSON.stringify({
            status: "success",
            data: {
              success: true,
              operation: "create_type",
              requestId: request.clientRequestId,
              result: {
                name: "Location Probe",
                persisted: false,
              },
              warnings: [],
              validation: { valid: true, errors: [] },
            },
          }),
        );
      });
    });
    const client = new ExtApiClient({
      baseURL,
      apiKey: "test-key",
      userEmail: "user@example.com",
    });

    await client.createType(request);

    expect(receivedBody).toEqual(request);
  });

  it("posts a workspace View request unchanged", async () => {
    let receivedBody: unknown;
    let receivedUrl = "";
    const baseURL = await listen((incoming, response) => {
      receivedUrl = incoming.url || "";
      const chunks: Buffer[] = [];
      incoming.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      incoming.on("end", () => {
        receivedBody = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        response.setHeader("Content-Type", "application/json");
        response.end(
          JSON.stringify({
            status: "success",
            data: {
              success: true,
              operation: "create_view",
              requestId: "workspace-inventory-view-v1",
              result: {
                viewId: "507f1f77bcf86cd799439099",
                name: "Inventory Attention",
                scope: "workspace",
                parentRecordId: "507f1f77bcf86cd799439010",
                targetTypes: ["Stock", "Asset"],
                persisted: true,
              },
              validation: { valid: true, errors: [] },
            },
          }),
        );
      });
    });
    const client = new ExtApiClient({
      baseURL,
      apiKey: "test-key",
      userEmail: "user@example.com",
    });
    const viewRequest: CreateViewRequest = {
      teamid: request.teamid,
      adbid: request.adbid,
      clientRequestId: "workspace-inventory-view-v1",
      view: {
        name: "Inventory Attention",
        scope: "workspace",
        targets: [{ typeName: "Stock" }, { typeName: "Asset" }],
      },
    };

    await client.createView(viewRequest);

    expect(receivedUrl).toBe("/integrations/ext/views");
    expect(receivedBody).toEqual(viewRequest);
  });

  it("puts View filter changes to the View ID route", async () => {
    let receivedBody: unknown;
    let receivedUrl = "";
    let receivedMethod = "";
    const baseURL = await listen((incoming, response) => {
      receivedUrl = incoming.url || "";
      receivedMethod = incoming.method || "";
      const chunks: Buffer[] = [];
      incoming.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      incoming.on("end", () => {
        receivedBody = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        response.setHeader("Content-Type", "application/json");
        response.end(
          JSON.stringify({
            status: "success",
            data: {
              success: true,
              operation: "update_view",
              requestId: "workspace-inventory-view-v2",
              result: {
                viewId: "507f1f77bcf86cd799439099",
                name: "Critical Inventory",
                targetTypes: ["Stock"],
                persisted: true,
              },
              validation: { valid: true, errors: [] },
            },
          }),
        );
      });
    });
    const client = new ExtApiClient({
      baseURL,
      apiKey: "test-key",
      userEmail: "user@example.com",
    });
    const updateRequest: UpdateViewRequest = {
      teamid: request.teamid,
      adbid: request.adbid,
      viewId: "507f1f77bcf86cd799439099",
      clientRequestId: "workspace-inventory-view-v2",
      changes: {
        name: "Critical Inventory",
        targets: [
          {
            typeName: "Stock",
            filters: [
              {
                source: "cell",
                field: "Quantity",
                operator: "lte",
                value: 5,
              },
            ],
          },
        ],
      },
    };

    await client.updateView(updateRequest);

    expect(receivedMethod).toBe("PUT");
    expect(receivedUrl).toBe(
      "/integrations/ext/views/507f1f77bcf86cd799439099",
    );
    expect(receivedBody).toEqual({
      teamid: updateRequest.teamid,
      adbid: updateRequest.adbid,
      clientRequestId: updateRequest.clientRequestId,
      changes: updateRequest.changes,
    });
  });

  it("includes the backend error body when a request fails", async () => {
    const baseURL = await listen((_incoming, response) => {
      response.statusCode = 400;
      response.setHeader("Content-Type", "application/json");
      response.end(
        JSON.stringify({
          status: "error",
          error: {
            message: {
              clientRequestId: { message: "Invalid value" },
            },
          },
        }),
      );
    });
    const client = new ExtApiClient({
      baseURL,
      apiKey: "test-key",
      userEmail: "user@example.com",
    });

    await expect(client.createType(request)).rejects.toThrow(
      /POST http:\/\/127\.0\.0\.1:\d+\/integrations\/ext\/templates failed \(400\).*clientRequestId.*Invalid value/,
    );
  });

  it("creates a record using a stable template name and nested cell updates", async () => {
    let receivedBody: unknown;
    const baseURL = await listen((incoming, response) => {
      const chunks: Buffer[] = [];
      incoming.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      incoming.on("end", () => {
        receivedBody = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        response.setHeader("Content-Type", "application/json");
        response.end(
          JSON.stringify({
            status: "success",
            data: { meta: { adoid: "507f1f77bcf86cd799439099" } },
          }),
        );
      });
    });
    const client = new ExtApiClient({
      baseURL,
      apiKey: "test-key",
      userEmail: "user@example.com",
    });
    const record = {
      teamid: "69b42543b78e125defa011d2",
      adbid: "6a7a30bee59ebbded551602f",
      templatename: "Location",
      name: "Main Warehouse",
      content: {
        A1: { value: "Main Warehouse" },
        D3: { value: true },
      },
    };

    await client.createRecord(record);

    expect(receivedBody).toEqual(record);
    expect(receivedBody).not.toHaveProperty("template");
  });

  it("includes the backend record validation body when creation fails", async () => {
    const baseURL = await listen((_incoming, response) => {
      response.statusCode = 400;
      response.setHeader("Content-Type", "application/json");
      response.end(
        JSON.stringify({
          status: "error",
          error: {
            type: "validation",
            props: { templatename: { message: "Template not found" } },
          },
        }),
      );
    });
    const client = new ExtApiClient({
      baseURL,
      apiKey: "test-key",
      userEmail: "user@example.com",
    });

    await expect(
      client.createRecord({
        teamid: "69b42543b78e125defa011d2",
        adbid: "6a7a30bee59ebbded551602f",
        templatename: "Location",
        name: "Main Warehouse",
      }),
    ).rejects.toThrow(/templatename.*Template not found/);
  });

  it("gets workflow trigger and action catalogs for the workspace", async () => {
    const receivedUrls: string[] = [];
    const baseURL = await listen((incoming, response) => {
      receivedUrls.push(incoming.url || "");
      const isActionRequest = incoming.url?.startsWith(
        "/integrations/ext/workflow-actions",
      );
      response.setHeader("Content-Type", "application/json");
      response.end(
        JSON.stringify({
          status: "success",
          data: [
            {
              type: isActionRequest
                ? "action_script"
                : "trigger_on_record_update",
              description: "Definition",
              inputSchema: {},
              outputSchema: {},
              creatableViaAnydbCreateWorkflow: true,
            },
          ],
        }),
      );
    });
    const client = new ExtApiClient({
      baseURL,
      apiKey: "test-key",
      userEmail: "user@example.com",
    });

    const triggers = await client.listWorkflowTriggers(
      request.teamid,
      request.adbid,
    );
    const actions = await client.listWorkflowActions(
      request.teamid,
      request.adbid,
    );

    expect(triggers[0].type).toBe("trigger_on_record_update");
    expect(actions[0].type).toBe("action_script");
    expect(receivedUrls).toEqual([
      `/integrations/ext/workflow-triggers?teamid=${request.teamid}&adbid=${request.adbid}`,
      `/integrations/ext/workflow-actions?teamid=${request.teamid}&adbid=${request.adbid}`,
    ]);
  });

  it("gets one workflow with history at its exact external API path", async () => {
    let receivedUrl = "";
    const baseURL = await listen((incoming, response) => {
      receivedUrl = incoming.url || "";
      response.setHeader("Content-Type", "application/json");
      response.end(
        JSON.stringify({
          status: "success",
          data: {
            workflowId: "507f1f77bcf86cd799439091",
            name: "Workflow",
            enabled: true,
            createdAt: 1,
            trigger: null,
            actions: [],
            executionHistory: [{ executionId: "run-1", status: "success" }],
          },
        }),
      );
    });
    const client = new ExtApiClient({
      baseURL,
      apiKey: "test-key",
      userEmail: "user@example.com",
    });

    const workflow = await client.getWorkflow(
      request.teamid,
      request.adbid,
      "507f1f77bcf86cd799439091",
    );

    expect(receivedUrl).toBe(
      `/integrations/ext/workflows/507f1f77bcf86cd799439091?teamid=${request.teamid}&adbid=${request.adbid}`,
    );
    expect(workflow.executionHistory).toEqual([
      { executionId: "run-1", status: "success" },
    ]);
  });

  it("updates a workflow at its exact external API path", async () => {
    let receivedMethod = "";
    let receivedUrl = "";
    let receivedBody: unknown;
    const baseURL = await listen((incoming, response) => {
      receivedMethod = incoming.method || "";
      receivedUrl = incoming.url || "";
      const chunks: Buffer[] = [];
      incoming.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      incoming.on("end", () => {
        receivedBody = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        response.setHeader("Content-Type", "application/json");
        response.end(
          JSON.stringify({
            status: "success",
            data: {
              success: true,
              operation: "update_workflow",
              requestId: "enable-1",
              result: {
                workflowId: "507f1f77bcf86cd799439091",
                name: "Workflow",
                description: "",
                enabled: true,
              },
            },
          }),
        );
      });
    });
    const client = new ExtApiClient({
      baseURL,
      apiKey: "test-key",
      userEmail: "user@example.com",
    });
    const update: UpdateWorkflowRequest = {
      teamid: request.teamid,
      adbid: request.adbid,
      workflowId: "507f1f77bcf86cd799439091",
      clientRequestId: "enable-1",
      changes: { enabled: true },
    };

    await client.updateWorkflow(update);

    expect(receivedMethod).toBe("PUT");
    expect(receivedUrl).toBe(
      "/integrations/ext/workflows/507f1f77bcf86cd799439091",
    );
    expect(receivedBody).toEqual({
      teamid: update.teamid,
      adbid: update.adbid,
      clientRequestId: update.clientRequestId,
      changes: update.changes,
    });
  });
});
