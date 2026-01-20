# 🚀 Quick Reference Card

## Installation & Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your settings

# 3. Build
npm run build
```

## Running the Services

### For Claude Desktop (MCP)

```bash
npm run start:mcp
```

### For ChatGPT (REST API)

```bash
npm run start:rest
# Server runs on http://localhost:3001
```

## Environment Variables

```env
# AnyDB Backend
ANYDB_API_URL=http://localhost:3000/api

# Schema Access (Optional)
ANYDB_SERVER_SOURCE=/path/to/anydb-server

# REST API (ChatGPT)
REST_API_PORT=3001
CHATGPT_API_KEY=your-secret-key
```

## Testing Commands

```bash
# Test health
curl http://localhost:3001/

# Search templates
curl "http://localhost:3001/templates/search?q=CRM" \
  -H "Authorization: Bearer your-key"

# Get OpenAPI spec
curl http://localhost:3001/openapi.json
```

## ChatGPT Custom GPT Setup

1. **Expose locally** (testing only):

   ```bash
   ngrok http 3001
   ```

2. **Create Custom GPT**:

   - Go to ChatGPT → My GPTs → Create
   - Name: "AnyDB Template Builder"
   - Actions: Import from URL: `https://your-ngrok-url/openapi.json`
   - Auth: Bearer token (your CHATGPT_API_KEY)

3. **Test**:
   ```
   "I need a CRM template"
   ```

## Claude Desktop Setup

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "AnyDB": {
      "command": "node",
      "args": ["/path/to/anydb-mcp-service/dist/index.js"],
      "env": {
        "ANYDB_API_URL": "http://localhost:3000/api"
      }
    }
  }
}
```

## Available Tools/Endpoints

| Tool/Endpoint             | MCP Name                         | REST Endpoint                     |
| ------------------------- | -------------------------------- | --------------------------------- |
| List examples             | `list_template_examples`         | `GET /templates/examples`         |
| Get structure             | `get_template_structure`         | `GET /templates/:id/structure`    |
| Search                    | `search_templates`               | `GET /templates/search?q=...`     |
| Field types               | `get_field_types`                | `GET /field-types`                |
| Categories                | `get_categories`                 | `GET /categories`                 |
| Formulas                  | `get_available_formulas`         | `GET /formulas`                   |
| Field formats             | `get_field_type_formats`         | `GET /field-type-formats`         |
| Template schemas          | `get_template_schemas`           | `GET /template-schemas`           |
| **AI Generation Prompt**  | `get_template_generation_prompt` | `GET /template-generation-prompt` |
| **Validation Guidelines** | `get_validation_guidelines`      | `GET /validation-guidelines`      |
| Validate                  | `validate_template`              | `POST /templates/validate`        |
| Create                    | `create_template`                | `POST /templates`                 |
| Update                    | `update_template`                | `PATCH /templates/:id`            |

## Production Deployment (ChatGPT)

### Option 1: Railway

```bash
# Install Railway CLI
npm install -g railway

# Login and deploy
railway login
railway init
railway up
```

### Option 2: Docker + Cloud Run

```bash
# Build
docker build -t anydb-mcp-service .

# Deploy to Google Cloud Run
gcloud run deploy anydb-mcp-service --image anydb-mcp-service
```

### Option 3: AWS Lambda

Use Serverless Framework or AWS SAM

## Common Issues

| Issue        | Solution                                                   |
| ------------ | ---------------------------------------------------------- |
| Port in use  | `lsof -ti:3001 \| xargs kill -9`                           |
| Build errors | `rm -rf dist node_modules && npm install && npm run build` |
| Auth fails   | Check API key matches in .env and Custom GPT               |
| CORS error   | Verify ChatGPT domain in cors config                       |

## File Structure

```
anydb-mcp-service/
├── src/
│   ├── index.ts              # MCP server (Claude)
│   ├── rest-server.ts        # REST server (ChatGPT)
│   ├── anydb-client.ts       # AnyDB API client
│   ├── openapi-spec.ts       # OpenAPI specification
│   ├── types.ts              # TypeScript types
│   └── config.ts             # Configuration
├── dist/                     # Compiled JavaScript
├── CHATGPT_INTEGRATION.md    # Full ChatGPT guide
├── CHATGPT_SUMMARY.md        # Quick summary
├── EXAMPLES.md               # Usage examples
├── README.md                 # Main documentation
└── IMPLEMENTATION_GUIDE.md   # Backend API guide
```

## Example Conversation (Both Platforms)

**User**: "I need a CRM template"

**AI**:

1. Searches for similar templates
2. Asks clarifying questions
3. Gets field types
4. Builds template structure
5. Validates it
6. Creates the template
7. Returns template ID

## Links

- [Full ChatGPT Setup](CHATGPT_INTEGRATION.md)
- [Usage Examples](EXAMPLES.md)
- [Backend Implementation](IMPLEMENTATION_GUIDE.md)
- [Main README](README.md)

## Support Matrix

| Platform          | Status   | Notes                     |
| ----------------- | -------- | ------------------------- |
| Claude Desktop    | ✅ Ready | Use MCP server            |
| ChatGPT Plus      | ✅ Ready | Use REST API + Custom GPT |
| ChatGPT API       | ✅ Ready | Use REST API + Assistants |
| Other MCP clients | ✅ Ready | Use MCP server            |
| Direct API        | ✅ Ready | Use REST endpoints        |

---

**Quick Start**: `npm install && npm run build && npm run start:rest`
