# Changelog

## 0.1.1 (2026-10-28)

- `extract_fax_data`: OCR a received fax or a document and extract schema fields with page citations,
  the same tool as the hosted server (17 tools now).
- `read_inbound_fax` reports the latest extraction of the item (status, confidence, fields) and says
  when one is still running.
- The `guide` has the `ocr` section.
- `llms-install.md` says how to run the package before it is on npm.

## 0.1.0 (2026-10-28)

First release.

- A stdio MCP server with the same 16 tools as the hosted server at `https://mcp.faxforagents.com/mcp/`.
- The user's key from `FAXFORAGENTS_API_KEY`. Without it the server starts, lists its tools and every
  tool explains how to get one.
- `server.json` for the MCP Registry with the npm package and the hosted remote, `glama.json`, the MCPB
  manifest, the Claude plugin manifest and a Dockerfile for indexers.
