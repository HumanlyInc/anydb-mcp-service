/**
 * Type definitions for AnyDB Templates
 */

export interface FieldDefinition {
  name: string;
  type:
    | "text"
    | "number"
    | "date"
    | "boolean"
    | "select"
    | "multiselect"
    | "relation"
    | "formula";
  required?: boolean;
  description?: string;
  options?: string[]; // For select/multiselect
  formula?: string; // For formula fields
  relatedTemplate?: string; // For relation fields
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
  };
}

export interface TemplateStructure {
  id?: string;
  name: string;
  description?: string;
  fields: FieldDefinition[];
  relationships?: {
    templateId: string;
    type: "one-to-one" | "one-to-many" | "many-to-many";
    fieldName: string;
  }[];
  metadata?: {
    category?: string;
    tags?: string[];
    createdAt?: string;
    updatedAt?: string;
  };
}

export interface TemplateExample {
  id: string;
  name: string;
  description: string;
  category: string;
  useCase: string;
}

export interface TemplateValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
}

// AnyDB Record Types
export interface ADORecord {
  adoid: string;
  adbid: string;
  teamid: string;
  meta: {
    name: string;
    description?: string;
    icon?: string;
    followup?: number;
    locked?: boolean;
    status?: string;
    assignees?: {
      users?: string[];
      groups?: string[];
    };
  };
  content?: Record<string, any>;
  [key: string]: any;
}

export interface Team {
  teamid: string;
  name: string;
  [key: string]: any;
}

export interface ADB {
  adbid: string;
  teamid: string;
  name: string;
  [key: string]: any;
}

export interface CreateRecordParams {
  adbid: string;
  teamid: string;
  name: string;
  attach?: string;
  template?: string;
  content?: Record<string, any>;
}

export interface UpdateRecordParams {
  meta: {
    adoid: string;
    adbid: string;
    teamid: string;
    name?: string;
    description?: string;
    icon?: string;
    followup?: number;
    locked?: boolean;
    status?: string;
    assignees?: {
      users?: string[];
      groups?: string[];
    };
  };
  content?: Record<string, any>;
}

export interface DeleteRecordParams {
  adoid: string;
  adbid: string;
  teamid: string;
  removefromids: string; // Comma-separated parent ADOIDs, or NULL_OBJECTID to delete permanently
}

export interface SearchRecordsParams {
  adbid: string;
  teamid: string;
  parentid?: string;
  search: string;
  start?: string;
  limit?: string;
}

export interface DownloadFileParams {
  teamid: string;
  adbid: string;
  adoid: string;
  cellpos: string;
  redirect?: boolean;
  preview?: boolean;
}

export interface DownloadFileResponse {
  url?: string;
  redirect?: boolean;
}

export interface GetUploadUrlParams {
  filename: string;
  teamid: string;
  adbid: string;
  adoid: string;
  filesize: string;
  cellpos?: string;
}

export interface GetUploadUrlResponse {
  url: string;
  [key: string]: any;
}

export interface CompleteUploadParams {
  filesize: string;
  teamid: string;
  adbid: string;
  adoid?: string;
  cellpos?: string;
}

export interface CompleteUploadResponse {
  success: boolean;
  [key: string]: any;
}
