# AnyDB MCP Setup Guide

## 1. Get an AnyDB integration key

An AnyDB team owner or a team member with appropriate permissions can use an integration key for the teams and workspaces they are allowed to access.

1. Sign in at https://app.anydb.com.
2. Select the user icon in the bottom-right corner.
3. In the Profile dialog, open the **Integration** tab.
4. Copy the API integration key.

Keep the key private. Do not paste it into a conversation, commit it to source control, or include it in logs.

## 2. Configure the MCP client

Add this server definition to your MCP client configuration. For Claude Desktop, the configuration file is `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS or `%APPDATA%\Claude\claude_desktop_config.json` on Windows.

```json
{
  "mcpServers": {
    "AnyDB": {
      "command": "npx",
      "args": ["-y", "anydb-mcp-service@latest"],
      "env": {
        "ANYDB_API_URL": "https://app.anydb.com/api",
        "ANYDB_DEFAULT_API_KEY": "<your integration key>",
        "ANYDB_DEFAULT_USER_EMAIL": "<your AnyDB email>"
      }
    }
  }
}
```

The exact environment variable is `ANYDB_API_URL`. Do not use `ANYDB_API_BASE_URL`; it is not recognized and the service will otherwise use the default production URL, which can make a URL typo look like an authentication or missing-data problem.

Restart the MCP client after saving. MCP server configuration changes are not loaded live.

## 3. Verify the connection

Ask the assistant: **List my AnyDB teams.** It should call `list_teams` and return the teams available to the configured user. A 4xx response usually indicates an incorrect key, email, or API URL. An unexpected empty list can indicate valid credentials for a user with no accessible teams or a connection to the wrong environment.

## Troubleshooting

| Symptom                                            | Likely cause                            | Resolution                                                                                                                |
| -------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Authentication error or unexpected production data | Wrong URL variable name or URL          | Use `ANYDB_API_URL=https://app.anydb.com/api`; do not use `ANYDB_API_BASE_URL`.                                           |
| No change after editing configuration              | MCP client was not restarted            | Fully quit and restart the MCP client.                                                                                    |
| Old package behavior                               | Stale `npx` package cache               | Keep `@latest` in the package argument. If needed, remove the relevant cache under `~/.npm/_npx/` and restart the client. |
| MCP server reports missing credentials             | Key or email is absent from `env`       | Set both `ANYDB_DEFAULT_API_KEY` and `ANYDB_DEFAULT_USER_EMAIL`, then restart.                                            |
| `list_teams` returns a 4xx error                   | Key/email mismatch or incorrect API URL | Re-copy the integration key, verify the associated email, and confirm `ANYDB_API_URL`.                                    |
