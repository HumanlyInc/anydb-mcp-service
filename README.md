# AnyDB MCP Service

An MCP (Model Context Protocol) server that enables AI agents to create and manage AnyDB templates through natural language conversations.

## Overview

This MCP service allows AI assistants like Claude to help users build complex AnyDB data interactively.

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
ANYDB_API_URL=https://app.anydb.com/api

```

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

### Record Operations (7 tools)

- `get_record` - Get a specific record with all cell data
- `list_teams` - List all teams accessible with your credentials
- `list_databases_for_team` - Get all databases within a team
- `list_records` - List all records in a database
- `create_record` - Create a new record in a database
- `update_record` - Update an existing record
- `search_records` - Search for records by keyword

### File Operations (2 tools)

- `download_file` - Download or get URL for files attached to record cells
- `upload_file` - Upload a file to a record (handles complete upload process)

**Total: 9 tools** for AnyDB record and file management

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
