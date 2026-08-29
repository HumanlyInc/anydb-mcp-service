import axios, { AxiosInstance } from "axios";
import type {
  ADB,
  ADORecord,
  CompleteUploadParams,
  DeleteRecordParams,
  DownloadFileParams,
  DownloadFileResponse,
  GetUploadUrlParams,
  SearchRecordsParams,
  Team,
  UpdateRecordParams,
} from "./types.js";

export const FILE_TEMPLATE_ADOID = "222222222222222222222222";

interface ExtApiClientConfig {
  baseURL: string;
  /** Legacy API-key auth. Ignored when accessToken is present. */
  apiKey?: string;
  userEmail?: string;
  /** OAuth 2.1 bearer token. Takes precedence over the API key. */
  accessToken?: string;
  /**
   * Client this service is acting for, e.g. "claude-ai/0.1.0". Over MCP it is
   * usually set later via setOriginClient, once initialize has run.
   */
  originClient?: string;
  /** This service's own version, from config.serverVersion. */
  clientVersion?: string;
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

export interface SemanticSearchParams {
  teamid: string;
  adbid: string;
  query: string;
  limit?: number;
}

export interface SemanticSearchResponse {
  mode: "hybrid" | "lexical_only" | "dense_only" | "unavailable";
  warnings: string[];
  results: Array<{
    adoid: string;
    teamid: string;
    adbid: string;
    name: string;
    url: string | null;
    rank: number;
    score: number;
    chunks: Array<{
      chunkId: string;
      content: string;
      score: number;
    }>;
  }>;
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
    recordsToMigrate: number;
  };
  warnings: string[];
  validation: { valid: true; errors: [] };
}

export interface TypeMigrationStatus {
  jobId: number;
  status: string;
  progress: number;
  recordsProcessed: number;
  recordsToMigrate?: number;
  recordsRemaining?: number;
  errors: number;
  success?: boolean;
  message?: string;
  templateName?: string;
  previousTemplateId?: string;
  templateId?: string;
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
    actions?: Array<{
      key: string;
      type: string;
      description?: string;
      config: Record<string, unknown>;
    }>;
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
  graph?: {
    actions: Array<{ key: string; type: string; actionId: string }>;
  };
}

export interface ExecuteWorkflowRequest {
  teamid: string;
  adbid: string;
  workflowId: string;
  adoid?: string;
  simulate: boolean;
}

export interface ExecuteWorkflowResult {
  success: true;
  operation: "execute_workflow";
  result: {
    workflowId: string;
    simulated: boolean;
    execution: unknown;
  };
}

export interface BulkCreateRecordInput {
  clientref?: string;
  name: string;
  attach?: string | string[];
  template?: string;
  templatename?: string;
  content?: Record<string, unknown>;
}

export interface CreateRecordRequest {
  teamid: string;
  adbid: string;
  name: string;
  attach?: string | string[];
  template?: string;
  templatename?: string;
  content?: Record<string, unknown>;
}

export interface CopyRecordRequest {
  adoid: string;
  adbid: string;
  teamid: string;
  attachto?: string;
  attachmentsmode?: "noattachments" | "link" | "duplicate";
}

export interface UploadFileRequest {
  filename: string;
  fileContent: Buffer | string;
  teamid: string;
  adbid: string;
  adoid: string;
  cellpos?: string;
  contentType?: string;
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

/**
 * Identifies this service to the AnyDB server.
 *
 * The version is supplied by the caller (which reads package.json via config)
 * rather than read here. Reading it here would need import.meta.url, and
 * ts-jest compiles this file under a module setting that rejects import.meta
 * (TS1343) -- it would break every unit test that constructs a client. The
 * literal is only a fallback for callers that pass nothing.
 */
const CLIENT_NAME = "anydb-mcp-service";
const FALLBACK_VERSION = "2.3.0";

function clientIdentity(version?: string): string {
  return `${CLIENT_NAME}/${version || FALLBACK_VERSION} (node/${
    process.versions.node
  })`;
}

/**
 * Header the server reads to attribute a call to a first-party client.
 *
 * User-Agent carries the same string, but proxies rewrite it freely, so this
 * is the one that reliably survives. Both are self-declared: the server treats
 * them as telemetry and uses the OAuth client_id for attribution.
 */
const CLIENT_HEADER = "x-anydb-client";

/**
 * Header naming the client this service is acting *for*.
 *
 * This service is a proxy: an LLM client (Claude.ai, Claude Desktop, Cursor,
 * ChatGPT via the REST bridge) talks to it, and it talks to AnyDB. So
 * x-anydb-client identifies the proxy and answers "how did this call reach
 * us", while this one answers "who actually asked" -- which is usually the
 * more interesting question. Taken from the MCP initialize handshake's
 * clientInfo, so it is whatever the client chose to call itself.
 */
const ORIGIN_CLIENT_HEADER = "x-anydb-origin-client";

export class ExtApiClient {
  private client: AxiosInstance;
  private originClient?: string;

  constructor(config: ExtApiClientConfig) {
    this.client = axios.create({
      baseURL: config.baseURL,
      headers: {
        "Content-Type": "application/json",
        [CLIENT_HEADER]: clientIdentity(config.clientVersion),
        "User-Agent": clientIdentity(config.clientVersion),
        ...ExtApiClient.authHeaders(config),
      },
      timeout: 30000,
    });
    // Injected per request rather than fixed at construction: over MCP the
    // client only names itself during initialize, which happens after this
    // client already exists.
    this.client.interceptors.request.use((request) => {
      if (this.originClient) {
        request.headers.set(ORIGIN_CLIENT_HEADER, this.originClient);
      }
      return request;
    });
    this.client.interceptors.response.use(
      (response) => response,
      (error: unknown) => Promise.reject(this.toRequestError(error)),
    );

    if (config.originClient) this.setOriginClient(config.originClient);
  }

  /**
   * Name the client this service is acting for, e.g. "claude-ai/0.1.0".
   *
   * Safe to call after construction and more than once; a session is normally
   * initialized once, but a reconnect re-announces.
   */
  setOriginClient(identity: string | undefined): void {
    this.originClient = identity?.trim() || undefined;
  }

  /**
   * Build the auth headers for one credential set. A bearer token wins when
   * both are supplied so that an OAuth session never silently falls back to a
   * differently-scoped API key.
   */
  private static authHeaders(
    config: ExtApiClientConfig,
  ): Record<string, string> {
    if (config.accessToken) {
      return { Authorization: `Bearer ${config.accessToken}` };
    }
    const headers: Record<string, string> = {};
    if (config.apiKey) headers["x-anydb-api-key"] = config.apiKey;
    if (config.userEmail) headers["x-anydb-email"] = config.userEmail;
    return headers;
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

  async semanticSearch(
    params: SemanticSearchParams,
  ): Promise<SemanticSearchResponse> {
    const response = await this.client.post<
      ExtApiResponse<SemanticSearchResponse>
    >("/integrations/ext/semantic-search", params);
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

  async getTypeMigrationStatus(
    teamid: string,
    adbid: string,
    jobId: number,
  ): Promise<TypeMigrationStatus> {
    const response = await this.client.get<ExtApiResponse<TypeMigrationStatus>>(
      `/integrations/ext/type-migrations/${jobId}`,
      {
        params: { teamid, adbid },
      },
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

  async executeWorkflow(
    params: ExecuteWorkflowRequest,
  ): Promise<ExecuteWorkflowResult> {
    const { workflowId, ...body } = params;
    const response = await this.client.post<
      ExtApiResponse<ExecuteWorkflowResult>
    >(
      `/integrations/ext/workflows/${encodeURIComponent(workflowId)}/execute`,
      body,
    );
    return this.unwrap(response.data);
  }

  async createRecord(params: CreateRecordRequest): Promise<ADORecord> {
    const response = await this.client.post<ExtApiResponse<ADORecord>>(
      "/integrations/ext/createrecord",
      params,
    );
    return this.unwrap(response.data);
  }

  async getRecord(
    teamid: string,
    adbid: string,
    adoid: string,
  ): Promise<ADORecord> {
    const response = await this.client.get<ExtApiResponse<ADORecord>>(
      "/integrations/ext/record",
      { params: { teamid, adbid, adoid } },
    );
    return this.unwrap(response.data);
  }

  async listTeams(): Promise<Team[]> {
    const response = await this.client.get<ExtApiResponse<Team[]>>(
      "/integrations/ext/listteams",
    );
    return this.unwrap(response.data);
  }

  /**
   * What one user may do with one resource.
   *
   * `userid` is optional and defaults, server-side, to the authenticated
   * caller — which is the common case ("may I?").
   */
  async getEffectivePermissions(params: {
    teamid: string;
    adbid?: string;
    adoid?: string;
    userid?: string;
  }): Promise<unknown> {
    const response = await this.client.get<ExtApiResponse<unknown>>(
      "/integrations/ext/permissions",
      { params },
    );
    return this.unwrap(response.data);
  }

  /** Answer specific permission questions about one user and one resource. */
  async checkPermissions(params: {
    teamid: string;
    adbid?: string;
    adoid?: string;
    userid?: string;
    checks: Array<{ permission: string; level: string }>;
  }): Promise<unknown> {
    const response = await this.client.post<ExtApiResponse<unknown>>(
      "/integrations/ext/permissions/check",
      params,
    );
    return this.unwrap(response.data);
  }

  async createReport(params: {
    teamid: string;
    adbid: string;
    name: string;
    definition: Record<string, unknown>;
    validateOnly?: boolean;
  }): Promise<unknown> {
    const response = await this.client.post<ExtApiResponse<unknown>>(
      "/integrations/ext/reports",
      params,
    );
    return this.unwrap(response.data);
  }

  async listInbox(params: { teamid: string }): Promise<unknown> {
    const response = await this.client.get<ExtApiResponse<unknown>>(
      "/integrations/ext/inbox",
      { params },
    );
    return this.unwrap(response.data);
  }

  async listReports(params: {
    teamid: string;
    adbid: string;
  }): Promise<unknown> {
    const response = await this.client.get<ExtApiResponse<unknown>>(
      "/integrations/ext/reports",
      { params },
    );
    return this.unwrap(response.data);
  }

  async getReport(params: {
    teamid: string;
    adbid: string;
    reportId: string;
  }): Promise<unknown> {
    const { reportId, ...query } = params;
    const response = await this.client.get<ExtApiResponse<unknown>>(
      `/integrations/ext/reports/${encodeURIComponent(reportId)}`,
      { params: query },
    );
    return this.unwrap(response.data);
  }

  async updateReport(params: {
    teamid: string;
    adbid: string;
    reportId: string;
    name?: string;
    definition?: Record<string, unknown>;
    validateOnly?: boolean;
  }): Promise<unknown> {
    const { reportId, ...body } = params;
    const response = await this.client.put<ExtApiResponse<unknown>>(
      `/integrations/ext/reports/${encodeURIComponent(reportId)}`,
      body,
    );
    return this.unwrap(response.data);
  }

  async addComment(params: {
    teamid: string;
    adbid: string;
    adoid: string;
    text: string;
    cellPosition?: string;
  }): Promise<unknown> {
    const response = await this.client.post<ExtApiResponse<unknown>>(
      "/integrations/ext/comments",
      params,
    );
    return this.unwrap(response.data);
  }

  async resolveComment(params: {
    teamid: string;
    adbid: string;
    adoid: string;
    commentId: string;
    cellPosition?: string;
    resolved?: boolean;
  }): Promise<unknown> {
    const { commentId, ...body } = params;
    const response = await this.client.put<ExtApiResponse<unknown>>(
      `/integrations/ext/comments/${encodeURIComponent(commentId)}`,
      body,
    );
    return this.unwrap(response.data);
  }

  async listDatabasesForTeam(teamid: string): Promise<ADB[]> {
    const response = await this.client.get<ExtApiResponse<ADB[]>>(
      "/integrations/ext/listdbsforteam",
      { params: { teamid } },
    );
    return this.unwrap(response.data);
  }

  async updateRecord(params: UpdateRecordParams): Promise<ADORecord> {
    const response = await this.client.put<ExtApiResponse<ADORecord>>(
      "/integrations/ext/updaterecord",
      params,
    );
    return this.unwrap(response.data);
  }

  async removeRecord(params: DeleteRecordParams): Promise<boolean> {
    const response = await this.client.delete<ExtApiResponse<unknown>>(
      "/integrations/ext/remove",
      { data: params },
    );
    this.unwrap(response.data);
    return true;
  }

  async copyRecord(params: CopyRecordRequest): Promise<ADORecord> {
    const response = await this.client.post<ExtApiResponse<ADORecord>>(
      "/integrations/ext/copyrecord",
      params,
    );
    return this.unwrap(response.data);
  }

  async moveRecord(params: {
    adoid: string;
    adbid: string;
    teamid: string;
    parentid: string;
  }): Promise<ADORecord> {
    return this.updateRecord({
      meta: {
        adoid: params.adoid,
        adbid: params.adbid,
        teamid: params.teamid,
        attach: params.parentid,
      },
    });
  }

  async searchRecords(params: SearchRecordsParams): Promise<ADORecord[]> {
    const response = await this.client.get<ExtApiResponse<ADORecord[]>>(
      "/integrations/ext/search",
      { params },
    );
    return this.unwrap(response.data);
  }

  async downloadFile(
    params: DownloadFileParams,
  ): Promise<DownloadFileResponse> {
    const response = await this.client.get<DownloadFileResponse>(
      "/integrations/ext/download",
      {
        params: {
          teamid: params.teamid,
          adbid: params.adbid,
          adoid: params.adoid,
          cellpos: params.cellpos,
          redirect:
            params.redirect === undefined
              ? undefined
              : params.redirect
                ? "1"
                : "0",
          preview:
            params.preview === undefined
              ? undefined
              : params.preview
                ? "1"
                : "0",
        },
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 400,
      },
    );
    if (response.status === 302 && response.headers.location) {
      return { url: response.headers.location, redirect: true };
    }
    return response.data;
  }

  async getUploadUrl(params: GetUploadUrlParams): Promise<string> {
    const response = await this.client.get<ExtApiResponse<{ url: string }>>(
      "/integrations/ext/getuploadurl",
      { params },
    );
    return this.unwrap(response.data).url;
  }

  async uploadFileToUrl(
    uploadUrl: string,
    fileContent: Buffer | string,
    contentType?: string,
  ): Promise<void> {
    await axios.put(uploadUrl, fileContent, {
      headers: {
        "Content-Type": contentType || "application/octet-stream",
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
  }

  async completeUpload(params: CompleteUploadParams): Promise<boolean> {
    const response = await this.client.put<ExtApiResponse<unknown>>(
      "/integrations/ext/completeupload",
      params,
    );
    this.unwrap(response.data);
    return true;
  }

  async uploadFile(params: UploadFileRequest): Promise<string> {
    const cellpos = params.cellpos || "A1";
    const fileRecord = await this.createRecord({
      teamid: params.teamid,
      adbid: params.adbid,
      name: params.filename,
      attach: params.adoid,
      template: FILE_TEMPLATE_ADOID,
    });
    const fileAdoid = fileRecord.meta.adoid;
    const fileContent = Buffer.isBuffer(params.fileContent)
      ? params.fileContent
      : Buffer.from(params.fileContent);
    const filesize = fileContent.length.toString();
    const uploadUrl = await this.getUploadUrl({
      filename: params.filename,
      teamid: params.teamid,
      adbid: params.adbid,
      adoid: fileAdoid,
      filesize,
      cellpos,
    });
    await this.uploadFileToUrl(uploadUrl, fileContent, params.contentType);
    await this.completeUpload({
      filesize,
      teamid: params.teamid,
      adbid: params.adbid,
      adoid: fileAdoid,
      cellpos,
    });
    return fileAdoid;
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
