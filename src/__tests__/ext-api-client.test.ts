import { afterEach, describe, expect, it } from "@jest/globals";
import { createServer, type RequestListener, type Server } from "node:http";

import { ExtApiClient, type CreateTypeRequest } from "../ext-api-client.js";

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
});
