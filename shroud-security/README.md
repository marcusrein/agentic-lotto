# Shroud Security Inspection Example

Minimal example demonstrating the 1claw MCP security inspection features — prompt injection, command injection, and social engineering detection. No vault credentials required.

## Setup

```bash
cp .env.example .env
npm install
npm start
```

## What it demonstrates

- **MCP server in local-only mode**: Set `ONECLAW_LOCAL_ONLY=true` so the MCP server exposes only the `inspect_content` tool (no vault credentials needed).
- **inspect_content tool**: Uses the same inspection engine to check text for:
  - **Prompt injection**: Malicious output trying to manipulate downstream behavior
  - **Command injection**: Shell chaining, command substitution, reverse shells, sensitive paths
  - **Social engineering**: Urgency, authority claims, bypass requests, credential fishing

## MCP config

Add to your MCP config (Claude, Cursor, etc.):

```json
{
  "mcpServers": {
    "1claw": {
      "command": "npx",
      "args": ["-y", "@1claw/mcp"],
      "env": { "ONECLAW_LOCAL_ONLY": "true" }
    }
  }
}
```

The `inspect_content` tool will be available to your AI agent.
