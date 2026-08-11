import axios, { AxiosInstance } from "axios";

interface ExtApiClientConfig {
  apiKey: string;
  userEmail: string;
  baseURL: string;
}

interface ExtApiResponse<T> {
  status: string;
  data: T;
  message?: string;
}

export interface CreateWorkspaceRequest {
  teamid: string;
  name: string;
  clientRequestId: string;
}

export interface CreateWorkspaceResult {
  success: true;
  operation: "create_workspace";
  requestId: string;
  result: {
    adbid: string;
    teamid: string;
    name: string;
  };
}

export interface ListRecordsParams {
  teamid: string;
  adbid: string;
  parentid?: string;
  templateid?: string;
  templatename?: string;
  pagesize?: string;
  lastmarker?: string;
  filter?: Array<{
    type: "meta" | "badge" | "cell";
    field: string;
    op:
      | "eq"
      | "neq"
      | "gt"
      | "lt"
      | "gte"
      | "lte"
      | "like"
      | "contains"
      | "startswith"
      | "endswith"
      | "includes"
      | "notincludes";
    value: unknown;
  }>;
}

export interface DiscoverTypesParams {
  teamid: string;
  adbid: string;
  search: string;
  source?: "workspace" | "builtin" | "all";
  limit?: number;
}

export interface TemplateDiscoveryCandidate {
  source: "workspace" | "builtin";
  templateId: string;
  name: string;
  description: string;
  icon: string;
  version?: number;
  fieldCount: number;
  previewImageUrl?: string;
}

export interface TemplateDiscoveryResult {
  search: string;
  sources: {
    workspace?: {
      status: "ok" | "unavailable";
      candidates: TemplateDiscoveryCandidate[];
    };
    builtin?: {
      status: "ok" | "unavailable";
      candidates: TemplateDiscoveryCandidate[];
      categories?: string[];
    };
  };
  candidates: TemplateDiscoveryCandidate[];
}

export interface GetTypeDefinitionParams {
  teamid: string;
  adbid: string;
  templateName: string;
  source: "workspace" | "builtin";
}

export interface TypeDefinitionResult {
  source: "workspace" | "builtin";
  templateName: string;
  templateId?: string;
  status: "ok" | "not_found_or_unavailable";
  definition?: Record<string, unknown>;
}

export interface WorkflowSummary {
  workflowId: string;
  name: string;
  description?: string;
  enabled: boolean;
  createdAt: number;
  updatedAt?: number;
  trigger: {
    id: string;
    type: string;
    description?: string;
    config: Record<string, unknown>;
    nextActionId: string | null;
  } | null;
  actions: Array<{
    id: string;
    type: string;
    description?: string;
    config: Record<string, unknown>;
    nextActionIds: string[];
  }>;
}

export interface WorkflowDetails extends WorkflowSummary {
  executionHistory: unknown[];
}

export interface WorkflowArtifactCatalogEntry {
  type: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  creatableViaAnydbCreateWorkflow: boolean;
  availableForCurrentTeam?: boolean;
  unavailableReason?: string;
  supportedTriggers?: string[];
  guidance?: Record<string, unknown>;
}

export interface CreateTypeRequest {
  teamid: string;
  adbid: string;
  clientRequestId: string;
  validateOnly?: boolean;
  mode: "define" | "import_builtin";
  type?: Record<string, unknown>;
  builtInTemplateName?: string;
}

export interface CreateTypeResult {
  success: true;
  operation: "create_type";
  requestId: string;
  result: {
    templateId?: string;
    sourceTemplateId?: string;
    name: string;
    revision?: string;
    persisted: boolean;
  };
  warnings: string[];
  validation: { valid: true; errors: [] };
}

export interface CreateViewRequest {
  teamid: string;
  adbid: string;
  clientRequestId: string;
  validateOnly?: boolean;
  view: {
    name: string;
    scope: "workspace" | "children";
    parentRecordId?: string;
    targets: Array<{
      typeName: string;
      filters?: Array<{
        source: "cell" | "meta" | "badge";
        field: string;
        operator:
          | "eq"
          | "neq"
          | "gt"
          | "lt"
          | "gte"
          | "lte"
          | "like"
          | "contains"
          | "startswith"
          | "endswith"
          | "includes"
          | "notincludes";
        value: string | number | boolean;
        fieldType?: "string" | "number" | "boolean" | "date" | "array";
      }>;
    }>;
  };
}

export interface CreateViewResult {
  success: true;
  operation: "create_view";
  requestId: string;
  result: {
    viewId?: string;
    name: string;
    scope: "workspace" | "children";
    parentRecordId: string;
    targetTypes: string[];
    persisted: boolean;
  };
  validation: { valid: true; errors: [] };
}

export interface UpdateViewRequest {
  teamid: string;
  adbid: string;
  viewId: string;
  clientRequestId: string;
  validateOnly?: boolean;
  changes: {
    name?: string;
    targets?: CreateViewRequest["view"]["targets"];
  };
}

export interface UpdateViewResult {
  success: true;
  operation: "update_view";
  requestId: string;
  result: {
    viewId: string;
    name: string;
    targetTypes?: string[];
    persisted: boolean;
  };
  validation: { valid: true; errors: [] };
}

export interface ViewDefinition {
  viewId: string;
  name: string;
  scope: "workspace" | "children";
  parentRecordId: string;
  targets: Array<{
    typeName: string;
    templateId: string;
    filters: NonNullable<
      CreateViewRequest["view"]["targets"][number]["filters"]
    >;
  }>;
}

export interface DeleteViewRequest {
  teamid: string;
  adbid: string;
  viewId: string;
  clientRequestId: string;
}

export interface DeleteViewResult {
  success: true;
  operation: "delete_view";
  requestId: string;
  result: { viewId: string; deleted: true };
}

export interface CreateShareRequest {
  teamid: string;
  adbid: string;
  clientRequestId: string;
  validateOnly?: boolean;
  share: {
    name?: string;
    privacy: "public" | "private";
    target:
      | { kind: "record"; recordId: string }
      | { kind: "form"; templateName: string; parentRecordId?: string };
    recipients?: {
      emails?: string[];
      groupNames?: string[];
    };
    role?: "viewer" | "editor";
    withAttachments?: boolean;
  };
}

export interface CreateShareResult {
  success: true;
  operation: "create_share";
  requestId: string;
  result: {
    shareId?: string;
    shareToken?: string;
    publicUrl?: string;
    targetKind: "record" | "form";
    privacy: "public" | "private";
    name: string;
    parentRecordId?: string;
    templateName?: string;
    recipientEmails: string[];
    recipientGroups: string[];
    persisted: boolean;
  };
  validation: { valid: true; errors: [] };
}

export interface TeamGroup {
  groupId: string;
  name: string;
  memberCount: number;
  builtIn: boolean;
}

export interface ShareDefinition {
  shareId: string;
  kind: "record" | "form";
  privacy: "public" | "private";
  name: string;
  target:
    | { kind: "record"; recordId: string; recordName: string }
    | {
        kind: "form";
        templateName: string;
        parentRecordId: string;
        parentRecordName: string;
      };
  recipientUserCount: number;
  recipientGroupNames: string[];
  createdOn: string;
  publicUrl?: string;
}

export interface RevokeShareRequest {
  teamid: string;
  adbid: string;
  shareId: string;
  kind: "record" | "form";
  clientRequestId: string;
}

export interface RevokeShareResult {
  success: true;
  operation: "revoke_share";
  requestId: string;
  result: { shareId: string; kind: "record" | "form"; revoked: true };
}

export interface UpdateTypeRequest {
  teamid: string;
  adbid: string;
  templateName: string;
  clientRequestId: string;
  expectedRevision: string;
  validateOnly?: boolean;
  changes: Record<string, unknown>;
  confirmDataLoss: boolean;
}

export interface UpdateTypeResult {
  success: true;
  operation: "update_type";
  requestId: string;
  result: {
    name: string;
    previousTemplateId: string;
    templateId?: string;
    previousRevision: string;
    revision: string;
    persisted: boolean;
  };
  impact: { affectedFields: string[]; destructive: boolean };
  migration: {
    status: "not_started" | "queued" | "completed" | "enqueue_failed";
    jobId?: number;
  };
  warnings: string[];
  validation: { valid: true; errors: [] };
}

export interface CreateWorkflowRequest {
  teamid: string;
  adbid: string;
  clientRequestId: string;
  validateOnly?: boolean;
  workflow: {
    name: string;
    description?: string;
    enabled?: boolean;
    trigger: {
      type:
        | "trigger_on_form_submit"
        | "trigger_on_record_create"
        | "trigger_on_record_update"
        | "trigger_on_schedule"
        | "trigger_manual";
      config: Record<string, unknown>;
    };
    actions?: Array<{
      key: string;
      type: string;
      description?: string;
      config: Record<string, unknown>;
    }>;
    script?: { source: string; timeoutMs?: number };
  };
}

export interface CreateWorkflowResult {
  success: true;
  operation: "create_workflow";
  requestId: string;
  result: {
    workflowId?: string;
    name: string;
    enabled: boolean;
    persisted: boolean;
  };
  graph: {
    triggerType: string;
    triggerId?: string;
    actions: Array<{ key: string; type: string; actionId?: string }>;
    actionType?: "action_script";
    actionId?: string;
    recordIdBinding?: string;
  };
  warnings: string[];
  validation: { valid: true; errors: [] };
}

export interface UpdateWorkflowRequest {
  teamid: string;
  adbid: string;
  workflowId: string;
  clientRequestId: string;
  changes: {
    name?: string;
    description?: string;
    enabled?: boolean;
  };
}

export interface UpdateWorkflowResult {
  success: true;
  operation: "update_workflow";
  requestId: string;
  result: {
    workflowId: string;
    name: string;
    description: string;
    enabled: boolean;
  };
}

export interface BulkCreateRecordInput {
  clientref?: string;
  name: string;
  attach?: string;
  template?: string;
  templatename?: string;
  content?: Record<string, unknown>;
}

export interface CreateRecordRequest {
  teamid: string;
  adbid: string;
  name: string;
  attach?: string;
  templatename?: string;
  content?: Record<string, unknown>;
}

export interface BulkUpdateRecordInput {
  clientref?: string;
  meta: Record<string, unknown> & {
    adoid: string;
    adbid: string;
    teamid: string;
  };
  content?: Record<string, unknown>;
}

export class ExtApiClient {
  private client: AxiosInstance;

  constructor(config: ExtApiClientConfig) {
    this.client = axios.create({
      baseURL: config.baseURL,
      headers: {
        "Content-Type": "application/json",
        "x-anydb-api-key": config.apiKey,
        "x-anydb-email": config.userEmail,
      },
      timeout: 30000,
    });
    this.client.interceptors.response.use(
      (response) => response,
      (error: unknown) => Promise.reject(this.toRequestError(error)),
    );
  }

  private toRequestError(error: unknown): Error {
    if (!axios.isAxiosError(error)) {
      return error instanceof Error ? error : new Error(String(error));
    }

    const method = error.config?.method?.toUpperCase() || "REQUEST";
    const route = error.config?.url || "AnyDB API";
    const baseURL = error.config?.baseURL?.replace(/\/$/, "");
    const url = baseURL ? `${baseURL}/${route.replace(/^\//, "")}` : route;
    const status = error.response?.status;
    const responseBody = error.response?.data;
    const details: string[] = [];

    if (typeof responseBody === "string") {
      if (responseBody.trim()) details.push(responseBody.trim());
    } else if (responseBody !== undefined) {
      try {
        details.push(JSON.stringify(responseBody));
      } catch {
        details.push(String(responseBody));
      }
    }

    if (error.code) details.push(`transport code ${error.code}`);
    if (error.message && error.message !== "Error") {
      details.push(error.message);
    }
    if (error.cause instanceof Error && error.cause.message) {
      details.push(`cause: ${error.cause.message}`);
    }

    const context = `${method} ${url}${status ? ` failed (${status})` : " failed"}`;
    return new Error(
      `${context}: ${details.join("; ") || "unknown transport error"}`,
      {
        cause: error,
      },
    );
  }

  private unwrap<T>(response: ExtApiResponse<T>): T {
    if (response.status === "success") return response.data;
    throw new Error(response.message || "AnyDB request failed");
  }

  async listTemplates(teamid: string, adbid: string): Promise<unknown> {
    const response = await this.client.get<ExtApiResponse<unknown>>(
      "/integrations/ext/templates",
      { params: { teamid, adbid } },
    );
    return this.unwrap(response.data);
  }

  async getTemplate(
    teamid: string,
    adbid: string,
    templatename: string,
  ): Promise<unknown> {
    const response = await this.client.get<ExtApiResponse<unknown>>(
      `/integrations/ext/templates/${encodeURIComponent(templatename)}`,
      { params: { teamid, adbid } },
    );
    return this.unwrap(response.data);
  }

  async discoverTypes(
    params: DiscoverTypesParams,
  ): Promise<TemplateDiscoveryResult> {
    const response = await this.client.get<
      ExtApiResponse<TemplateDiscoveryResult>
    >("/integrations/ext/templates/discover", { params });
    return this.unwrap(response.data);
  }

  async getTypeDefinition(
    params: GetTypeDefinitionParams,
  ): Promise<TypeDefinitionResult> {
    const { templateName, ...query } = params;
    const response = await this.client.get<
      ExtApiResponse<TypeDefinitionResult>
    >(
      `/integrations/ext/templates/${encodeURIComponent(templateName)}/definition`,
      { params: query },
    );
    return this.unwrap(response.data);
  }

  async listWorkflows(
    teamid: string,
    adbid: string,
  ): Promise<WorkflowSummary[]> {
    const response = await this.client.get<ExtApiResponse<WorkflowSummary[]>>(
      "/integrations/ext/workflows",
      { params: { teamid, adbid } },
    );
    return this.unwrap(response.data);
  }

  async getWorkflow(
    teamid: string,
    adbid: string,
    workflowId: string,
  ): Promise<WorkflowDetails> {
    const response = await this.client.get<ExtApiResponse<WorkflowDetails>>(
      `/integrations/ext/workflows/${encodeURIComponent(workflowId)}`,
      { params: { teamid, adbid } },
    );
    return this.unwrap(response.data);
  }

  async getWorkflowExecutionHistory(
    teamid: string,
    adbid: string,
    workflowId: string,
  ): Promise<unknown[]> {
    const response = await this.client.get<ExtApiResponse<unknown[]>>(
      `/integrations/ext/workflows/${encodeURIComponent(workflowId)}/execution-history`,
      { params: { teamid, adbid } },
    );
    return this.unwrap(response.data);
  }

  async listWorkflowTriggers(
    teamid: string,
    adbid: string,
  ): Promise<WorkflowArtifactCatalogEntry[]> {
    const response = await this.client.get<
      ExtApiResponse<WorkflowArtifactCatalogEntry[]>
    >("/integrations/ext/workflow-triggers", {
      params: { teamid, adbid },
    });
    return this.unwrap(response.data);
  }

  async listWorkflowActions(
    teamid: string,
    adbid: string,
  ): Promise<WorkflowArtifactCatalogEntry[]> {
    const response = await this.client.get<
      ExtApiResponse<WorkflowArtifactCatalogEntry[]>
    >("/integrations/ext/workflow-actions", {
      params: { teamid, adbid },
    });
    return this.unwrap(response.data);
  }

  async createType(params: CreateTypeRequest): Promise<CreateTypeResult> {
    const response = await this.client.post<ExtApiResponse<CreateTypeResult>>(
      "/integrations/ext/templates",
      params,
    );
    return this.unwrap(response.data);
  }

  async createWorkspace(
    params: CreateWorkspaceRequest,
  ): Promise<CreateWorkspaceResult> {
    const response = await this.client.post<
      ExtApiResponse<CreateWorkspaceResult>
    >("/integrations/ext/workspaces", params);
    return this.unwrap(response.data);
  }

  async createView(params: CreateViewRequest): Promise<CreateViewResult> {
    const response = await this.client.post<ExtApiResponse<CreateViewResult>>(
      "/integrations/ext/views",
      params,
    );
    return this.unwrap(response.data);
  }

  async updateView(params: UpdateViewRequest): Promise<UpdateViewResult> {
    const { viewId, ...body } = params;
    const response = await this.client.put<ExtApiResponse<UpdateViewResult>>(
      `/integrations/ext/views/${encodeURIComponent(viewId)}`,
      body,
    );
    return this.unwrap(response.data);
  }

  async listViews(teamid: string, adbid: string): Promise<ViewDefinition[]> {
    const response = await this.client.get<ExtApiResponse<ViewDefinition[]>>(
      "/integrations/ext/views",
      { params: { teamid, adbid } },
    );
    return this.unwrap(response.data);
  }

  async getView(
    teamid: string,
    adbid: string,
    viewId: string,
  ): Promise<ViewDefinition> {
    const response = await this.client.get<ExtApiResponse<ViewDefinition>>(
      `/integrations/ext/views/${encodeURIComponent(viewId)}`,
      { params: { teamid, adbid } },
    );
    return this.unwrap(response.data);
  }

  async deleteView(params: DeleteViewRequest): Promise<DeleteViewResult> {
    const { viewId, ...data } = params;
    const response = await this.client.delete<ExtApiResponse<DeleteViewResult>>(
      `/integrations/ext/views/${encodeURIComponent(viewId)}`,
      { data },
    );
    return this.unwrap(response.data);
  }

  async createShare(params: CreateShareRequest): Promise<CreateShareResult> {
    const response = await this.client.post<ExtApiResponse<CreateShareResult>>(
      "/integrations/ext/shares",
      params,
    );
    return this.unwrap(response.data);
  }

  async listTeamGroups(teamid: string): Promise<TeamGroup[]> {
    const response = await this.client.get<ExtApiResponse<TeamGroup[]>>(
      "/integrations/ext/team-groups",
      { params: { teamid } },
    );
    return this.unwrap(response.data);
  }

  async listShares(teamid: string, adbid: string): Promise<ShareDefinition[]> {
    const response = await this.client.get<ExtApiResponse<ShareDefinition[]>>(
      "/integrations/ext/shares",
      { params: { teamid, adbid } },
    );
    return this.unwrap(response.data);
  }

  async getShare(
    teamid: string,
    adbid: string,
    shareId: string,
    kind: "record" | "form",
  ): Promise<ShareDefinition> {
    const response = await this.client.get<ExtApiResponse<ShareDefinition>>(
      `/integrations/ext/shares/${encodeURIComponent(shareId)}`,
      { params: { teamid, adbid, kind } },
    );
    return this.unwrap(response.data);
  }

  async revokeShare(params: RevokeShareRequest): Promise<RevokeShareResult> {
    const { shareId, ...data } = params;
    const response = await this.client.delete<
      ExtApiResponse<RevokeShareResult>
    >(`/integrations/ext/shares/${encodeURIComponent(shareId)}`, { data });
    return this.unwrap(response.data);
  }

  async updateType(params: UpdateTypeRequest): Promise<UpdateTypeResult> {
    const { templateName, ...body } = params;
    const response = await this.client.put<ExtApiResponse<UpdateTypeResult>>(
      `/integrations/ext/templates/${encodeURIComponent(templateName)}`,
      body,
    );
    return this.unwrap(response.data);
  }

  async createWorkflow(
    params: CreateWorkflowRequest,
  ): Promise<CreateWorkflowResult> {
    const response = await this.client.post<
      ExtApiResponse<CreateWorkflowResult>
    >("/integrations/ext/workflows", params);
    return this.unwrap(response.data);
  }

  async updateWorkflow(
    params: UpdateWorkflowRequest,
  ): Promise<UpdateWorkflowResult> {
    const { workflowId, ...body } = params;
    const response = await this.client.put<
      ExtApiResponse<UpdateWorkflowResult>
    >(`/integrations/ext/workflows/${encodeURIComponent(workflowId)}`, body);
    return this.unwrap(response.data);
  }

  async createRecord(params: CreateRecordRequest): Promise<unknown> {
    const response = await this.client.post<ExtApiResponse<unknown>>(
      "/integrations/ext/createrecord",
      params,
    );
    return this.unwrap(response.data);
  }

  async listRecords(params: ListRecordsParams): Promise<unknown> {
    const { filter, ...query } = params;
    const response = await this.client.get<ExtApiResponse<unknown>>(
      "/integrations/ext/list",
      {
        params: {
          ...query,
          filter: filter ? JSON.stringify(filter) : undefined,
        },
      },
    );
    return this.unwrap(response.data);
  }

  async bulkCreateRecords(params: {
    teamid: string;
    adbid: string;
    records: BulkCreateRecordInput[];
  }): Promise<unknown> {
    const response = await this.client.post<ExtApiResponse<unknown>>(
      "/integrations/ext/bulkcreaterecords",
      params,
    );
    return this.unwrap(response.data);
  }

  async bulkUpdateRecords(records: BulkUpdateRecordInput[]): Promise<unknown> {
    const response = await this.client.put<ExtApiResponse<unknown>>(
      "/integrations/ext/bulkupdaterecords",
      { records },
    );
    return this.unwrap(response.data);
  }
}
