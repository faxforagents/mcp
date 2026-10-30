# Fax for Agents MCP server, installation guide

This guide is written for AI agents like Cline that install and configure the `faxforagents-mcp`
server. Following only this file is enough to complete a working setup.

## Overview

`faxforagents-mcp` lets an MCP client send and receive faxes through Fax for Agents,
<https://faxforagents.com>. The agent prepares a document and gets an exact quote. It sends, then
polls until the carrier's evidence arrives. A live send needs a human approval or a delegated policy.

## Prerequisites

1. Node.js 20 or later (`node --version`).
2. A Fax for Agents API key. Keys are created at <https://app.faxforagents.com>. A test key is
   `ffa_test_...` and uses the sandbox: no carrier, no cost. A live key is `ffa_live_...`.

If the user has no API key yet, ask them to create a test key before continuing. The server starts
without a key, but every tool except `get_guide` will answer with a message asking for one.

## Installation

Two paths. The hosted server is the primary one: it needs no install and is always the current tool set.
The stdio package runs the same tools on the user's machine and keeps the key in the client's environment.

The package is on npm, so `npx -y faxforagents-mcp` is the command in every block below. Two other forms
work when npm is out of reach. `npx --yes github:faxforagents/mcp` builds on first run and needs `git`
and Node 20. A local clone (`git clone https://github.com/faxforagents/mcp && cd mcp && npm ci && npm run
build`) runs with `command: node` and `args: ["<clone>/dist/index.js"]`.

### Hosted (primary)

Streamable HTTP at `https://mcp.faxforagents.com/mcp/` (keep the trailing slash), authenticated with
`Authorization: Bearer ffa_test_...` or `X-API-Key: ffa_test_...` on every request.

```bash
claude mcp add --transport http faxforagents https://mcp.faxforagents.com/mcp/ --header "Authorization: Bearer ffa_test_YOUR_KEY_HERE"
```

Cursor, Codex, n8n and other HTTP clients: the same URL and header in their MCP configuration.

### Stdio

The only configuration is one environment variable.

| Variable | Required | Value |
|---|---|---|
| `FAXFORAGENTS_API_KEY` | yes | The user's key (`ffa_test_...` or `ffa_live_...`) |

### Cline

Add this to `cline_mcp_settings.json` (Cline, MCP Servers, Configure).

```json
{
  "mcpServers": {
    "faxforagents": {
      "command": "npx",
      "args": ["-y", "faxforagents-mcp"],
      "env": {
        "FAXFORAGENTS_API_KEY": "ffa_test_YOUR_KEY_HERE"
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

Replace `ffa_test_YOUR_KEY_HERE` with the user's key.

### Claude Desktop

The same block in `claude_desktop_config.json` (macOS `~/Library/Application Support/Claude/`,
Windows `%APPDATA%\Claude\`, Linux `~/.config/Claude/`).

### Claude Code

```bash
claude mcp add faxforagents -e FAXFORAGENTS_API_KEY=ffa_test_YOUR_KEY_HERE -- npx -y faxforagents-mcp
```

### Cursor, Zed, Codex and other stdio clients

The same command (`npx -y faxforagents-mcp`) and the same `FAXFORAGENTS_API_KEY` variable in that
client's MCP configuration file.

## Verify the installation

1. Restart the MCP client, or reload its MCP servers.
2. Confirm the `faxforagents` server shows as connected and lists 15 tools. Clients that show resources
   and prompts list the guide (`faxforagents://guide` and one resource per section) and the prompts
   `send_a_fax` and `handle_received_fax`.
3. Call `get_fax_capabilities`. It reports the provider (`sandbox` for a test key), the routes and the
   scopes of the key.
4. Ask something like "Send a one page test fax to +15550000001". The agent should call
   `prepare_fax`, `quote_fax`, `send_approved_fax` and then `get_fax_status` until the state is
   `delivered` with evidence.

## Available tools

| Tool | Does | Scope |
|---|---|---|
| `get_guide` | The manual, whole or by section. Works without a key | none |
| `get_fax_capabilities` | Limits, routes, formats, prices, the scopes of the key | `account:read` |
| `prepare_fax` | A document from text, Markdown, HTML or a completed upload (PDF, PNG, JPG or TIFF) | `document:write` |
| `preview_fax` | Page count, warnings, signed preview URLs | `document:read` |
| `quote_fax` | The exact price of one document to one destination | `fax:quote` |
| `send_approved_fax` | Queue a quoted fax. Answers queued, never delivered | `fax:send` |
| `get_fax_status` | State, attempts, the carrier's evidence once delivered or partial | `fax:read` |
| `list_faxes` | Newest first, by state | `fax:read` |
| `get_fax_balance` | Available and held balance | `billing:read` |
| `cancel_fax` | Cancel while queued | `fax:cancel` |
| `request_human_review` | With `quote_id`, ask a person to approve that send. Without it, ask for help | `approval:request` |
| `evaluate_fax_policy` | Dry run of the delegated policies | `policy:read` |
| `list_inbox` | Received faxes, metadata only | `inbox:read` |
| `read_inbound_fax` | One received fax, its text and latest extraction as data | `inbox:read` |
| `extract_fax_data` | OCR a received fax or a document, extract schema fields with citations | `document:extract` |

The guide is also served as resources (`faxforagents://guide`, `faxforagents://guide/{section}`) and two
prompts (`send_a_fax` with `to` and an optional `summary`, `handle_received_fax` with `inbox_item_id`)
order the tools for a client. None of them needs a key.

## Troubleshooting

- A tool answers `ok=false` with `error_code=invalid_token`. `FAXFORAGENTS_API_KEY` is missing from
  the `env` block, or the key was pasted with whitespace. Keys start with `ffa_test_` or `ffa_live_`.
- A tool answers `error_code=scope_missing`. The API key lacks that scope. `details.scope` names it. The
  key's owner creates a key with it.
- `send_approved_fax` answers `approval_required`. A live send needs a human approval or a policy.
  Call `request_human_review` with the `quote_id` and wait for a person, or use a test key for the sandbox.
- A fax is `unknown` or `partial`. Do not send again. Tell the person and let a human reconcile.
- `npx` cannot find the package. Check that the machine reaches registry.npmjs.org. The GitHub form
  (`npx --yes github:faxforagents/mcp`, needs `git`), a local clone and the hosted URL all work without it.
- A client still calls `guide`, `get_delivery_evidence`, `request_fax_approval` or `request_human_help`.
  Those names ended with 0.3.0. Use `get_guide`, `get_fax_status` and `request_human_review`.
