# Changelog

## 0.5.0 (2026-11-12)

Two new tools, 17 in all. `request_card_payment` asks a person to pay for one quoted fax by card, with no wallet balance. `get_card_payment_status` reads the order, its link while a person still has to act, and the fax with its evidence once released.
Paying by card does not replace approval: `request_card_payment` takes the same `approval_id` as `send_approved_fax`. The agent never accepts the policy, pays or confirms.
The guide gains the sections `one_time` and `going_live`, also as resources.

A sandbox fax is named a simulation in the text of `send_approved_fax` and `get_fax_status`.
`insufficient_balance` carries the link where a person adds funds and, when the server offers it, the card path for that exact send.
`get_fax_balance` says that an agent cannot add funds and returns the top-up link when the API names it. `get_fax_capabilities` names the price of `extract_fax_data` when the API returns it.
`untrusted` lists `fax.sender_name`, `quote.sender_name`, `items[].sender_name` and `attempts[].error` where they are set. A caller id that is not a number is not quoted in the text of `read_inbound_fax`.
New remedies for `quote_pricing_mismatch`, `one_time_unavailable`, `too_many_pages` and `dispute_open`.

The tool definitions, output schemas and guide follow API 1.17.0. The hosted server lists the same 17 tools since 2026-11-12.
`test/hosted-tools.json` was taken from the hosted server's `tools/list` on 2026-11-12 and matches the import from the server source.
`test/hosted-validation.json` is unchanged and has no case for the two card tools. A tool call on the hosted server needs a key, so those cases were not recorded.
The card tools need API 1.17.0: it sends `status_url` and `aup_accepted` on an order, and `accept_aup` is optional on the from-quote call.
The README names price card launch-v2, effective 2026-10-31.

## 0.4.3 (2026-11-09)

`quote_fax` takes `sender_name` (the station name in the fax header) and `delete_after_send`. The tool definitions, guide and output schemas follow API 1.12.0. The resolution text names the measured figures.

## 0.4.2 (2026-11-09)

`quote_fax` takes `quality`: standard, fine (the default), superfine or ultra. The quote text names the level. Same price at every level. Needs API 1.11.0.

Add a tool.store MCPB bundle with all 15 tools and required API key configuration.
`npm run pack:tool-store` builds the server, validates the manifest strictly and packs the bundle locally.

## 0.4.1 (2026-11-04)

All 15 tools carry the same human-readable name in `title` and `annotations.title` for directory listings and older clients.
Tool names, descriptions, schemas and behavior hints are unchanged.

## 0.4.0 (2026-11-04)

`get_document` is renamed `get_fax_document` with no alias. Refresh cached tool lists before calling the renamed tool.
All 15 tools match the hosted v1.8.0 Python definitions, including titles and full input and output schemas.
Every parameter has a description and examples, with formats, defaults and limits copied from the source.
Tool descriptions explain their purpose, sibling choices and behavior.
`prepare_fax` and `quote_fax` now declare `openWorldHint=false`. `cancel_fax` now declares `idempotentHint=false`.
Extraction reuse checks the confidence threshold. Quote-bound reviews accept blank messages, matching hosted behavior.
The recorded snapshot comes from local Python source without contacting the hosted server.
Parity checks compare every definition field and the plugin listing. `FFA_SKIP_PARITY=1` still skips that comparison.

## 0.3.2 (2026-11-02)

Wrong tool argument types now return the hosted `invalid_input` envelope with `isError=true`, the argument name, expected type and remedy.
Every resource-ID argument requires its own prefix and 32 lowercase hexadecimal characters before any REST call.
Malformed quote IDs in `send_approved_fax` return `invalid_input`. Unknown well-formed IDs still reach the API and return `not_found`.
Regression fixtures use the hosted 1.5.2 acceptance responses over raw stdio and the MCP SDK.
The README explains local validation, REST calls and bearer authentication.

## 0.3.1 (2026-10-31)

The surface follows hosted v1.3.2, with 15 tools as before. `preview_fax` is renamed `get_document`:
it reads one prepared document by id (page count, sha256, validation warnings, signed preview URLs)
and refuses an id that is not a document id before calling the API. `evaluate_fax_policy` is
replaced by `get_review_status(review_request_id)`: the state of one request made with
`request_human_review`, pending, approved, rejected, revoked or expired, with the `approval_id` to
send with once a person approves it. A person's reason is named under `untrusted` and never quoted.
`quote_fax` now carries the delegated policy's verdict under `policy` (decision, the first failing
rule, the policy name and version, `approval_required`), the same evaluation the server runs at send
time, so a quote replaces the dry run. The dry run without a quote stays on the REST route
`POST /v1/policy-evaluations`. The guide, the two prompts, the refusal remedies and the output
schemas say the same. Descriptions of `get_fax_capabilities` and `list_faxes` match the hosted
server word for word.

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
