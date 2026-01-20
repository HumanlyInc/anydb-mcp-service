# ChatGPT Integration Guide

This guide explains how to integrate the AnyDB Template service with ChatGPT using Custom GPT Actions.

## Overview

ChatGPT doesn't support the MCP protocol, so we provide a REST API wrapper that exposes the same functionality as HTTP endpoints. The REST API can be used with:

1. **Custom GPT Actions** (Recommended) - For ChatGPT Plus/Pro users
2. **OpenAI Assistants API** - For programmatic integration
3. **Direct API calls** - From any HTTP client

## Architecture

```
┌─────────────────┐
│   ChatGPT       │
│   Custom GPT    │
└────────┬────────┘
         │ HTTP/REST
         │
┌────────▼────────┐
│  REST API       │  (rest-server.ts)
│  Wrapper        │
└────────┬────────┘
         │ Internal calls
         │
┌────────▼────────┐
│  AnyDB Client   │  (anydb-client.ts)
└────────┬────────┘
         │ HTTP
         │
┌────────▼────────┐
│  AnyDB API      │  (Your backend)
└─────────────────┘
```

## Setup

### 1. Install Additional Dependencies

```bash
npm install express cors
npm install --save-dev @types/express @types/cors
```

### 2. Update package.json Scripts

Add these scripts to [package.json](package.json):

```json
{
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "start:mcp": "node dist/index.js",
    "start:rest": "node dist/rest-server.js",
    "prepare": "npm run build"
  }
}
```

### 3. Configure Environment Variables

Update your `.env` file:

```env
# AnyDB Internal API
ANYDB_API_URL=http://localhost:3000/api

# REST API Configuration
REST_API_PORT=3001
CHATGPT_API_KEY=your-secret-key-for-chatgpt
```

### 4. Build and Start the REST Server

```bash
# Build
npm run build

# Start REST API server
npm run start:rest
```

The server will be available at `http://localhost:3001`

## Integration Methods

### Method 1: Custom GPT with Actions (Recommended)

#### Step 1: Create a Custom GPT

1. Go to [ChatGPT](https://chat.openai.com/) (requires ChatGPT Plus/Pro)
2. Click your profile → "My GPTs" → "Create a GPT"
3. In the Configure tab:

   - **Name**: AnyDB Template Builder
   - **Description**: "I help you create and manage AnyDB templates for structured data"
   - **Instructions**:

   ```
   You are an expert at helping users design and create AnyDB templates. Your role is to:

   1. Understand user requirements through conversation
   2. Search existing templates for inspiration
   3. Ask clarifying questions about fields, relationships, and data structure
   4. Validate template designs before creation
   5. Create templates using the AnyDB API
   6. Help users refine and update templates

   When a user asks to create a template:
   - First search for similar templates to understand patterns
   - Ask specific questions about required fields
   - Explain field types available
   - Build the template structure step by step
   - Validate before creating
   - Create the template and provide the ID

   Be conversational, helpful, and guide users through the process.
   ```

#### Step 2: Configure Actions

1. In the "Actions" section, click "Create new action"
2. Choose "Import from URL" or paste the OpenAPI schema

**Option A: Import from URL** (if REST server is publicly accessible):

```
http://your-server:3001/openapi.json
```

**Option B: Paste OpenAPI Schema**:

Copy the OpenAPI specification from [src/openapi-spec.ts](src/openapi-spec.ts) and paste it into the schema editor.

#### Step 3: Configure Authentication

1. In the Actions panel, scroll to "Authentication"
2. Select "API Key"
3. Set:
   - **Auth Type**: Bearer
   - **API Key**: Your `CHATGPT_API_KEY` from `.env`

#### Step 4: Privacy & Sharing

- Set to "Only me" for testing
- Set to "Anyone with a link" to share with team
- Set to "Public" to publish to GPT Store (requires verification)

#### Step 5: Test Your Custom GPT

Try these prompts:

```
"I need a CRM template"
"Show me examples of project management templates"
"Create a template for tracking inventory"
"Add a new field to template-123"
```

### Method 2: OpenAI Assistants API

For programmatic integration:

```typescript
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const assistant = await openai.beta.assistants.create({
  name: "AnyDB Template Builder",
  instructions: "You help users create AnyDB templates...",
  model: "gpt-4-turbo-preview",
  tools: [
    {
      type: "function",
      function: {
        name: "search_templates",
        description: "Search for templates by keyword",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query",
            },
          },
          required: ["query"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "create_template",
        description: "Create a new template",
        parameters: {
          type: "object",
          properties: {
            template: {
              type: "object",
              description: "Template structure",
            },
          },
          required: ["template"],
        },
      },
    },
    // Add other functions...
  ],
});

// When function is called, make HTTP request to REST API
async function handleFunctionCall(functionName: string, args: any) {
  const response = await fetch(`http://localhost:3001/...`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.CHATGPT_API_KEY}`,
    },
    body: JSON.stringify(args),
  });
  return response.json();
}
```

### Method 3: Direct API Usage

You can also call the REST API directly from any client:

```bash
# Search templates
curl -X GET "http://localhost:3001/templates/search?q=CRM" \
  -H "Authorization: Bearer your-api-key"

# Create template
curl -X POST "http://localhost:3001/templates" \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Customer CRM",
    "fields": [
      {
        "name": "company_name",
        "type": "text",
        "required": true
      }
    ]
  }'
```

## Making the REST API Publicly Accessible

For ChatGPT Custom GPT to access your API, it needs to be publicly accessible. Options:

### Option 1: Deploy to Cloud

Deploy the REST server to:

- **AWS Lambda** + API Gateway
- **Google Cloud Run**
- **Azure Functions**
- **Railway** / **Render** / **Fly.io**

Example Dockerfile for deployment:

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist ./dist

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "dist/rest-server.js"]
```

### Option 2: Use ngrok for Testing

For development/testing only:

```bash
# Install ngrok
brew install ngrok  # macOS
# or download from https://ngrok.com

# Expose local server
ngrok http 3001
```

This gives you a public URL like `https://abc123.ngrok.io` that you can use in ChatGPT.

**⚠️ Security Warning**: Don't use ngrok for production. Use proper cloud hosting with authentication.

### Option 3: Expose via VPN/Tailscale

If your AnyDB API is only accessible on local subnet, consider:

- **Tailscale** - Private mesh VPN
- **CloudFlare Tunnel** - Zero Trust tunneling

## Security Considerations

### 1. API Key Authentication

The REST server uses Bearer token authentication. Set a strong key:

```env
CHATGPT_API_KEY=your-strong-random-key-here
```

Generate a secure key:

```bash
openssl rand -base64 32
```

### 2. Rate Limiting

Add rate limiting to prevent abuse:

```typescript
import rateLimit from "express-rate-limit";

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});

app.use(limiter);
```

### 3. CORS Configuration

Update CORS settings for production:

```typescript
app.use(
  cors({
    origin: ["https://chat.openai.com", "https://chatgpt.com"],
    credentials: true,
  })
);
```

### 4. Input Validation

Add validation middleware:

```bash
npm install express-validator
```

```typescript
import { body, validationResult } from "express-validator";

app.post(
  "/templates",
  body("name").isString().notEmpty(),
  body("fields").isArray({ min: 1 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    // ... rest of handler
  }
);
```

## Testing

### Test REST API Endpoints

```bash
# Test health check
curl http://localhost:3001/

# Test authentication
curl http://localhost:3001/templates/examples \
  -H "Authorization: Bearer your-api-key"

# Test template search
curl "http://localhost:3001/templates/search?q=CRM" \
  -H "Authorization: Bearer your-api-key"

# Test template creation
curl -X POST http://localhost:3001/templates \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Template",
    "description": "A test template",
    "fields": [
      {
        "name": "test_field",
        "type": "text",
        "required": true
      }
    ]
  }'
```

### Test with Custom GPT

1. Create a Custom GPT with the configuration above
2. Start a chat and try:
   ```
   "Search for CRM templates"
   "What field types are available?"
   "Create a simple customer management template"
   ```
3. Verify the Custom GPT makes API calls and gets responses

## Comparison: MCP vs REST/ChatGPT

| Feature          | MCP (Claude)          | REST (ChatGPT)      |
| ---------------- | --------------------- | ------------------- |
| Protocol         | stdio/MCP             | HTTP/REST           |
| Integration      | Claude Desktop config | Custom GPT Actions  |
| Auth             | Not required locally  | API Key required    |
| Deployment       | Local only            | Requires public URL |
| Setup Complexity | Low                   | Medium              |
| Best For         | Claude users          | ChatGPT users       |

## Troubleshooting

### ChatGPT can't reach the API

- Ensure REST server is running: `npm run start:rest`
- Verify the URL is publicly accessible
- Check firewall/security group settings
- Test with curl from outside your network

### Authentication errors

- Verify `CHATGPT_API_KEY` matches in `.env` and Custom GPT config
- Check Authorization header format: `Bearer <token>`
- Look at server logs for auth errors

### CORS errors

- Update CORS configuration to allow ChatGPT domain
- Check browser console for specific CORS errors
- Verify preflight OPTIONS requests are handled

### Function calls not working

- Verify OpenAPI spec is correctly imported
- Check that operationId matches the endpoint
- Look at Custom GPT logs in the Configure panel
- Test endpoints directly with curl first

## Next Steps

1. ✅ Build the REST server: `npm run build`
2. ✅ Start the server: `npm run start:rest`
3. ✅ Expose it publicly (ngrok for testing, cloud for production)
4. ✅ Create Custom GPT with Actions
5. ✅ Test with various template creation scenarios
6. ✅ Deploy to production with proper security
7. ✅ Monitor usage and add analytics

## Resources

- [OpenAI Custom GPT Documentation](https://platform.openai.com/docs/actions)
- [OpenAPI Specification](https://swagger.io/specification/)
- [Express.js Documentation](https://expressjs.com/)
- [ngrok Documentation](https://ngrok.com/docs)
