/**
 * Client for interacting with AnyDB Internal API
 */

import axios, { AxiosInstance } from "axios";
import { config } from "./config.js";
import type {
  ADORecord,
  Team,
  ADB,
  CreateRecordParams,
  UpdateRecordParams,
  SearchRecordsParams,
  DownloadFileParams,
  DownloadFileResponse,
  GetUploadUrlParams,
  GetUploadUrlResponse,
  CompleteUploadParams,
  CompleteUploadResponse,
} from "./types.js";

export class AnyDBClient {
  private baseURL: string;

  constructor(defaultApiToken?: string) {
    this.baseURL = config.anydbApiBaseUrl;
    // Use provided token or fallback to env variable (for backward compatibility)
  }

  /**
   * Create an authenticated client with the provided API key and user email
   * Supports multi-tenant authentication by accepting per-request credentials
   */
  private getClient(apiKey?: string, userEmail?: string): AxiosInstance {
    const token = apiKey;

    if (!token) {
      throw new Error(
        "AnyDB API key required. Provide apiKey parameter."
      );
    }

    if (!userEmail) {
      throw new Error(
        "User email required. Provide userEmail parameter for authentication."
      );
    }

    const client = axios.create({
      baseURL: this.baseURL,
      headers: {
        "Content-Type": "application/json",
        "x-anydb-api-key": token,
        "x-anydb-email": userEmail,
      },
      timeout: 30000,
    });

    // Add request interceptor for logging
    client.interceptors.request.use(
      (config) => {
        const maskedKey = token
          ? `${token.substring(0, 8)}...${token.substring(token.length - 4)}`
          : "none";
        console.error(
          `[AnyDB Request] ${config.method?.toUpperCase()} ${config.baseURL}${
            config.url
          }`
        );
        console.error(`[AnyDB Request] API Key: ${maskedKey}`);
        console.error(`[AnyDB Request] User Email: ${userEmail}`);
        if (config.params && Object.keys(config.params).length > 0) {
          console.error(
            `[AnyDB Request] Params:`,
            JSON.stringify(config.params, null, 2)
          );
        }
        if (config.data) {
          console.error(
            `[AnyDB Request] Body:`,
            JSON.stringify(config.data, null, 2)
          );
        }
        return config;
      },
      (error) => {
        console.error(`[AnyDB Request Error]`, error);
        return Promise.reject(error);
      }
    );

    // Add response interceptor for logging
    client.interceptors.response.use(
      (response) => {
        console.error(
          `[AnyDB Response] Status: ${response.status} ${response.statusText}`
        );
        // Log brief summary instead of full response
        const dataType = Array.isArray(response.data)
          ? `Array[${response.data.length}]`
          : typeof response.data === "object"
          ? `Object{${Object.keys(response.data).join(", ")}}`
          : typeof response.data;
        console.error(`[AnyDB Response] Data Type: ${dataType}`);
        return response;
      },
      (error) => {
        if (error.response) {
          console.error(
            `[AnyDB Response Error] Status: ${error.response.status}`
          );
          const errorMsg =
            error.response.data?.message ||
            error.response.data?.error ||
            error.response.statusText;
          console.error(`[AnyDB Response Error] Message: ${errorMsg}`);
        } else if (error.request) {
          console.error(`[AnyDB Response Error] No response received`);
        } else {
          console.error(`[AnyDB Response Error] ${error.message}`);
        }
        return Promise.reject(error);
      }
    );

    return client;
  }

  // ============================================================================
  // AnyDB Record Operations
  // ============================================================================

  /**
   * Get a specific record by teamid, adbid, and adoid
   */
  async getRecord(
    teamid: string,
    adbid: string,
    adoid: string,
    apiKey?: string,
    userEmail?: string
  ): Promise<ADORecord> {
    try {
      const client = this.getClient(apiKey, userEmail);
      const response = await client.get("/integrations/ext/record", {
        params: { teamid, adbid, adoid },
      });
      return response.data;
    } catch (error) {
      console.error(`Error fetching record ${adoid}:`, error);
      throw new Error(`Failed to fetch record: ${error}`);
    }
  }

  /**
   * List all teams the API key provides access to
   */
  async listTeams(apiKey?: string, userEmail?: string): Promise<Team[]> {
    try {
      const client = this.getClient(apiKey, userEmail);
      const response = await client.get("/integrations/ext/listteams");
      return response.data;
    } catch (error) {
      console.error("Error fetching teams:", error);
      throw new Error(`Failed to fetch teams: ${error}`);
    }
  }

  /**
   * Get all ADBs (databases) for a specific team
   */
  async listDatabasesForTeam(
    teamid: string,
    apiKey?: string,
    userEmail?: string
  ): Promise<ADB[]> {
    try {
      const client = this.getClient(apiKey, userEmail);
      const response = await client.get("/integrations/ext/listdbsforteam", {
        params: { teamid },
      });
      return response.data;
    } catch (error) {
      console.error(`Error fetching databases for team ${teamid}:`, error);
      throw new Error(`Failed to fetch databases: ${error}`);
    }
  }

  /**
   * List all ADOs (records) in a database
   */
  async listRecords(
    teamid: string,
    adbid: string,
    parentid?: string,
    apiKey?: string,
    userEmail?: string
  ): Promise<ADORecord[]> {
    try {
      const client = this.getClient(apiKey, userEmail);
      const params: any = { teamid, adbid };
      if (parentid) {
        params.parentid = parentid;
      }
      const response = await client.get("/integrations/ext/list", {
        params,
      });
      return response.data;
    } catch (error) {
      console.error(`Error listing records for adb ${adbid}:`, error);
      throw new Error(`Failed to list records: ${error}`);
    }
  }

  /**
   * Create a new record
   */
  async createRecord(
    params: CreateRecordParams,
    apiKey?: string,
    userEmail?: string
  ): Promise<ADORecord> {
    try {
      const client = this.getClient(apiKey, userEmail);
      const response = await client.post(
        "/integrations/ext/createrecord",
        params
      );
      return response.data;
    } catch (error) {
      console.error("Error creating record:", error);
      throw new Error(`Failed to create record: ${error}`);
    }
  }

  /**
   * Update an existing record
   */
  async updateRecord(
    params: UpdateRecordParams,
    apiKey?: string,
    userEmail?: string
  ): Promise<ADORecord> {
    try {
      const client = this.getClient(apiKey, userEmail);
      const response = await client.put(
        "/integrations/ext/updaterecord",
        params
      );
      return response.data;
    } catch (error) {
      console.error("Error updating record:", error);
      throw new Error(`Failed to update record: ${error}`);
    }
  }

  /**
   * Search for records with a keyword
   */
  async searchRecords(
    params: SearchRecordsParams,
    apiKey?: string,
    userEmail?: string
  ): Promise<ADORecord[]> {
    try {
      const client = this.getClient(apiKey, userEmail);
      const response = await client.get("/integrations/ext/search", {
        params,
      });
      return response.data;
    } catch (error) {
      console.error("Error searching records:", error);
      throw new Error(`Failed to search records: ${error}`);
    }
  }

  /**
   * Download a file or get download URL from a record cell
   * If redirect is true, returns URL for direct download
   * If redirect is false, returns the file URL in response
   */
  async downloadFile(
    params: DownloadFileParams,
    apiKey?: string,
    userEmail?: string
  ): Promise<DownloadFileResponse> {
    try {
      const client = this.getClient(apiKey, userEmail);
      const queryParams: any = {
        teamid: params.teamid,
        adbid: params.adbid,
        adoid: params.adoid,
        cellpos: params.cellpos,
      };

      if (params.redirect !== undefined) {
        queryParams.redirect = params.redirect ? "1" : "0";
      }
      if (params.preview !== undefined) {
        queryParams.preview = params.preview ? "1" : "0";
      }

      const response = await client.get("/integrations/ext/download", {
        params: queryParams,
        maxRedirects: 0, // Don't follow redirects automatically
        validateStatus: (status) => status >= 200 && status < 400, // Accept 302
      });

      // If it's a redirect response, return the Location header
      if (response.status === 302 && response.headers.location) {
        return {
          url: response.headers.location,
          redirect: true,
        };
      }

      // Otherwise return the URL from response data
      return response.data;
    } catch (error) {
      console.error("Error downloading file:", error);
      throw new Error(`Failed to download file: ${error}`);
    }
  }

  /**
   * Step 1: Get upload URL from AnyDB service
   * Request a pre-signed URL to upload a file
   */
  async getUploadUrl(
    params: GetUploadUrlParams,
    apiKey?: string,
    userEmail?: string
  ): Promise<GetUploadUrlResponse> {
    try {
      const client = this.getClient(apiKey, userEmail);
      const response = await client.get("/integrations/ext/getuploadurl", {
        params: {
          filename: params.filename,
          teamid: params.teamid,
          adbid: params.adbid,
          adoid: params.adoid,
          filesize: params.filesize,
          cellpos: params.cellpos,
        },
      });
      return response.data;
    } catch (error) {
      console.error("Error getting upload URL:", error);
      throw new Error(`Failed to get upload URL: ${error}`);
    }
  }

  /**
   * Step 2: Upload file content to the provided URL
   * This is typically a direct upload to cloud storage (e.g., S3)
   */
  async uploadFileToUrl(
    uploadUrl: string,
    fileContent: Buffer | string,
    contentType?: string
  ): Promise<void> {
    try {
      await axios.put(uploadUrl, fileContent, {
        headers: {
          "Content-Type": contentType || "application/octet-stream",
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });
    } catch (error) {
      console.error("Error uploading file to URL:", error);
      throw new Error(`Failed to upload file to URL: ${error}`);
    }
  }

  /**
   * Step 3: Complete the upload process
   * Notify AnyDB service that the file has been uploaded
   */
  async completeUpload(
    params: CompleteUploadParams,
    apiKey?: string,
    userEmail?: string
  ): Promise<CompleteUploadResponse> {
    try {
      const client = this.getClient(apiKey, userEmail);
      const response = await client.put("/integrations/ext/completeupload", {
        filesize: params.filesize,
        teamid: params.teamid,
        adbid: params.adbid,
        adoid: params.adoid,
        cellpos: params.cellpos,
      });
      return response.data;
    } catch (error) {
      console.error("Error completing upload:", error);
      throw new Error(`Failed to complete upload: ${error}`);
    }
  }
}
