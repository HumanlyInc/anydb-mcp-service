import { describe, expect, it, jest } from "@jest/globals";

import type {
  CreateShareRequest,
  CreateShareResult,
  CreateTypeRequest,
  CreateTypeResult,
  CreateViewRequest,
  CreateViewResult,
  CreateWorkspaceRequest,
  CreateWorkspaceResult,
  CreateWorkflowRequest,
  CreateWorkflowResult,
  ExecuteWorkflowRequest,
  ExecuteWorkflowResult,
  ExtApiClient,
  UpdateTypeRequest,
  UpdateTypeResult,
  UpdateViewRequest,
  UpdateViewResult,
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

  it("advertises and forwards empty workspace creation", async () => {
    const tool = SOLUTION_AUTHORING_TOOLS.find(
      (candidate) => candidate.name === "anydb_create_workspace",
    );
    expect(tool?.inputSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["teamid", "name", "clientRequestId"],
    });
    expect(JSON.stringify(tool?.inputSchema)).not.toContain('"$ref"');
    expect(tool?.description).toContain("new empty AnyDB workspace");
    expect(isSolutionAuthoringTool("anydb_create_workspace")).toBe(true);

    const createWorkspace = jest.fn<ExtApiClient["createWorkspace"]>();
    createWorkspace.mockResolvedValue({
      success: true,
      operation: "create_workspace",
      requestId: "operations-workspace-v1",
      result: {
        adbid: "507f1f77bcf86cd799439012",
        teamid: "507f1f77bcf86cd799439011",
        name: "Operations Workspace",
      },
    } as CreateWorkspaceResult);
    const client = { createWorkspace } as unknown as ExtApiClient;
    const workspaceRequest: CreateWorkspaceRequest & Record<string, unknown> = {
      teamid: "507f1f77bcf86cd799439011",
      name: "Operations Workspace",
      clientRequestId: "operations-workspace-v1",
    };

    const result = await callSolutionAuthoringTool(
      "anydb_create_workspace",
      workspaceRequest,
      client,
    );

    expect(createWorkspace).toHaveBeenCalledWith(workspaceRequest);
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      operation: "create_workspace",
      result: { adbid: "507f1f77bcf86cd799439012" },
    });
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
    });
    expect(
      (tool.inputSchema as any).properties.type.properties.fields.items,
    ).toMatchObject({ required: ["key", "valueType", "format", "layout"] });
    expect(JSON.stringify(tool.inputSchema)).not.toContain('"$ref"');
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
      migration: {
        status: "queued",
        jobId: 12345678,
        recordsToMigrate: 27,
      },
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

  it("advertises and forwards type migration polling", async () => {
    const tool = SOLUTION_AUTHORING_TOOLS.find(
      (candidate) => candidate.name === "anydb_get_type_migration_status",
    );
    expect(tool?.inputSchema).toMatchObject({
      additionalProperties: false,
      required: ["teamid", "adbid", "jobId"],
      properties: { jobId: { type: "integer", minimum: 1 } },
    });
    expect(isSolutionAuthoringTool("anydb_get_type_migration_status")).toBe(
      true,
    );

    const getTypeMigrationStatus =
      jest.fn<ExtApiClient["getTypeMigrationStatus"]>();
    getTypeMigrationStatus.mockResolvedValue({
      jobId: 12345678,
      status: "IN_PROGRESS",
      progress: 44,
      recordsProcessed: 12,
      recordsToMigrate: 27,
      recordsRemaining: 15,
      errors: 0,
    });
    const client = { getTypeMigrationStatus } as unknown as ExtApiClient;

    const result = await callSolutionAuthoringTool(
      "anydb_get_type_migration_status",
      {
        teamid: "507f1f77bcf86cd799439011",
        adbid: "507f1f77bcf86cd799439012",
        jobId: 12345678,
      },
      client,
    );

    expect(getTypeMigrationStatus).toHaveBeenCalledWith(
      "507f1f77bcf86cd799439011",
      "507f1f77bcf86cd799439012",
      12345678,
    );
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      recordsProcessed: 12,
      recordsToMigrate: 27,
      recordsRemaining: 15,
    });
  });

  it("advertises and forwards a semantic child View request", async () => {
    const tool = SOLUTION_AUTHORING_TOOLS.find(
      (candidate) => candidate.name === "anydb_create_view",
    );
    const inputSchema = tool?.inputSchema as any;
    expect(inputSchema.required).toEqual([
      "teamid",
      "adbid",
      "clientRequestId",
      "view",
    ]);
    expect(inputSchema.properties.clientRequestId.description).toContain(
      "Required idempotency key",
    );
    expect(inputSchema.properties.view.required).toEqual([
      "name",
      "scope",
      "targets",
    ]);
    expect(inputSchema.properties.view.properties.scope.enum).toEqual([
      "workspace",
      "children",
    ]);
    expect(
      inputSchema.properties.view.properties.targets.items.properties.filters
        .items.properties.fieldType.enum,
    ).toEqual(["string", "number", "boolean", "date", "array"]);
    expect(JSON.stringify(tool?.inputSchema)).not.toContain('"$ref"');
    expect(tool?.description).toContain("database root");
    expect(tool?.description).toContain("direct children");
    expect(isSolutionAuthoringTool("anydb_create_view")).toBe(true);

    const createView = jest.fn<ExtApiClient["createView"]>();
    createView.mockResolvedValue({
      success: true,
      operation: "create_view",
      requestId: "low-stock-view-v1",
      result: {
        viewId: "507f1f77bcf86cd799439099",
        name: "Low Stock",
        scope: "children",
        parentRecordId: "507f1f77bcf86cd799439013",
        targetTypes: ["Stock"],
        persisted: true,
      },
      validation: { valid: true, errors: [] },
    } as CreateViewResult);
    const client = { createView } as unknown as ExtApiClient;
    const request: CreateViewRequest & Record<string, unknown> = {
      teamid: "507f1f77bcf86cd799439011",
      adbid: "507f1f77bcf86cd799439012",
      clientRequestId: "low-stock-view-v1",
      view: {
        name: "Low Stock",
        scope: "children",
        parentRecordId: "507f1f77bcf86cd799439013",
        targets: [
          {
            typeName: "Stock",
            filters: [
              {
                source: "cell",
                field: "Quantity",
                operator: "lt",
                value: 10,
                fieldType: "number",
              },
            ],
          },
        ],
      },
    };

    const result = await callSolutionAuthoringTool(
      "anydb_create_view",
      { ...request, view: JSON.stringify(request.view) },
      client,
    );

    expect(createView).toHaveBeenCalledWith(request);
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      operation: "create_view",
      result: { scope: "children", targetTypes: ["Stock"] },
    });
  });

  it("advertises and forwards a complete View filter replacement", async () => {
    const tool = SOLUTION_AUTHORING_TOOLS.find(
      (candidate) => candidate.name === "anydb_update_view",
    );
    const inputSchema = tool?.inputSchema as any;
    expect(inputSchema.required).toEqual([
      "teamid",
      "adbid",
      "viewId",
      "clientRequestId",
      "changes",
    ]);
    expect(
      inputSchema.properties.changes.properties.targets.items.properties
        .typeName.type,
    ).toBe("string");
    expect(tool?.description).toContain("replace its complete targets");
    expect(tool?.description).toContain("placement is immutable");
    expect(isSolutionAuthoringTool("anydb_update_view")).toBe(true);

    const updateView = jest.fn<ExtApiClient["updateView"]>();
    updateView.mockResolvedValue({
      success: true,
      operation: "update_view",
      requestId: "low-stock-view-v2",
      result: {
        viewId: "507f1f77bcf86cd799439099",
        name: "Critical Stock",
        targetTypes: ["Stock"],
        persisted: true,
      },
      validation: { valid: true, errors: [] },
    } as UpdateViewResult);
    const client = { updateView } as unknown as ExtApiClient;
    const request: UpdateViewRequest & Record<string, unknown> = {
      teamid: "507f1f77bcf86cd799439011",
      adbid: "507f1f77bcf86cd799439012",
      viewId: "507f1f77bcf86cd799439099",
      clientRequestId: "low-stock-view-v2",
      changes: {
        name: "Critical Stock",
        targets: [
          {
            typeName: "Stock",
            filters: [
              {
                source: "cell",
                field: "Quantity",
                operator: "lte",
                value: 5,
                fieldType: "number",
              },
            ],
          },
        ],
      },
    };

    const result = await callSolutionAuthoringTool(
      "anydb_update_view",
      { ...request, changes: JSON.stringify(request.changes) },
      client,
    );

    expect(updateView).toHaveBeenCalledWith(request);
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      operation: "update_view",
      result: { name: "Critical Stock", targetTypes: ["Stock"] },
    });
  });

  it("lists team groups by team ID for private sharing", async () => {
    const tool = SOLUTION_AUTHORING_TOOLS.find(
      (candidate) => candidate.name === "anydb_list_team_groups",
    );
    expect(tool).toMatchObject({
      inputSchema: expect.objectContaining({ required: ["teamid"] }),
    });
    expect(tool?.description).toContain("stable group names");
    expect(isSolutionAuthoringTool("anydb_list_team_groups")).toBe(true);

    const listTeamGroups = jest.fn<ExtApiClient["listTeamGroups"]>();
    listTeamGroups.mockResolvedValue([
      {
        groupId: "507f1f77bcf86cd799439099",
        name: "Operations",
        memberCount: 4,
        builtIn: false,
      },
    ]);
    const client = { listTeamGroups } as unknown as ExtApiClient;
    const result = await callSolutionAuthoringTool(
      "anydb_list_team_groups",
      { teamid: "507f1f77bcf86cd799439011" },
      client,
    );

    expect(listTeamGroups).toHaveBeenCalledWith("507f1f77bcf86cd799439011");
    expect(JSON.parse(result.content[0].text)).toEqual([
      expect.objectContaining({ name: "Operations", memberCount: 4 }),
    ]);
  });

  it("advertises and forwards a public form share", async () => {
    const tool = SOLUTION_AUTHORING_TOOLS.find(
      (candidate) => candidate.name === "anydb_create_share",
    );
    const inputSchema = tool?.inputSchema as any;
    expect(inputSchema.required).toEqual([
      "teamid",
      "adbid",
      "clientRequestId",
      "share",
    ]);
    expect(inputSchema.properties.share.required).toEqual([
      "privacy",
      "target",
    ]);
    expect(inputSchema.properties.share.properties.privacy.enum).toEqual([
      "public",
      "private",
    ]);
    expect(inputSchema.properties.share.properties.target.oneOf).toHaveLength(
      2,
    );
    expect(
      inputSchema.properties.share.properties.target.description,
    ).toContain('"kind":"record"');
    expect(tool?.description).toContain('kind: "record"');
    expect(tool?.description).toContain('kind: "form"');
    expect(
      inputSchema.properties.share.properties.recipients.properties.emails.type,
    ).toBe("array");
    expect(
      inputSchema.properties.share.properties.recipients.properties.groupNames
        .type,
    ).toBe("array");
    expect(inputSchema.properties.share.properties.role).not.toHaveProperty(
      "default",
    );
    expect(
      inputSchema.properties.share.properties.withAttachments,
    ).not.toHaveProperty("default");
    expect(JSON.stringify(tool?.inputSchema)).not.toContain('"$ref"');
    expect(tool?.description).toContain("Public shares omit recipients");
    expect(tool?.description).toContain("stable group names");
    expect(isSolutionAuthoringTool("anydb_create_share")).toBe(true);

    const createShare = jest.fn<ExtApiClient["createShare"]>();
    createShare.mockResolvedValue({
      success: true,
      operation: "create_share",
      requestId: "safety-form-share-v1",
      result: {
        shareId: "507f1f77bcf86cd799439099",
        shareToken: "share-token",
        publicUrl: "https://workspace.example.com/f/share-token",
        targetKind: "form",
        privacy: "public",
        name: "Safety Intake",
        parentRecordId: "507f1f77bcf86cd799439013",
        templateName: "Safety Report",
        recipientEmails: [],
        recipientGroups: [],
        persisted: true,
      },
      validation: { valid: true, errors: [] },
    } as CreateShareResult);
    const client = { createShare } as unknown as ExtApiClient;
    const request: CreateShareRequest & Record<string, unknown> = {
      teamid: "507f1f77bcf86cd799439011",
      adbid: "507f1f77bcf86cd799439012",
      clientRequestId: "safety-form-share-v1",
      share: {
        name: "Safety Intake",
        privacy: "public",
        target: { kind: "form", templateName: "Safety Report" },
      },
    };

    const result = await callSolutionAuthoringTool(
      "anydb_create_share",
      { ...request, share: JSON.stringify(request.share) },
      client,
    );

    expect(createShare).toHaveBeenCalledWith(request);
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      operation: "create_share",
      result: {
        targetKind: "form",
        privacy: "public",
        publicUrl: "https://workspace.example.com/f/share-token",
      },
    });
  });

  it("advertises and dispatches View and Share lifecycle tools", async () => {
    const byName = (name: string) =>
      SOLUTION_AUTHORING_TOOLS.find((tool) => tool.name === name)!;
    expect((byName("anydb_list_views").inputSchema as any).required).toEqual([
      "teamid",
      "adbid",
    ]);
    expect((byName("anydb_get_view").inputSchema as any).required).toEqual([
      "teamid",
      "adbid",
      "viewId",
    ]);
    expect((byName("anydb_delete_view").inputSchema as any).required).toEqual([
      "teamid",
      "adbid",
      "viewId",
      "clientRequestId",
    ]);
    expect(
      (byName("anydb_get_share").inputSchema as any).properties.kind.enum,
    ).toEqual(["record", "form"]);
    expect((byName("anydb_revoke_share").inputSchema as any).required).toEqual([
      "teamid",
      "adbid",
      "shareId",
      "kind",
      "clientRequestId",
    ]);
    for (const name of [
      "anydb_list_views",
      "anydb_get_view",
      "anydb_delete_view",
      "anydb_list_shares",
      "anydb_get_share",
      "anydb_revoke_share",
    ]) {
      expect(isSolutionAuthoringTool(name)).toBe(true);
      expect(JSON.stringify(byName(name).inputSchema)).not.toContain('"$ref"');
    }

    const listViews = jest
      .fn<ExtApiClient["listViews"]>()
      .mockResolvedValue([]);
    const getView = jest.fn<ExtApiClient["getView"]>().mockResolvedValue({
      viewId: "507f1f77bcf86cd799439013",
      name: "Low Stock",
      scope: "workspace",
      parentRecordId: "507f1f77bcf86cd799439014",
      targets: [],
    });
    const deleteView = jest.fn<ExtApiClient["deleteView"]>().mockResolvedValue({
      success: true,
      operation: "delete_view",
      requestId: "delete-view-v1",
      result: { viewId: "507f1f77bcf86cd799439013", deleted: true },
    });
    const listShares = jest
      .fn<ExtApiClient["listShares"]>()
      .mockResolvedValue([]);
    const getShare = jest.fn<ExtApiClient["getShare"]>().mockResolvedValue({
      shareId: "507f1f77bcf86cd799439015",
      kind: "record",
      privacy: "public",
      name: "Incident",
      target: {
        kind: "record",
        recordId: "507f1f77bcf86cd799439016",
        recordName: "Incident 42",
      },
      recipientUserCount: 0,
      recipientGroupNames: [],
      createdOn: "1786400000000",
      publicUrl: "https://workspace.example.com/s/token",
    });
    const revokeShare = jest
      .fn<ExtApiClient["revokeShare"]>()
      .mockResolvedValue({
        success: true,
        operation: "revoke_share",
        requestId: "revoke-share-v1",
        result: {
          shareId: "507f1f77bcf86cd799439015",
          kind: "record",
          revoked: true,
        },
      });
    const client = {
      listViews,
      getView,
      deleteView,
      listShares,
      getShare,
      revokeShare,
    } as unknown as ExtApiClient;
    const workspace = {
      teamid: "507f1f77bcf86cd799439011",
      adbid: "507f1f77bcf86cd799439012",
    };

    await callSolutionAuthoringTool("anydb_list_views", workspace, client);
    await callSolutionAuthoringTool(
      "anydb_get_view",
      { ...workspace, viewId: "507f1f77bcf86cd799439013" },
      client,
    );
    await callSolutionAuthoringTool(
      "anydb_delete_view",
      {
        ...workspace,
        viewId: "507f1f77bcf86cd799439013",
        clientRequestId: "delete-view-v1",
      },
      client,
    );
    await callSolutionAuthoringTool("anydb_list_shares", workspace, client);
    await callSolutionAuthoringTool(
      "anydb_get_share",
      {
        ...workspace,
        shareId: "507f1f77bcf86cd799439015",
        kind: "record",
      },
      client,
    );
    await callSolutionAuthoringTool(
      "anydb_revoke_share",
      {
        ...workspace,
        shareId: "507f1f77bcf86cd799439015",
        kind: "record",
        clientRequestId: "revoke-share-v1",
      },
      client,
    );

    expect(listViews).toHaveBeenCalledWith(workspace.teamid, workspace.adbid);
    expect(getView).toHaveBeenCalledWith(
      workspace.teamid,
      workspace.adbid,
      "507f1f77bcf86cd799439013",
    );
    expect(deleteView).toHaveBeenCalledWith(
      expect.objectContaining({ clientRequestId: "delete-view-v1" }),
    );
    expect(listShares).toHaveBeenCalledWith(workspace.teamid, workspace.adbid);
    expect(getShare).toHaveBeenCalledWith(
      workspace.teamid,
      workspace.adbid,
      "507f1f77bcf86cd799439015",
      "record",
    );
    expect(revokeShare).toHaveBeenCalledWith(
      expect.objectContaining({ clientRequestId: "revoke-share-v1" }),
    );
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

    const tool = SOLUTION_AUTHORING_TOOLS.find(
      (candidate) => candidate.name === "anydb_create_workflow",
    )!;
    expect(tool.name).toBe("anydb_create_workflow");
    expect(isSolutionAuthoringTool("anydb_create_workflow")).toBe(true);
    expect(tool.description).toContain("anydb_get_workflow_execution_history");
    expect(tool.inputSchema).toMatchObject({
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
    const workflowSchema = JSON.stringify(tool.inputSchema);
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

  it("advertises and forwards complete workflow action replacement", async () => {
    const updateWorkflow = jest.fn<ExtApiClient["updateWorkflow"]>();
    updateWorkflow.mockResolvedValue({
      success: true,
      operation: "update_workflow",
      requestId: "replace-workflow-actions-1",
      result: {
        workflowId: "507f1f77bcf86cd799439091",
        name: "On SAF Form Submit",
        description: "Updated chain",
        enabled: false,
      },
      graph: {
        actions: [
          {
            key: "find",
            type: "action_find",
            actionId: "action_find-runtime",
          },
          {
            key: "notify",
            type: "action_notification",
            actionId: "action_notification-runtime",
          },
        ],
      },
    } as UpdateWorkflowResult);
    const client = { updateWorkflow } as unknown as ExtApiClient;
    const request: UpdateWorkflowRequest & Record<string, unknown> = {
      teamid: "507f1f77bcf86cd799439011",
      adbid: "507f1f77bcf86cd799439012",
      workflowId: "507f1f77bcf86cd799439091",
      clientRequestId: "replace-workflow-actions-1",
      changes: {
        description: "Updated chain",
        actions: [
          {
            key: "find",
            type: "action_find",
            config: { query: "Status:Open" },
          },
          {
            key: "notify",
            type: "action_notification",
            config: { records: "{{find.records}}" },
          },
        ],
      },
    };

    const result = await callSolutionAuthoringTool(
      "anydb_update_workflow",
      { ...request, changes: JSON.stringify(request.changes) },
      client,
    );

    const tool = SOLUTION_AUTHORING_TOOLS.find(
      (candidate) => candidate.name === "anydb_update_workflow",
    );
    expect(
      (tool?.inputSchema as any).properties.changes.properties.actions,
    ).toMatchObject({ minItems: 1 });
    expect(tool?.description).toContain("complete ordered action chain");
    expect(tool?.description).toContain("inputSchema.required");
    expect(updateWorkflow).toHaveBeenCalledWith(request);
    expect(JSON.parse(result.content[0].text).graph.actions).toHaveLength(2);
  });

  it("advertises and forwards simulated workflow execution", async () => {
    const executeWorkflow = jest.fn<ExtApiClient["executeWorkflow"]>();
    executeWorkflow.mockResolvedValue({
      success: true,
      operation: "execute_workflow",
      result: {
        workflowId: "507f1f77bcf86cd799439091",
        simulated: true,
        execution: { executionId: "run-1", status: "success" },
      },
    } as ExecuteWorkflowResult);
    const client = { executeWorkflow } as unknown as ExtApiClient;
    const request: ExecuteWorkflowRequest & Record<string, unknown> = {
      teamid: "507f1f77bcf86cd799439011",
      adbid: "507f1f77bcf86cd799439012",
      workflowId: "507f1f77bcf86cd799439091",
      adoid: "507f1f77bcf86cd799439092",
      simulate: true,
    };

    const result = await callSolutionAuthoringTool(
      "anydb_execute_workflow",
      request,
      client,
    );

    const tool = SOLUTION_AUTHORING_TOOLS.find(
      (candidate) => candidate.name === "anydb_execute_workflow",
    );
    expect((tool?.inputSchema as any).required).toEqual([
      "teamid",
      "adbid",
      "workflowId",
      "simulate",
    ]);
    expect(tool?.description).toContain("simulate=false");
    expect(isSolutionAuthoringTool("anydb_execute_workflow")).toBe(true);
    expect(executeWorkflow).toHaveBeenCalledWith(request);
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      operation: "execute_workflow",
      result: { simulated: true },
    });
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
