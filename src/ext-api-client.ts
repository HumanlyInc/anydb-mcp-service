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

export interface BulkCreateRecordInput {
  clientref?: string;
  name: string;
  attach?: string;
  template?: string;
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
