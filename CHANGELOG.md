# Changelog

## 0.1.0 (2026-10-28)

First release.

- A stdio MCP server with the same 16 tools as the hosted server at `https://mcp.faxforagents.com/mcp/`.
- The user's key from `FAXFORAGENTS_API_KEY`. Without it the server starts, lists its tools and every
  tool explains how to get one.
- `server.json` for the MCP Registry with the npm package and the hosted remote, `glama.json`, the MCPB
  manifest, the Claude plugin manifest and a Dockerfile for indexers.
