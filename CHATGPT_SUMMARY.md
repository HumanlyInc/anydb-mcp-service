# ChatGPT Integration Summary

## ✅ What's Been Added for ChatGPT Support

### New Files Created

1. **[src/rest-server.ts](src/rest-server.ts)** - REST API server that wraps MCP tools as HTTP endpoints
2. **[src/openapi-spec.ts](src/openapi-spec.ts)** - OpenAPI 3.1 specification for ChatGPT Custom GPT Actions
3. **[CHATGPT_INTEGRATION.md](CHATGPT_INTEGRATION.md)** - Complete integration guide with setup instructions
4. **[EXAMPLES.md](EXAMPLES.md)** - Real-world usage examples for both Claude and ChatGPT

### Updated Files

1. **[package.json](package.json)** - Added express, cors dependencies and new scripts
2. **[.env.example](.env.example)** - Added REST API configuration variables
3. **[README.md](README.md)** - Updated with ChatGPT integration info

## 🔄 Dual AI Platform Support

Your service now supports **both** Claude Desktop and ChatGPT:

| Feature         | Claude (MCP)          | ChatGPT (REST)          |
| --------------- | --------------------- | ----------------------- |
| **Protocol**    | MCP (stdio)           | HTTP REST API           |
| **Integration** | Claude Desktop config | Custom GPT Actions      |
| **Deployment**  | Local only            | Requires public URL     |
| **Setup**       | Simple config file    | Cloud deployment needed |
| **Auth**        | Not required          | API key required        |
| **Best For**    | Claude Desktop users  | ChatGPT Plus/Pro users  |

## 🚀 How to Use

### For Claude Desktop (Original MCP)

```bash
# Start MCP server
npm run start:mcp
```

Configure in Claude Desktop config file.

### For ChatGPT (New REST API)

```bash
# Start REST API server
npm run start:rest
```

Server runs on `http://localhost:3001`

For ChatGPT to access it, you need to:

1. Make it publicly accessible (ngrok for testing, cloud for production)
2. Create a Custom GPT in ChatGPT
3. Configure Actions with the OpenAPI spec
4. Add Bearer token authentication

## 📋 Quick Start for ChatGPT

### 1. Start the REST Server

```bash
npm run start:rest
```

### 2. Expose Publicly (Testing)

```bash
# Using ngrok
ngrok http 3001

# Note the URL: https://abc123.ngrok.io
```

### 3. Create Custom GPT

1. Go to ChatGPT → My GPTs → Create
2. **Name**: AnyDB Template Builder
3. **Instructions**:

```
You are an expert at helping users design and create AnyDB templates.
Guide users through:
1. Understanding requirements
2. Searching existing templates
3. Asking clarifying questions
4. Building template structures
5. Validating before creation
6. Creating and refining templates
```

4. **Actions**: Import OpenAPI from `https://abc123.ngrok.io/openapi.json`
5. **Authentication**: Bearer token (set your `CHATGPT_API_KEY`)

### 4. Test It

In your Custom GPT, try:

```
"I need a CRM template"
"Show me project management examples"
"Create an inventory tracking template"
```

## 🏗️ Architecture

```
┌─────────────┐              ┌─────────────┐
│   Claude    │              │  ChatGPT    │
│  Desktop    │              │ Custom GPT  │
└──────┬──────┘              └──────┬──────┘
       │ MCP                        │ HTTPS
       │ (stdio)                    │ REST
       │                            │
       ├────────────────────────────┤
       │                            │
┌──────▼──────────────────────────▼──────┐
│          AnyDB MCP Service              │
│  ┌─────────────┐    ┌─────────────┐   │
│  │ MCP Server  │    │ REST Server │   │
│  │ (index.ts)  │    │(rest-srv.ts)│   │
│  └──────┬──────┘    └──────┬──────┘   │
│         └──────────┬────────┘           │
│                    │                    │
│          ┌─────────▼─────────┐         │
│          │  AnyDB Client     │         │
│          │ (anydb-client.ts) │         │
│          └─────────┬─────────┘         │
└────────────────────┼───────────────────┘
                     │ HTTP
                     │
            ┌────────▼─────────┐
            │   AnyDB API      │
            │   (Backend)      │
            └────────┬─────────┘
                     │
            ┌────────▼─────────┐
            │    DynamoDB      │
            └──────────────────┘
```

## 🔒 Security for ChatGPT

### 1. API Key Authentication

Generate a strong key:

```bash
openssl rand -base64 32
```

Add to `.env`:

```env
CHATGPT_API_KEY=your-strong-random-key-here
```

### 2. CORS Configuration

The REST server is pre-configured to accept requests from ChatGPT domains:

- `https://chat.openai.com`
- `https://chatgpt.com`

### 3. Production Deployment

For production, deploy to:

- **AWS Lambda** + API Gateway
- **Google Cloud Run**
- **Railway** / **Render** / **Fly.io**
- **Azure Functions**

Don't use ngrok in production!

## 📡 Available REST Endpoints

All endpoints return JSON with format:

```json
{
  "success": true,
  "data": { ... }
}
```

### GET /templates/examples

List example templates (optionally filtered by category)

### GET /templates/:id/structure

Get detailed structure of a specific template

### GET /templates/search?q=query

Search for templates by keyword

### GET /field-types

Get available field types and descriptions

### GET /categories

Get available template categories

### POST /templates/validate

Validate a template structure before creation

### POST /templates

Create a new template

### PATCH /templates/:id

Update an existing template

### GET /openapi.json

Get the OpenAPI specification (for Custom GPT configuration)

## 🧪 Testing

### Test REST API

```bash
# Health check
curl http://localhost:3001/

# Search templates
curl "http://localhost:3001/templates/search?q=CRM" \
  -H "Authorization: Bearer your-api-key"

# Create template
curl -X POST http://localhost:3001/templates \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test CRM",
    "fields": [
      {"name": "company_name", "type": "text", "required": true}
    ]
  }'
```

## 📚 Documentation

- **[CHATGPT_INTEGRATION.md](CHATGPT_INTEGRATION.md)** - Full ChatGPT setup guide
- **[EXAMPLES.md](EXAMPLES.md)** - Real conversation examples
- **[README.md](README.md)** - General overview
- **[IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md)** - Backend API implementation

## 🎯 Next Steps

1. ✅ Dependencies installed (`express`, `cors`)
2. ✅ TypeScript compiled successfully
3. ⏭️ Start REST server: `npm run start:rest`
4. ⏭️ Expose publicly (ngrok for testing)
5. ⏭️ Create Custom GPT in ChatGPT
6. ⏭️ Import OpenAPI spec
7. ⏭️ Test template creation
8. ⏭️ Deploy to production

## 💡 Key Differences from MCP

### Why REST API for ChatGPT?

ChatGPT doesn't support the MCP protocol. It uses:

- **Custom GPT Actions** - HTTP REST API calls defined by OpenAPI spec
- **Function Calling** - Similar concept to MCP tools but over HTTP

### Advantages of REST API

- ✅ Works with ChatGPT, Copilot, and other AI platforms
- ✅ Can be called from any HTTP client
- ✅ Standard REST conventions
- ✅ OpenAPI documentation

### Disadvantages

- ⚠️ Requires public deployment
- ⚠️ Need authentication setup
- ⚠️ More complex infrastructure

## 🔧 Troubleshooting

### Port Already in Use

```bash
# Kill process on port 3001
lsof -ti:3001 | xargs kill -9

# Or use different port
REST_API_PORT=3002 npm run start:rest
```

### ChatGPT Can't Reach API

- Ensure REST server is running
- Verify ngrok/deployment URL is correct
- Check firewall settings
- Test with curl from external network

### Authentication Errors

- Verify API key matches in `.env` and Custom GPT
- Check Authorization header format
- Look at server logs

## 📊 Comparison Chart

| Capability        | MCP (Claude) | REST (ChatGPT) |
| ----------------- | ------------ | -------------- |
| List examples     | ✅           | ✅             |
| Get structure     | ✅           | ✅             |
| Search templates  | ✅           | ✅             |
| Get field types   | ✅           | ✅             |
| Validate template | ✅           | ✅             |
| Create template   | ✅           | ✅             |
| Update template   | ✅           | ✅             |
| Local only        | ✅           | ❌             |
| Public access     | ❌           | ✅             |
| Authentication    | Optional     | Required       |
| Setup complexity  | Low          | Medium         |

## ✨ Both Work Together!

You can run both servers simultaneously:

```bash
# Terminal 1: MCP for Claude
npm run start:mcp

# Terminal 2: REST for ChatGPT
npm run start:rest
```

This allows:

- Claude Desktop users to use MCP protocol
- ChatGPT users to use REST API
- Both accessing the same AnyDB backend!

---

**Ready to integrate with ChatGPT?** Follow [CHATGPT_INTEGRATION.md](CHATGPT_INTEGRATION.md) for detailed setup instructions!
