import { describe, expect, it, jest } from "@jest/globals";

import type {
  CreateTypeRequest,
  CreateTypeResult,
  CreateWorkflowRequest,
  CreateWorkflowResult,
  ExtApiClient,
  UpdateTypeRequest,
  UpdateTypeResult,
} from "../ext-api-client.js";
import {
  callSolutionAuthoringTool,
  isSolutionAuthoringTool,
  SOLUTION_AUTHORING_TOOLS,
} from "../solution-authoring-tools.js";

describe("solution authoring tools", () => {
  it("advertises create type with the packaged semantic schema", () => {
    const tool = SOLUTION_AUTHORING_TOOLS[0];
    expect(tool.name).toBe("anydb_create_type");
    expect(tool.description).toContain("standalone AnyDB type");
    expect(tool.inputSchema).toMatchObject({
      required: ["teamid", "adbid", "clientRequestId", "mode"],
      $defs: expect.objectContaining({ field: expect.any(Object) }),
    });
    expect(isSolutionAuthoringTool("anydb_create_type")).toBe(true);
    expect(SOLUTION_AUTHORING_TOOLS[1]).toMatchObject({
      name: "anydb_update_type",
      inputSchema: expect.objectContaining({
        required: expect.arrayContaining([
          "templateName",
          "expectedRevision",
          "confirmDataLoss",
        ]),
      }),
    });
    expect(isSolutionAuthoringTool("anydb_update_type")).toBe(true);
  });

  it("forwards a standalone type creation request", async () => {
    const createType = jest.fn<ExtApiClient["createType"]>();
    createType.mockResolvedValue({
      success: true,
      operation: "create_type",
      requestId: "meeting-note-v1",
      result: { name: "Meeting Note", persisted: false },
      warnings: [],
      validation: { valid: true, errors: [] },
    } as CreateTypeResult);
    const client = { createType } as unknown as ExtApiClient;
    const request: CreateTypeRequest & Record<string, unknown> = {
      teamid: "507f1f77bcf86cd799439011",
      adbid: "507f1f77bcf86cd799439012",
      clientRequestId: "meeting-note-v1",
      validateOnly: true,
      mode: "define",
      type: {
        name: "Meeting Note",
        fields: [
          {
            key: "Subject",
            valueType: "string",
            format: "general",
            layout: { position: "A1", colspan: 1, rowspan: 1 },
          },
        ],
      },
    };

    const result = await callSolutionAuthoringTool(
      "anydb_create_type",
      request,
      client,
    );

    expect(createType).toHaveBeenCalledWith(request);
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      operation: "create_type",
      result: { persisted: false },
    });
  });

  it("forwards a name-based type update request", async () => {
    const updateType = jest.fn<ExtApiClient["updateType"]>();
    updateType.mockResolvedValue({
      success: true,
      operation: "update_type",
      requestId: "meeting-note-v2",
      result: {
        name: "Meeting Note",
        previousTemplateId: "507f1f77bcf86cd799439010",
        templateId: "507f1f77bcf86cd799439011",
        previousRevision: "1",
        revision: "2",
        persisted: true,
      },
      impact: { affectedFields: ["Status"], destructive: false },
      migration: { status: "queued", jobId: 12345678 },
      warnings: [],
      validation: { valid: true, errors: [] },
    } as UpdateTypeResult);
    const client = { updateType } as unknown as ExtApiClient;
    const request: UpdateTypeRequest & Record<string, unknown> = {
      teamid: "507f1f77bcf86cd799439011",
      adbid: "507f1f77bcf86cd799439012",
      templateName: "Meeting Note",
      clientRequestId: "meeting-note-v2",
      expectedRevision: "1",
      changes: {
        addFields: [
          {
            key: "Status",
            valueType: "string",
            format: "select",
            options: ["Draft", "Final"],
            layout: { position: "B1", colspan: 1, rowspan: 1 },
          },
        ],
      },
      confirmDataLoss: false,
    };

    const result = await callSolutionAuthoringTool(
      "anydb_update_type",
      request,
      client,
    );

    expect(updateType).toHaveBeenCalledWith(request);
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      operation: "update_type",
      migration: { status: "queued" },
    });
  });

  it("forwards a two-step workflow creation request", async () => {
    const createWorkflow = jest.fn<ExtApiClient["createWorkflow"]>();
    createWorkflow.mockResolvedValue({
      success: true,
      operation: "create_workflow",
      requestId: "workflow-request-1",
      result: {
        workflowId: "507f1f77bcf86cd799439091",
        name: "On SAF Form Submit",
        enabled: false,
        persisted: true,
      },
      graph: {
        triggerType: "trigger_on_form_submit",
        triggerId: "trigger_on_form_submit-runtime",
        actionType: "action_script",
        actionId: "action_script-runtime",
        recordIdBinding: "{{trigger_on_form_submit-runtime.adoid}}",
      },
      warnings: [],
      validation: { valid: true, errors: [] },
    } as CreateWorkflowResult);
    const client = { createWorkflow } as unknown as ExtApiClient;
    const request: CreateWorkflowRequest & Record<string, unknown> = {
      teamid: "507f1f77bcf86cd799439011",
      adbid: "507f1f77bcf86cd799439012",
      clientRequestId: "workflow-request-1",
      workflow: {
        name: "On SAF Form Submit",
        trigger: {
          type: "trigger_on_form_submit",
          config: { formName: "SAF Transfer Form" },
        },
        script: { source: "output.summary(input.recordId);" },
      },
    };

    const result = await callSolutionAuthoringTool(
      "anydb_create_workflow",
      request,
      client,
    );

    expect(SOLUTION_AUTHORING_TOOLS[2].name).toBe("anydb_create_workflow");
    expect(isSolutionAuthoringTool("anydb_create_workflow")).toBe(true);
    expect(SOLUTION_AUTHORING_TOOLS[2].inputSchema).toMatchObject({
      properties: {
        workflow: {
          required: ["name", "trigger", "script"],
          properties: {
            trigger: {
              properties: {
                type: {
                  enum: [
                    "trigger_on_form_submit",
                    "trigger_on_record_create",
                    "trigger_on_record_update",
                    "trigger_on_schedule",
                    "trigger_manual",
                  ],
                },
              },
            },
            script: expect.any(Object),
          },
        },
      },
    });
    const workflowSchema = JSON.stringify(
      SOLUTION_AUTHORING_TOOLS[2].inputSchema,
    );
    expect(workflowSchema).not.toContain('"actions"');
    expect(workflowSchema).not.toContain('"connections"');
    expect(workflowSchema).not.toContain("trigger_on_record_delete");
    expect(createWorkflow).toHaveBeenCalledWith(request);
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      operation: "create_workflow",
      graph: {
        actionType: "action_script",
        recordIdBinding: "{{trigger_on_form_submit-runtime.adoid}}",
      },
    });
  });
});
