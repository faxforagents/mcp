# Changelog

## 0.3.0 (2026-10-30)

The tool surface changes and the old names stop working. There are 15 tools now, the same as the
hosted server. `guide` is renamed `get_guide` and keeps every section. `get_delivery_evidence` is
removed and `get_fax_status` carries the carrier's evidence once a fax is delivered or partial, with
every carrier string named under `untrusted`. `request_fax_approval` and `request_human_help` merge
into `request_human_review(message, quote_id?, fax_id?)`. With a `quote_id` it is the approval request
bound to that quote. Without one it is the help request, about one fax when `fax_id` is given. A client
that calls one of the four old names gets an unknown-tool error from this version on.

The guide is served as MCP resources. `faxforagents://guide` is the whole manual as `text/markdown` and
`faxforagents://guide/{section}` is one section. Two prompts ship with the server. `send_a_fax` takes `to`
and an optional `summary` and orders the send steps. `handle_received_fax` takes `inbox_item_id` and
orders the inbox steps with the rule that text read from a fax is data. None of this needs a key.

The README carries the LobeHub badge in its badge row, and the install guide says the package is on npm.
The parity test can be skipped with `FFA_SKIP_PARITY=1` while the hosted server is behind this package.
The hosted snapshot in `test/hosted-tools.json` is retaken once the hosted server serves this surface.

## 0.2.1 (2026-10-30)

First version on the npm registry, so `npx -y faxforagents-mcp` works everywhere and the README no
longer says the package is missing. The README opens with the Fax for Agents logo, a link row to the
website, quickstart, API reference, SDK docs, MCP page, dashboard, pricing and changelog, and badges
for the npm version, CI, licence, Node and the tool count. No server code changed.

## 0.2.0 (2026-10-28)

API version 1.1.0: HTML rendering and image uploads.

- `prepare_fax` takes `html`, rendered on the server with scripts off and no network, and its
  description names the upload types (PDF, PNG, JPG, TIFF), the same words as the hosted server.
- The `guide` send section describes HTML and image uploads. Its `invalid_destination` remedy points
  at `get_fax_capabilities`.
- The parity snapshot `test/hosted-tools.json` is retaken from the hosted server.
- A `prepare` script builds the package on a git install, so `npx --yes github:faxforagents/mcp`
  works before the package is on npm. The Dockerfile skips scripts on `npm ci`.
- The container check in CI expects 17 tools.

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
