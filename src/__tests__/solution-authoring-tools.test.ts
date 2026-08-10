import { describe, expect, it, jest } from "@jest/globals";

import type {
  CreateTypeRequest,
  CreateTypeResult,
  CreateWorkflowRequest,
  CreateWorkflowResult,
  ExtApiClient,
  UpdateTypeRequest,
  UpdateTypeResult,
  UpdateWorkflowRequest,
  UpdateWorkflowResult,
} from "../ext-api-client.js";
import {
  callSolutionAuthoringTool,
  isSolutionAuthoringTool,
  SOLUTION_AUTHORING_TOOLS,
} from "../solution-authoring-tools.js";

describe("solution authoring tools", () => {
  it("includes guide fetching as the first tool", () => {
    const guideTool = SOLUTION_AUTHORING_TOOLS[0];
    expect(guideTool.name).toBe("anydb_get_authoring_guide");
    expect(guideTool.description).toContain(
      "canonical AnyDB solution-building guide",
    );
    expect(guideTool.inputSchema).toMatchObject({
      type: "object",
      properties: {},
      required: [],
    });
    expect(isSolutionAuthoringTool("anydb_get_authoring_guide")).toBe(true);
  });

  it("returns guide text when calling anydb_get_authoring_guide", async () => {
    const client = {} as ExtApiClient;
    const result = await callSolutionAuthoringTool(
      "anydb_get_authoring_guide",
      undefined,
      client,
    );

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(typeof result.content[0].text).toBe("string");
    expect(result.content[0].text.length).toBeGreaterThan(0);
    expect(result.content[0].text).toContain("AnyDB");
  });

  it("advertises create type with the packaged semantic schema", () => {
    const tool = SOLUTION_AUTHORING_TOOLS[1];
    expect(tool.name).toBe("anydb_create_type");
    expect(tool.description).toContain("standalone AnyDB type");
    expect(tool.description).toContain("inspect complete definitions");
    expect(tool.description).toContain("semantic content and behavior");
    expect(tool.description).toContain("not names or descriptions");
    expect(tool.description).toContain("Define a new type only when neither");
    expect(tool.description).toContain("canonical type-layout rules");
    expect(tool.description).toContain("position, colspan, and rowspan");
    expect(tool.inputSchema).toMatchObject({
      required: ["teamid", "adbid", "clientRequestId", "mode"],
      $defs: expect.objectContaining({ field: expect.any(Object) }),
    });
    expect(isSolutionAuthoringTool("anydb_create_type")).toBe(true);
    expect(SOLUTION_AUTHORING_TOOLS[2]).toMatchObject({
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
      mode: "define" as const,
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

  it("parses a type object stringified by an MCP client", async () => {
    const createType = jest.fn<ExtApiClient["createType"]>();
    createType.mockResolvedValue({
      success: true,
      operation: "create_type",
      requestId: "location-v1",
      result: { name: "Location", persisted: false },
      warnings: [],
      validation: { valid: true, errors: [] },
    } as CreateTypeResult);
    const client = { createType } as unknown as ExtApiClient;
    const type = {
      name: "Location",
      fields: [
        {
          key: "Name",
          valueType: "string",
          format: "general",
          layout: { position: "A1", colspan: 6, rowspan: 1 },
        },
      ],
    };
    const args = {
      teamid: "507f1f77bcf86cd799439011",
      adbid: "507f1f77bcf86cd799439012",
      clientRequestId: "location-v1",
      validateOnly: true,
      mode: "define" as const,
      type: JSON.stringify(type, null, 2),
    };

    await callSolutionAuthoringTool("anydb_create_type", args, client);

    expect(createType).toHaveBeenCalledWith({ ...args, type });
  });

  it("rejects a malformed stringified type before making an HTTP call", async () => {
    const createType = jest.fn<ExtApiClient["createType"]>();
    const client = { createType } as unknown as ExtApiClient;

    await expect(
      callSolutionAuthoringTool(
        "anydb_create_type",
        { type: "{not-json" },
        client,
      ),
    ).rejects.toThrow(
      "anydb_create_type.type must be an object or valid JSON object string",
    );
    expect(createType).not.toHaveBeenCalled();
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

    const mcpArgs = { ...request, changes: JSON.stringify(request.changes) };
    const result = await callSolutionAuthoringTool(
      "anydb_update_type",
      mcpArgs,
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
        actions: [
          {
            key: "script",
            type: "action_script",
            actionId: "action_script-runtime",
          },
        ],
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

    const mcpArgs = { ...request, workflow: JSON.stringify(request.workflow) };
    const result = await callSolutionAuthoringTool(
      "anydb_create_workflow",
      mcpArgs,
      client,
    );

    expect(SOLUTION_AUTHORING_TOOLS[3].name).toBe("anydb_create_workflow");
    expect(isSolutionAuthoringTool("anydb_create_workflow")).toBe(true);
    expect(SOLUTION_AUTHORING_TOOLS[3].description).toContain(
      "anydb_get_workflow_execution_history",
    );
    expect(SOLUTION_AUTHORING_TOOLS[3].inputSchema).toMatchObject({
      properties: {
        workflow: {
          required: ["name", "trigger"],
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
            actions: expect.any(Object),
          },
        },
      },
    });
    const workflowSchema = JSON.stringify(
      SOLUTION_AUTHORING_TOOLS[3].inputSchema,
    );
    expect(workflowSchema).toContain('"actions"');
    expect(workflowSchema).toContain("priorActionKey.outputName");
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

  it("forwards a workflow enabled-state update", async () => {
    const updateWorkflow = jest.fn<ExtApiClient["updateWorkflow"]>();
    updateWorkflow.mockResolvedValue({
      success: true,
      operation: "update_workflow",
      requestId: "enable-workflow-1",
      result: {
        workflowId: "507f1f77bcf86cd799439091",
        name: "On SAF Form Submit",
        description: "",
        enabled: true,
      },
    } as UpdateWorkflowResult);
    const client = { updateWorkflow } as unknown as ExtApiClient;
    const request: UpdateWorkflowRequest & Record<string, unknown> = {
      teamid: "507f1f77bcf86cd799439011",
      adbid: "507f1f77bcf86cd799439012",
      workflowId: "507f1f77bcf86cd799439091",
      clientRequestId: "enable-workflow-1",
      changes: { enabled: true },
    };

    const result = await callSolutionAuthoringTool(
      "anydb_update_workflow",
      { ...request, changes: JSON.stringify(request.changes) },
      client,
    );

    expect(updateWorkflow).toHaveBeenCalledWith(request);
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      operation: "update_workflow",
      result: { enabled: true },
    });
    expect(isSolutionAuthoringTool("anydb_update_workflow")).toBe(true);
  });

  it("lists workflow trigger definitions", async () => {
    const listWorkflowTriggers =
      jest.fn<ExtApiClient["listWorkflowTriggers"]>();
    listWorkflowTriggers.mockResolvedValue([
      {
        type: "trigger_on_record_update",
        description: "Triggered when a record is updated",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            templateName: {},
            fieldNames: { type: "array" },
            parentRecordId: {},
            filter: {},
          },
          required: [],
        },
        outputSchema: {
          type: "object",
          properties: { adoid: {}, changedCellsIds: {} },
        },
        creatableViaAnydbCreateWorkflow: true,
      },
    ]);
    const client = { listWorkflowTriggers } as unknown as ExtApiClient;
    const args = {
      teamid: "507f1f77bcf86cd799439011",
      adbid: "507f1f77bcf86cd799439012",
    };

    const result = await callSolutionAuthoringTool(
      "anydb_list_workflow_triggers",
      args,
      client,
    );

    const tool = SOLUTION_AUTHORING_TOOLS.find(
      (candidate) => candidate.name === "anydb_list_workflow_triggers",
    );
    expect(tool?.inputSchema).toMatchObject({
      required: ["teamid", "adbid"],
    });
    expect(tool?.description).toContain(
      "exact object shape accepted at workflow.trigger.config",
    );
    expect(listWorkflowTriggers).toHaveBeenCalledWith(args.teamid, args.adbid);
    expect(JSON.parse(result.content[0].text)[0]).toMatchObject({
      type: "trigger_on_record_update",
      inputSchema: expect.objectContaining({
        properties: expect.objectContaining({
          templateName: expect.any(Object),
          fieldNames: expect.any(Object),
        }),
      }),
      outputSchema: expect.any(Object),
    });
  });

  it("lists workflow actions with script runtime guidance", async () => {
    const listWorkflowActions = jest.fn<ExtApiClient["listWorkflowActions"]>();
    listWorkflowActions.mockResolvedValue([
      {
        type: "action_script",
        description: "Run custom JavaScript",
        inputSchema: {
          type: "object",
          required: ["script"],
          properties: { script: {}, recordId: {}, timeoutMs: {} },
        },
        outputSchema: {
          type: "object",
          properties: { scriptSummary: {}, customOutputs: {} },
        },
        supportedTriggers: ["*"],
        creatableViaAnydbCreateWorkflow: true,
        availableForCurrentTeam: true,
        guidance: {
          anydbApis: {
            getRecordById: "anydb.getRecordById(adoid)",
            updateRecord: "anydb.updateRecord({ adoid, cellValues? })",
          },
          rules: ["Require input.recordId for triggering-record workflows."],
        },
      },
    ]);
    const client = { listWorkflowActions } as unknown as ExtApiClient;
    const args = {
      teamid: "507f1f77bcf86cd799439011",
      adbid: "507f1f77bcf86cd799439012",
    };

    const result = await callSolutionAuthoringTool(
      "anydb_list_workflow_actions",
      args,
      client,
    );

    expect(listWorkflowActions).toHaveBeenCalledWith(args.teamid, args.adbid);
    expect(JSON.parse(result.content[0].text)[0]).toMatchObject({
      type: "action_script",
      creatableViaAnydbCreateWorkflow: true,
      availableForCurrentTeam: true,
      guidance: {
        anydbApis: expect.objectContaining({
          getRecordById: expect.any(String),
          updateRecord: expect.any(String),
        }),
        rules: expect.arrayContaining([expect.stringContaining("recordId")]),
      },
    });
    expect(isSolutionAuthoringTool("anydb_list_workflow_actions")).toBe(true);
  });
});
