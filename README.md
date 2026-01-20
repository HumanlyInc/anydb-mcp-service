# AnyDB MCP Service

An MCP (Model Context Protocol) server that enables AI agents to create and manage AnyDB templates through natural language conversations.

## Overview

This MCP service allows AI assistants like Claude to help users build complex AnyDB templates interactively. The agent can:

- 🔍 Explore existing template examples for inspiration
- 📋 Understand template structures and field types
- 📐 Access exact JSON schemas from AnyDB source code
- 🤖 Use AnyDB's proven AI prompts for template generation
- 💬 Ask clarifying questions to gather requirements
- ✨ Generate template structures based on user prompts
- ✅ Validate templates before creation
- 🔧 Create and update templates using internal AnyDB APIs

## Use Case Example

**User:** "I want a CRM system"

**Agent Flow:**

1. Searches for similar templates (using `search_templates`)
2. Gets field types available (using `get_field_types`)
3. Asks clarifying questions:
   - "What customer information do you want to track?"
   - "Do you need to track deals/opportunities?"
   - "Should customers have multiple contacts?"
4. Builds template structure
5. Validates it (using `validate_template`)
6. Creates the template (using `create_template`)
7. Allows user to refine with updates (using `update_template`)

## 🤖 Agent Configuration

To make Claude follow a structured workflow (asking questions, validating, creating step-by-step), you need to configure it with system instructions:

**📖 See [AGENT_SYSTEM_PROMPT.md](AGENT_SYSTEM_PROMPT.md)** - Complete system prompt for agent behavior  
**📖 See [AGENT_USAGE_GUIDE.md](AGENT_USAGE_GUIDE.md)** - How to set up and use the agent

**Quick Setup:**

1. Open Claude Desktop → Projects
2. Create project: "AnyDB Template Builder"
3. Add Custom Instructions from [AGENT_SYSTEM_PROMPT.md](AGENT_SYSTEM_PROMPT.md)
4. Start building templates!

## Installation

```bash
npm install
npm run build
```

## Configuration

1. Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

2. Configure your AnyDB API settings:

```env
ANYDB_API_URL=http://localhost:3000/api

# Optional: For schema access from source code
ANYDB_SERVER_SOURCE=/Users/anis/Humanly/anydb-server
```

**Schema Access (Optional):** Set `ANYDB_SERVER_SOURCE` to enable direct access to AnyDB JSON schemas. This allows the MCP service to read schema definitions from `src/util/schema/` in the AnyDB server repository.

## Usage

### With Claude Desktop (MCP Protocol)

Add to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "AnyDB": {
      "command": "node",
      "args": ["/Users/anis/Humanly/anydb-mcp-service/dist/index.js"]
    }
  }
}
```

Start the MCP server:

```bash
npm run start:mcp
```

### With ChatGPT (REST API)

For ChatGPT Custom GPT integration, start the REST API server:

```bash
npm run start:rest
```

See [CHATGPT_INTEGRATION.md](CHATGPT_INTEGRATION.md) for detailed setup instructions.

### With Other MCP Clients

The server uses stdio transport and can be integrated with any MCP-compatible client:

```bash
node dist/index.js
```

## Available Tools

### 1. `list_template_examples`

Get example templates to understand common patterns.

```json
{
  "category": "CRM" // optional
}
```

### 2. `get_template_structure`

Get detailed structure of a specific template.

```json
{
  "templateId": "template-123"
}
```

### 3. `search_templates`

Search for templates by keyword.

```json
{
  "query": "customer management"
}
```

### 4. `get_field_types`

Get available field types and descriptions.

### 5. `get_categories`

Get available template categories.

### 6. `get_available_formulas`

Get available formula functions and operators for creating calculated fields. Essential for understanding what formulas can be used in template fields.

### 7. `get_field_type_formats`

Get detailed information about field/cell types including available formats and configuration options. Use this to understand how to properly format fields (e.g., date formats like MM/DD/YYYY, number formats like currency, chart types like bar/pie).

### 8. `get_template_schemas`

Get AnyDB template record JSON schemas directly from the source code. This provides the exact schema definitions for template records including:

- `adoobject` - Main template/object schema
- `adometa` - Metadata schema
- `adocell` - Cell/field schema
- `adoprop` - Property schema

```json
{
  "schemaName": "all" // or "adoobject", "adometa", "adocell", "adoprop"
}
```

**Note:** Requires `ANYDB_SERVER_SOURCE` environment variable to be set to the AnyDB server directory.

### 9. `get_template_generation_prompt`

Get AnyDB's built-in AI prompt for generating templates from natural language descriptions. This is the same comprehensive prompt that AnyDB uses internally with LLMs to create templates.

```json
{
  "userQuery": "CRM with customers, contacts, and deals"
}
```

**Returns:** Complete system prompt with schema definitions, format catalogs, validation rules, and best practices. Use this to generate templates using any LLM (Claude, GPT-4, etc.).

**Note:** Requires `ANYDB_SERVER_SOURCE` environment variable.

### 10. `get_validation_guidelines`

Get guidelines for validating whether a template generation request is appropriate, ethical, and suitable for template creation.

**Returns:** Validation checklist and rules for ensuring prompts are valid business use cases.

**Note:** Requires `ANYDB_SERVER_SOURCE` environment variable.

### 11. `validate_template`

Validate a template structure before creation.

```json
{
  "template": {
    "name": "Customer",
    "description": "Customer records",
    "fields": [...]
  }
}
```

### 12. `create_template`

Create a new template.

```json
{
  "template": {
    "name": "Customer",
    "description": "Customer records",
    "fields": [
      {
        "name": "company_name",
        "type": "text",
        "required": true
      }
    ]
  }
}
```

### 13. `update_template`

Update an existing template.

```json
{
  "templateId": "template-123",
  "updates": {
    "fields": [...]
  }
}
```

### 11. `update_template`

## Template Structure

Templates follow this structure:

```typescript
{
  name: string;
  description?: string;
  fields: [
    {
      name: string;
      type: 'text' | 'number' | 'date' | 'boolean' | 'select' | 'multiselect' | 'relation' | 'formula';
      required?: boolean;
      description?: string;
      options?: string[];  // for select/multiselect
      formula?: string;    // for formula fields
      relatedTemplate?: string;  // for relation fields
    }
  ];
  relationships?: [
    {
      templateId: string;
      type: 'one-to-one' | 'one-to-many' | 'many-to-many';
      fieldName: string;
    }
  ];
  metadata?: {
    category?: string;
    tags?: string[];
  };
}
```

## Integration with AnyDB API

The service connects to your internal AnyDB API. You'll need to implement these endpoints in your AnyDB backend:

### Required API Endpoints

- `GET /api/templates/examples` - List example templates
- `GET /api/templates/:id/structure` - Get template structure
- `GET /api/templates/search?q=query` - Search templates
- `GET /api/templates/field-types` - Get available field types
- `GET /api/templates/categories` - Get categories
- `POST /api/templates/validate` - Validate template structure
- `POST /api/templates` - Create template
- `PATCH /api/templates/:id` - Update template

### Example API Implementation (Express.js)

```typescript
// In your AnyDB backend
app.get("/api/templates/examples", async (req, res) => {
  const { category } = req.query;
  // Fetch from DynamoDB
  const templates = await getTemplatesFromDB(category);
  res.json(templates);
});

app.post("/api/templates", async (req, res) => {
  const template = req.body;
  // Validate and save to DynamoDB
  const result = await saveTemplateToDB(template);
  res.json({ id: result.id, message: "Template created successfully" });
});
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Development mode (watch)
npm run dev

# Run
npm start
```

## Architecture

```
┌─────────────────┐
│   AI Agent      │  (Claude, etc.)
│   (User Input)  │
└────────┬────────┘
         │ MCP Protocol
         │
┌────────▼────────┐
│  MCP Server     │  (This service)
│  - Tools        │
│  - Validation   │
└────────┬────────┘
         │ HTTP
         │
┌────────▼────────┐
│  AnyDB API      │  (Your existing API)
│  (Internal)     │
└────────┬────────┘
         │
┌────────▼────────┐
│   DynamoDB      │
└─────────────────┘
```

## Example Conversation Flow

```
User: I need a CRM system

Agent: I'll help you create a CRM template. Let me search for similar templates first.
[Uses search_templates with "CRM"]

Agent: I found some CRM examples. To customize it for you, I need to know:
1. What customer fields do you need? (e.g., company name, contact info)
2. Do you need deal/opportunity tracking?
3. Should we track customer interactions?

User: Yes, I need company name, email, phone, and deal tracking

Agent: Great! Let me create the template structure.
[Uses get_field_types to understand available types]
[Creates template JSON structure]
[Uses validate_template]

Agent: The template is valid. Should I create it?

User: Yes

Agent: [Uses create_template]
Template created successfully with ID: template-123
You can now use this template in AnyDB to track your customers and deals.
```

## AI Platform Support

### Claude Desktop (MCP)

- ✅ Native MCP protocol support
- ✅ Local stdio transport
- ✅ No public URL needed

### ChatGPT (REST API)

- ✅ Custom GPT Actions
- ✅ Requires REST API wrapper (included)
- ✅ Requires public URL or deployment
- 📖 See [CHATGPT_INTEGRATION.md](CHATGPT_INTEGRATION.md)

## Troubleshooting

### Connection Issues

- Ensure `ANYDB_API_URL` points to your internal API
- Check that the API is accessible from the server
- Verify authentication token if required

### Template Creation Fails

- Use `validate_template` before `create_template`
- Check field type compatibility
- Ensure relationship references exist

## License

MIT

## Next Steps

1. **For Claude Desktop (MCP)**:
   - Build: `npm run build`
   - Configure Claude Desktop config file
   - Start: `npm run start:mcp`
2. **For ChatGPT (REST API)**:

   - Install dependencies: `npm install`
   - Build: `npm run build`
   - Start REST server: `npm run start:rest`
   - Follow [CHATGPT_INTEGRATION.md](CHATGPT_INTEGRATION.md) for Custom GPT setup

3. **Implement Backend API Endpoints**: See [IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md)

4. **Test**: Try creating templates with natural language prompts

5. **Deploy**: For ChatGPT, deploy REST server to cloud platform
