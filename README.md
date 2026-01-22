# AnyDB MCP Service

[![npm version](https://img.shields.io/npm/v/anydb-mcp-service.svg)](https://www.npmjs.com/package/anydb-mcp-service)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A Model Context Protocol (MCP) server that enables AI agents to interact with [AnyDB](https://www.anydb.com) for database and record management through natural language conversations.

## Overview

This MCP service provides seamless integration between AI assistants (like Claude) and AnyDB, allowing you to:

- Create, read, update, and search database records
- Manage teams and databases
- Upload and download files
- Build complex data workflows through natural language

Perfect for automating AnyDB operations, building AI-powered data assistants, and integrating AnyDB with AI workflows.

## About AnyDB

[AnyDB](https://www.anydb.com) is an object-based platform for managing custom business operations.

Most software forces work into rigid tables, fixed modules, or predefined workflows. Real operations do not work that way. They are made up of things that belong together and things that relate to each other.

AnyDB lets you model your business the way it actually runs.

### The Problem AnyDB Solves

Operational data is usually fragmented:

- Information spread across spreadsheets, tools, folders, and emails
- Records split across multiple tables that only make sense when joined
- Files and notes disconnected from the data they belong to
- Systems that break when workflows evolve

AnyDB replaces this with complete, connected business records.

Visit [www.anydb.com](https://www.anydb.com) to learn more.

## Installation

```bash
npm install anydb-mcp-service
```

Or install globally:

```bash
npm install -g anydb-mcp-service
```

## Prerequisites

- Node.js 16 or higher
- An [AnyDB](https://www.anydb.com) account
- API credentials from your AnyDB account

## Configuration

### Environment Variables

Set the following environment variables:

```env
ANYDB_DEFAULT_API_KEY=your_api_key_here
ANYDB_DEFAULT_USER_EMAIL=your_email@example.com
ANYDB_API_BASE_URL=https://app.anydb.com/api
```

You can set these in:

- A `.env` file in your project directory
- Your system environment variables
- Claude Desktop configuration (for MCP usage)

## Getting Your API Key

Before using the SDK, you'll need to obtain your API key from [AnyDB](https://www.anydb.com):

1. Log in to your AnyDB account at [app.anydb.com](https://app.anydb.com)
2. Click on the **user icon** in the bottom right corner of the browser UI
3. In the Profile Dialog that opens, navigate to the **Integration** tab
4. Copy your API key from the Integration settings

Your API key is unique to your account and should be kept secure. Never commit it to version control or share it publicly.

## Usage

### With Claude Desktop (MCP Protocol)

Add to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "anydb": {
      "command": "npx",
      "args": ["-y", "anydb-mcp-service"],
      "env": {
        "ANYDB_DEFAULT_API_KEY": "your_api_key_here",
        "ANYDB_DEFAULT_USER_EMAIL": "your_email@example.com",
        "ANYDB_API_BASE_URL": "https://app.anydb.com/api"
      }
    }
  }
}
```

Restart Claude Desktop to activate the integration.

### With ChatGPT (REST API)

The REST API provides HTTP endpoints for all tools, making it compatible with ChatGPT Actions and other HTTP-based integrations.

### With Other MCP Clients

The server uses stdio transport and can be integrated with any MCP-compatible client. If installed globally:

```bash
anydb-mcp-service
```

Or if installed locally:

````bash
npx anydb-mcp-serviceRATION.md](CHATGPT_INTEGRATION.md) for detailed setup instructions.

### With Other MCP Clients

The server uses stdio transport and can be integrated with any MCP-compatible client:

This service provides 10 tools for comprehensive AnyDB integration:

### Record Operations

| Tool | Description |
|------|-------------|
| `list_teams` | List all teams accessible with your credentials |
| `list_databases_for_team` | Get all databases within a team |
| `list_records` | List records in a database with filtering and pagination |
| `get_record` | Get a specific record with all cell data |
| `create_record` | Create a new record in a database |
| `update_record` | Update an existing record's metadata and content |
| `delete_record` | Delete an existing record permanently |
| `search_records` | Search for records by keyword across database |

### File Operations

| Tool | Description |
|------|-------------|
| `download_file` | Download or get URL for files attached to record cells |
### Building from Source

```bash
# Clone the repository
git clone https://github.com/yourusername/anydb-mcp-service.git
cd anydb-mcp-service

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Development mode (watch)
npm run dev

# Start MCP server
npmSupported AI Platforms

| Platform | Protocol | Status | Notes |
|----------|----------|--------|-------|
| Claude Desktop | MCP | ✅ Supported | Native MCP protocol support via stdio |
| ChatGPT Custom GPT | REST API | ✅ Supported | Requires REST server and public URL |
| Other MCP Clients | MCP | ✅ Supported | Any MCP-compatible client |

## API Documentation

For detailed API documentation and usage examples, visit the [AnyDB Documentation](https://www.anydb.com/support).
# Watch mode
npm test:watch

# Coverage report
npmExamples

### Basic Usage with Claude

Once configured, you can interact with AnyDB through natural language:

````

"List all my teams"
"Show me databases in team XYZ"
"Create a new record in database ABC with name 'Project Plan'"
"Search for records containing 'budget' in database ABC"
"Upload this file to record XYZ"

````

### Programmatic Usage

You can also use the SDK directly in your Node.js applications:

```typescript
import { AnyDBClient } from 'anydb-api-sdk-ts';

const client = new AnyDBClient({
  apiKey: 'your-api-key',
  userEmail: 'your-email@example.com'
});

// List teams
const teams = await client.listTeams();

// Create a record
const record = await client.createRecord({
  teamid: 'team-id',
  adbid: 'database-id',
  name: 'New Record'
});
````

## Troubleshooting

### Common Issues

**Connection Issues**

- Verify `ANYDB_API_BASE_URL` is set correctly (default: `https://app.anydb.com/api`)
- Check that your API key and email are valid
- Ensure network access to AnyDB API

**Authentication Errors**

- Confirm your API key has not expired
- Verify the email associated with your API key
- Check API key permissions in your AnyDB account settings

**File Upload Issues**

- Ensure files are within size limits
- Check file permissions and access
- Verify the target record and cell position exist

For more help, visit [AnyDB Support](https://www.anydb.com/support).

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Related Projects

- [anydb-api-sdk-ts](https://github.com/HumanlyInc/anydb-api-sdk-ts) - TypeScript SDK for AnyDB API
- [AnyDB](https://www.anydb.com) - Build powerful databases and workflows

## Support

- 📖 [Documentation](https://www.anydb.com/support)
- 🌐 [Website](https://www.anydb.com)
- 💬 [Community Support](https://www.anydb.com/support)

## License

MIT License - see LICENSE file for details

## About AnyDB

[AnyDB](https://www.anydb.com) is a powerful database platform that combines the flexibility of spreadsheets with the power of databases. Build custom workflows, manage data, and integrate with AI assistants through natural language.

Learn more at [www.anydb.com](https://www.anydb.com)

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
