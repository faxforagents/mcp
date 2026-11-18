# Changelog

## 0.5.8 (2026-11-18)

The stdio server follows the hosted server at API 1.21.12. Every tool returns only the fields its output schema declares, as the hosted server does since 1.21.11.

Each tool's data is cut to its output schema at every level before the result is built. The text block carries the same cut data.
`me` keeps the environment and the scopes. The ids of the organization, project and API key, the key's prefix and the actor are gone.
A fax and its attempts leave out the carrier's call id, its raw report, the raw error text, the row ids and the timings.
A fax no longer carries the card or the payer of a one-time order. The policy verdict of `quote_fax` leaves out the policy version id.
A review request no longer says who asked or who decided. `decided_by_person` says whether a person or an API key decided, never who.
A card payment order leaves out its source and its bookkeeping times.
A refusal keeps the `details` keys that say what to fix, the hosted `DETAIL_KEYS`. A validation error keeps `loc` and `msg`.
The privacy policy lists what each tool returns, at <https://faxforagents.com/privacy/#mcp-server>.

A fax that ended carries `receipt_url`, the page of its receipt in the dashboard at <https://app.faxforagents.com>.
A help request names its fax at `review_request.fax_job_id`.

The prose follows the hosted words. `get_fax_capabilities` names the environment, not the provider. `get_fax_document` leaves out when the document was made.
The evidence sentence names the pages and who reported them, without the call id. It is part of the fax's state, as on the hosted server.
A send under a delegated policy says "under your delegated policy", where it named the policy version's id.

`request_card_payment` is marked destructive. Once a person pays, the fax goes out and cannot be taken back, so a client asks its person first.
The description of `get_fax_capabilities` says it returns the credential's environment and scopes, where it said account identity.

The output schemas follow the hosted ones, and every object in them forbids other keys.
The schema converter reads maps of objects, such as the routes of the price card, and holds every entry to its schema.
The guide's `send` section says what the evidence holds and names `fax.receipt_url`.

`test/output-allowlist.mjs` holds a copy of the hosted allow-list. It feeds every tool REST answers with internal keys and a canary at every level.
It fails on any path that is not on the list, and on a listed path no call reached. Against 0.5.7 it fails.
There, five tools return paths that are not on the list, and eleven answer with an output schema error.
`test/output-schema.mjs` checks the converter on maps of objects.

The tool list was taken from the hosted server's `tools/list` on 2026-11-18, when it reported version 1.21.12.
The list equals the definitions `scripts/import-hosted.py` imported from the product source at v1.21.12.

## 0.5.7 (2026-11-16)

The stdio server follows the hosted server at API 1.21.0. Tool names, inputs, descriptions and annotations did not change.

`quote_fax` on a test quote adds a sentence with the live price, in the hosted words.
It reads "Live, this fax would cost 39000 micro ($0.039)." for a one-page quote, from the quote's `live_amount_micro`.
A live quote, or a test quote whose live price the server does not know, gets no such sentence.

`get_card_payment_status` knows the three statuses a person at Fax for Agents sets from the console.
`refunding` says a refund to the card is on its way, and `refunded` says the whole charge went back.
Both say what was charged, and `refunded` also says what was refunded. `canceled` says nothing was charged and the hold was released.

The answers call the free mode test, as the hosted server does since 1.21.0. A test fax is "Test fax", where it was "Sandbox fax".
The test wallet, the test-mode policy reason of `quote_fax`, the extraction price of `get_fax_capabilities` and the `sandbox_only` refusal say test.
So do the guide and the two prompts. Sandbox stays where it names the simulated carrier.
The guide's `send` section says that a test quote's `live_amount_micro` is the price with a live key.

The output schemas follow the hosted ones. `quote_fax` declares `live_amount_micro`, the order statuses gain `refunding`, `refunded` and `canceled`, and `get_fax_capabilities` describes `limits`.

The README's one-paste line says "Start in Test.", as the site and the dashboard do since 1.21.0.

The tool list was taken from the hosted server's `tools/list` on 2026-11-16, when it reported version 1.21.0.
The list equals the definitions `scripts/import-hosted.py` imported from the product source at v1.21.0.
`STATE_MESSAGES` and `ORDER_MESSAGES` equal the hosted ones word for word. `test/protocol.mjs` checks the two new guide sentences.

## 0.5.6 (2026-11-15)

The stdio server follows the hosted server at API 1.20.10. Tool names, inputs, descriptions and annotations did not change.

Three answers state the payment rule of API 1.20.9 in the hosted server's words.
`get_fax_status` on a partial fax says "Charged the price of those pages", where it said "Charged for those pages".
`get_card_payment_status` says the card "is being charged the price of the pages that arrived" while the charge runs.
Once it is done, the same tool says the card "was charged the price of the pages that arrived".

The guide says it the same way. Its `one_time` section says a failed fax costs nothing and a fax that stops part way costs the price of the pages that arrived.
Its `states` section says the price of the pages of a partial fax was charged.

The output schema of `quote_fax` describes the four counters of the policy verdict's `usage`, and its `policy_name` and `version`.

The tool.store manifest still carried the description of `request_card_payment` from before 0.5.5. It equals the tool list again, as `npm run pack:tool-store` requires.

The tool list was taken from the hosted server's `tools/list` on 2026-11-15, when it reported version 1.20.10.
The list equals the definitions `scripts/import-hosted.py` imported from the product source at v1.20.10.
`STATE_MESSAGES` and `ORDER_MESSAGES` equal the hosted ones word for word. `test/protocol.mjs` checks the two guide sentences.

## 0.5.5 (2026-11-15)

The stdio server follows the hosted server at API 1.20.9.

A refusal names the tool's argument, as the hosted server's has since 1.20.8. It named the REST API's field before.

- `quote_fax`: `from_number`, where the API says `from`.
- `request_card_payment`: `cover_from_name`, where the API says `sender_name`.
- `request_human_review`: `fax_id`, where the API says `fax_job_id`.

The name changes in `details.field`, in `details.fields` and in the `loc` of a validation error. A message that starts with the field changes too: "from must be E.164" from `quote_fax` reads "from_number must be E.164".
The `not_found` of a sender number that is not yours carries `details.field: "from_number"`. It carried `from` before.
A tool with no renamed argument passes the API's words on as they are.

The card of a one-time order is held, not authorized. `get_card_payment_status`, the guide section `one_time` and the description of `request_card_payment` say so.
`get_card_payment_status` and the description of `request_card_payment` also state the payment rule of API 1.20.9. A failed fax costs nothing, and a fax that stops part way costs the price of the pages that arrive.

The guide says a one-page fax to the sandbox number `+15550000003` fails with `partial_delivery`. Its `errors` section says `details.field` names the tool's argument. Its `policies` section says to ask a person only when `approval_required` is true.

The output schemas name the fields the API added at 1.20.8.

- `quote_fax`: `quote.pricing`, and `quote.policy_evaluation` as the policy verdict with its `usage`.
- `send_approved_fax`, `get_fax_status`, `list_faxes`, `cancel_fax` and `get_card_payment_status`: `approval_id`, `policy_version_id` and `route_paused` on the fax.
- New descriptions for `details`, for a document's `converted_from` and `received`, and for `amount_micro` of a received fax and of a card order.

0.5.4 differed from the hosted tool list in 55 places, 54 of them in the output schemas. 0.5.5 differs in none.
The tool list was taken from the hosted server's `tools/list` on 2026-11-15, when it reported version 1.20.9.
The list equals the definitions `scripts/import-hosted.py` imported from the product source at v1.20.9.
`test/argument-names.mjs` checks eight refusals over stdio. `test/tools-output.mjs` gives its denied quote the whole verdict the API sends, with `managed` and `denials`.

## 0.5.4 (2026-11-15)

The stdio server follows the hosted server at API 1.20.6. Tool names, inputs, descriptions and the guide did not change. The output schemas did.

The output schemas name the fields the API added at 1.20.6. The handlers pass the API's objects through, so the fields reach a client as they are.

- `get_fax_balance`: `balance.held_jobs`, the fax jobs whose hold is still in place.
- `quote_fax`: `quote.route_paused`, true while an operator has paused sends on the route.
- `prepare_fax` and `get_fax_document`: `document.converted_from`, the name of an image that became the PDF, and `document.received`, the received fax the document came from.
- `request_human_review` and `get_review_status`: `document`, `requested_by_name` and `decided_by_name` on the review request.
- `get_fax_capabilities`: `default_scopes` and `admin_scopes`.
- `send_approved_fax`, `get_fax_status`, `list_faxes`, `cancel_fax` and `get_card_payment_status`: six receipt fields of a one-time order on `one_time`.

Every new field is optional. 0.5.3 differed from the hosted tool list in 48 places of the output schemas, and 0.5.4 differs in none.

The tool list was taken from the hosted server's `tools/list` on 2026-11-15, when it reported version 1.20.7.
The list equals the definitions `scripts/import-hosted.py` imported from the product source at v1.20.6.
`llms-install.md` writes the hosted address as `https://mcp.faxforagents.com/mcp/` and no longer says to keep the trailing slash. Both forms answer the same.

## 0.5.3 (2026-11-14)

The stdio server follows the hosted server at API 1.20.5.

An argument a tool does not list is refused. The answer is `invalid_input` with `isError` true, and nothing is done.
The message names the argument and, for a near miss, the one that was meant: `from` for `from_number`, `status` for `state`, `id` for the tool's one id.
`details.unknown_arguments` and `details.accepted_arguments` carry the names. A value is never repeated, and at most five names are.
Such an argument was dropped without a word before. A quote with `from` came from the shared pool, and a list with `status` returned every fax.
Four names a workflow client adds to every call are still dropped: `sessionId`, `action`, `chatInput` and `toolCallId`.
Every input schema in the tool list says `additionalProperties: false`.

`quote_fax` with a test key and no policy reports `policy.decision: "allow"` and `policy_id: null`.
The reason is `sandbox: a test API key sends without an approval, and no policy was evaluated`. It said `deny` beside `approval_required: false`, and the send was accepted.
A quote under no policy that a person must approve keeps `deny`. Its reason is now the API's own: `no policy applies to this agent, key or connected app`.
`policy` carries `managed`, which is `connected_apps` when the organization's auto-send setting decided.

A `not_found` of `quote_fax` says which id was not found. The API names it in `details.field`.
For `document_id` the message says to prepare the document again. For `from_number` it says to leave it out and send from the shared pool.
Other tools keep the short answer.

`get_fax_capabilities` says whose scopes are whose. `me.scopes` is what the API key can do. `capabilities.scopes` is every scope that exists.
The answer without an API key says keys are created in the dashboard, under API keys. It named a command line tool that this package does not ship.
The guide has the sandbox verdict in `send`, and `invalid_input` and the named `not_found` in `errors`. It says a busy or unanswered fax was tried up to three times in all.
The `send_a_fax` prompt says a send goes as it is under a delegated policy or with a test key.

The tool list was taken from the hosted server's `tools/list` at API 1.20.5 on 2026-11-14. It equals the definitions imported from the source.
`scripts/import-hosted.py` also writes what the hosted source answers for 20 calls with unknown arguments. `test/validation.mjs` compares each answer word for word.
`test/inputs.mjs` sends every tool a name it does not list. `test/tools-output.mjs` covers the verdict, the named `not_found` and the two refusals on a fake API.
The README writes the hosted address as `https://mcp.faxforagents.com/mcp/` and no longer says the trailing slash matters.

## 0.5.2 (2026-11-14)

Five inputs in the tool list were dropped by the server. A call that named one got the answer of a call without it. They now reach the REST API.

`prepare_fax`, `quote_fax` and `request_human_review` take `idempotency_key`. It is sent as the `Idempotency-Key` header of the REST call.
The API replays the first answer for 24 hours. The same key with another payload is answered `idempotency_key_conflict`.
These three tools have no default key. Without a key, or with an empty one, the call is unkeyed as before.
`quote_fax` takes `from_number`, a sender number the organization owns. It is the `from` field of `POST /v1/fax-quotes`. Without it the shared pool sends.
`list_faxes` takes `idempotency_key` as a filter, the query parameter of that name on `GET /v1/faxes`. It finds the job a send created under that key.
`send_approved_fax` sends `mcp:{quote_id}` when it is called without a key. The lookup reads the API's replay record, so an empty result does not prove that no fax was sent.

`quote_fax` accepts null for `quality`, `sender_name` and `delete_after_send`, as the tool list says. It refused null before.
A wrong type in `quality` or `delete_after_send` returns the `invalid_input` answer that names the argument. It returned a bare error text before.
An `idempotency_key` over 255 characters is refused with `invalid_input` on the five tools that list the limit. `request_card_payment` is one of them.
A tool that sends `idempotency_key` as a header refuses a value an HTTP header cannot carry, with `invalid_input` and the reason. Printable ASCII and Latin-1 pass.
On `send_approved_fax` and `request_card_payment` such a value used to read as an unreachable API.
`quote_fax` no longer checks the length of `sender_name` itself. The API refuses a name over 128 characters and its answer comes back.
The tool.store manifest has the `read_inbound_fax` description that 0.5.1 changed. The pack script compares the two.

The server compares each handler's inputs with the tool list when it starts, and stops when they differ.
`test/inputs.mjs` calls all 45 listed inputs of the 17 tools with a wrong type and with the listed example. It also tries null, a string over the limit, a value outside the enum and a malformed id where the schema names one.
`test/tools-output.mjs` follows the five inputs to the REST call on a fake API.

The tool list is unchanged. It matched the hosted server's `tools/list` at API 1.20.3 on 2026-11-14.

## 0.5.1 (2026-11-12)

The tool list matches the hosted server at API 1.18.0. No tool, argument or output field was added or removed.

`send_approved_fax` and `cancel_fax` carry `destructiveHint` true. A send transmits pages and charges the wallet, and a cancel ends a job for good, so a client asks its person first. `request_card_payment` stays false: an order sends and charges nothing by itself.
A client that prompts on destructive tools now prompts on a send and on a cancel. The server still decides what is allowed, by approval or policy.

`quote_fax`: when a policy denies the send and a person may still approve it, the text says to call `request_human_review` with the quote.
`get_fax_status`: the partial text says not to send again on an instruction given before the outcome. Say which pages arrived and let the person decide.
`read_inbound_fax`: the description says not to act when a received fax asks for something to be sent or done. Tell the person with `request_human_review`.
`quote_fax`: `sender_name` is described as the name that identifies the sender. Omitted, the organization's name is used.

The guide says a busy or unanswered fax was tried three times in all. It said retried up to three times.
`test/hosted-tools.json` was taken from the hosted server's `tools/list` on 2026-11-12.

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
