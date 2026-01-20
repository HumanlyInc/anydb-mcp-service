/**
 * Schema utilities for reading AnyDB source schemas
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { config } from "./config.js";

export interface ADOSchema {
  adoobject?: any;
  adometa?: any;
  adocell?: any;
  adoprop?: any;
}

/**
 * Schema reader class for accessing AnyDB source schemas and prompts
 */
export class SchemaReader {
  private schemaPath: string;
  private promptsPath: string;
  private schemasCache: Map<string, any> = new Map();
  private promptsCache: Map<string, string> = new Map();

  constructor() {
    this.schemaPath = config.anydbServerSource
      ? join(config.anydbServerSource, "src", "util", "schema")
      : "";
    this.promptsPath = config.anydbServerSource
      ? join(config.anydbServerSource, "src", "modules", "integrations", "ai")
      : "";
  }

  /**
   * Check if schema directory is accessible
   */
  isAvailable(): boolean {
    if (!this.schemaPath) {
      return false;
    }
    return existsSync(this.schemaPath);
  }

  /**
   * Read a schema file by name
   */
  private readSchemaFile(filename: string): any {
    // Check cache first
    if (this.schemasCache.has(filename)) {
      return this.schemasCache.get(filename);
    }

    if (!this.isAvailable()) {
      throw new Error(
        "Schema directory not configured or not accessible. Set ANYDB_SERVER_SOURCE environment variable."
      );
    }

    const filePath = join(this.schemaPath, filename);

    if (!existsSync(filePath)) {
      throw new Error(`Schema file not found: ${filename}`);
    }

    try {
      const content = readFileSync(filePath, "utf-8");
      const schema = JSON.parse(content);

      // Cache the schema
      this.schemasCache.set(filename, schema);

      return schema;
    } catch (error) {
      throw new Error(
        `Failed to read schema file ${filename}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Get ADO Object schema (main template schema)
   */
  getADOObjectSchema(): any {
    return this.readSchemaFile("adoobject_schema.json");
  }

  /**
   * Get ADO Meta schema (metadata schema)
   */
  getADOMetaSchema(): any {
    return this.readSchemaFile("adometa_schema.json");
  }

  /**
   * Get ADO Cell schema (cell/field schema)
   */
  getADOCellSchema(): any {
    return this.readSchemaFile("adocell_schema.json");
  }

  /**
   * Get ADO Prop schema (property schema)
   */
  getADOPropSchema(): any {
    return this.readSchemaFile("adoprop_schema.json");
  }

  /**
   * Get all schemas
   */
  getAllSchemas(): ADOSchema {
    return {
      adoobject: this.getADOObjectSchema(),
      adometa: this.getADOMetaSchema(),
      adocell: this.getADOCellSchema(),
      adoprop: this.getADOPropSchema(),
    };
  }

  /**
   * Get a human-readable summary of the ADO Object schema
   */
  getSchemaDescription(): string {
    try {
      const adoobject = this.getADOObjectSchema();
      const adometa = this.getADOMetaSchema();
      const adocell = this.getADOCellSchema();
      const adoprop = this.getADOPropSchema();

      return JSON.stringify(
        {
          description: "AnyDB Template Record Schemas",
          schemas: {
            adoobject: {
              description: "Main template/object schema",
              properties: Object.keys(adoobject.properties || {}),
              required: adoobject.required || [],
            },
            adometa: {
              description: "Metadata schema for templates",
              properties: Object.keys(adometa.properties || {}),
              required: adometa.required || [],
            },
            adocell: {
              description: "Cell/field schema",
              properties: Object.keys(adocell.properties || {}),
              required: adocell.required || [],
            },
            adoprop: {
              description: "Property schema",
              properties: Object.keys(adoprop.properties || {}),
              required: adoprop.required || [],
            },
          },
        },
        null,
        2
      );
    } catch (error) {
      return JSON.stringify(
        {
          error: "Schema not available",
          message: error instanceof Error ? error.message : String(error),
          note: "Set ANYDB_SERVER_SOURCE environment variable to the AnyDB server directory",
        },
        null,
        2
      );
    }
  }

  /**
   * Clear the cache (useful for development)
   */
  clearCache(): void {
    this.schemasCache.clear();
    this.promptsCache.clear();
  }

  /**
   * Get the template generation prompt
   * This is the system prompt used by AnyDB's AI to generate templates from natural language
   */
  getTemplateGenerationPrompt(userQuery: string): string {
    const cacheKey = "template_generation_prompt";

    // Check if we have the base prompt cached
    if (!this.promptsCache.has(cacheKey)) {
      if (!config.anydbServerSource) {
        throw new Error(
          "Prompts not accessible. Set ANYDB_SERVER_SOURCE environment variable."
        );
      }

      const promptFilePath = join(this.promptsPath, "ai.prompts.ts");

      if (!existsSync(promptFilePath)) {
        throw new Error(`Prompt file not found at: ${promptFilePath}`);
      }

      try {
        const content = readFileSync(promptFilePath, "utf-8");
        this.promptsCache.set(cacheKey, content);
      } catch (error) {
        throw new Error(
          `Failed to read prompt file: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    // Extract and format the prompt with user query
    const promptContent = this.promptsCache.get(cacheKey)!;

    // Extract the templateGenerationQuery function content
    const match = promptContent.match(
      /export const templateGenerationQuery[\s\S]*?return `([\s\S]*?)`;/
    );

    if (!match) {
      throw new Error("Could not extract template generation prompt from file");
    }

    const promptTemplate = match[1];

    // Replace ${userQuery} with actual user query
    const finalPrompt = promptTemplate.replace(/\$\{userQuery\}/g, userQuery);

    return finalPrompt;
  }

  /**
   * Get validation guidelines for checking if a prompt is valid
   */
  getValidationGuidelines(): string {
    const cacheKey = "validation_guidelines";

    if (!this.promptsCache.has(cacheKey)) {
      if (!config.anydbServerSource) {
        throw new Error(
          "Prompts not accessible. Set ANYDB_SERVER_SOURCE environment variable."
        );
      }

      const promptFilePath = join(this.promptsPath, "ai.prompts.ts");

      if (!existsSync(promptFilePath)) {
        throw new Error(`Prompt file not found at: ${promptFilePath}`);
      }

      try {
        const content = readFileSync(promptFilePath, "utf-8");

        // Extract validation guidelines
        const match = content.match(
          /export const validationGuidelines = `([\s\S]*?)`;/
        );

        if (!match) {
          throw new Error("Could not extract validation guidelines from file");
        }

        this.promptsCache.set(cacheKey, match[1]);
      } catch (error) {
        throw new Error(
          `Failed to read validation guidelines: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    return this.promptsCache.get(cacheKey)!;
  }
}

// Export singleton instance
export const schemaReader = new SchemaReader();
