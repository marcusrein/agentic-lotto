# Shroud Security Inspection Example

> **Reference only** — not for production use. Review and adapt for your own security requirements.

Minimal example demonstrating the 1claw MCP security inspection features — prompt injection, command injection, and social engineering detection. **No vault credentials required** (local-only mode).

## What you'll learn

- Run the **1claw MCP server in local-only mode** so it exposes only the `inspect_content` tool
- Use the same inspection engine that powers Shroud: Unicode normalization, command injection, social engineering, encoding tricks, network threats
- Add the MCP server to Claude Desktop or Cursor and call `inspect_content` from your agent

## Prerequisites

- Node.js 20+
- No 1Claw account or API keys needed

## Demo walkthrough (5 min)

### Step 1 — Install and configure

```bash
cd examples/shroud-security
cp .env.example .env
npm install
```

No credentials are required in `.env` for local-only mode. Optional: set `ONECLAW_LOCAL_ONLY=true` explicitly (it's the default for this example).

### Step 2 — Run the MCP server

```bash
npm start
```

This starts the MCP server with only the `inspect_content` tool available. You'll see the server listening (stdio or HTTP, depending on the script).

### Step 3 — (Optional) Add to Claude Desktop or Cursor

Add to your MCP config:

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

The `inspect_content` tool will be available to your AI agent. Pass any text and get a structured verdict: `clean`, `warning`, `suspicious`, or `malicious`, with threat types (e.g. command_injection, social_engineering).

## What it demonstrates

| Feature | Description |
|--------|-------------|
| **Local-only MCP** | `ONECLAW_LOCAL_ONLY=true` — no vault credentials; only `inspect_content` is exposed. |
| **Prompt injection** | Detects output trying to manipulate downstream behavior. |
| **Command injection** | Shell chaining, command substitution, reverse shells, sensitive paths. |
| **Social engineering** | Urgency, authority claims, bypass requests, credential fishing. |
| **Unicode / encoding** | Homoglyphs, zero-width characters, Base64/hex obfuscation. |
| **Network threats** | Suspicious URLs, data exfiltration patterns. |

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ONECLAW_LOCAL_ONLY` | No | Set to `true` for local-only mode (default in this example). |

## Next steps

- [Local Inspect](../local-inspect/) — Same detections, no MCP: run offline with no account
- [Shroud guide](https://docs.1claw.xyz/docs/guides/shroud) — Per-agent threat detection in the TEE proxy
- [MCP security docs](https://docs.1claw.xyz/docs/mcp/security)
