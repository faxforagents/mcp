#!/usr/bin/env node
/**
 * The MCP output allow-list, as the hosted server holds it since API 1.21.11.
 *
 * ALLOWED, ENVELOPE and DETAILS are copied from fax-for-agents tests/e2e/mcp_output.py at v1.21.12. They
 * are never imported across repos. They list every path every tool can return. A path is the names
 * joined by dots. [] is an item of a list, and * is any one entry of a map, such as a route of the price card.
 *
 * A fake REST API answers every call with a complete object of the hosted output model. The models come
 * from the hosted tools/list snapshot, test/hosted-tools.json. Every object in it, at every level, also
 * carries the internal fields the REST API has, and a canary. Those are the account and API key ids, the
 * carrier's call ids and raw payload, who asked and who decided, the payer and the card.
 * Every tool must come out cut to the list, in the structured content and in the text block. Every
 * listed path must be reached. A refusal's details must come out cut to DETAILS. A path that is not on
 * the list fails the run and is printed.
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';

// The hosted allow-list (tests/e2e/mcp_output.py at v1.21.12).

const ENVELOPE = new Set(['ok', 'message', 'error_code', 'details', 'untrusted', 'untrusted[]']);
const DETAILS = new Set([
  'details.field', 'details.fields', 'details.fields[]', 'details.scope', 'details.state',
  'details.status', 'details.reason', 'details.quote_id', 'details.fax_job_id',
  'details.one_time_order_id', 'details.available_micro', 'details.needed_micro', 'details.pages',
  'details.document_pages', 'details.max_document_pages', 'details.max_pages',
  'details.max_upload_bytes', 'details.formats', 'details.formats[]', 'details.format',
  'details.codepoint', 'details.name', 'details.environment', 'details.top_up_url',
  'details.aup_url',
  'details.one_time_offer', 'details.one_time_offer.amount_micro', 'details.one_time_offer.currency',
  'details.one_time_offer.document_pages', 'details.one_time_offer.included_pages',
  'details.one_time_offer.extra_page_micro', 'details.one_time_offer.max_document_pages',
  'details.one_time_offer.approval_id',
  'details.policy', 'details.policy.decision', 'details.policy.rule', 'details.policy.reason',
  'details[]', 'details[].loc', 'details[].loc[]', 'details[].msg',
]);

const object = (prefix, keys) => [prefix, ...keys.split(/\s+/).filter(Boolean).map((k) => `${prefix}.${k}`)];

const EVIDENCE =
  'provider status pages_sent pages_total page_count remote_station_id to from quality completed_at occurred_at';
const FAX =
  'id environment state failure_code to from route route_paused document_id quote_id approval_id ' +
  'one_time_order_id billable_pages cover_pages pages_sent quality sender_name client_reference ' +
  'delete_after_send amount_micro captured_micro currency attempt_count created_at completed_at evidence ' +
  'receipt_url';
const ATTEMPT = 'attempt_number status pages_sent failure_code evidence';
const COVER = 'to_name from_name from_email subject message';
const FIELD = 'name value confidence pages pages[] abstained note';

const faxPaths = (prefix) => [...object(prefix, FAX), ...object(`${prefix}.evidence`, EVIDENCE).slice(1)];
const attemptPaths = (prefix) => [
  prefix, ...object(`${prefix}[]`, ATTEMPT), ...object(`${prefix}[].evidence`, EVIDENCE).slice(1),
];

const ORDER =
  'id status next environment email_verified aup_accepted sender_name to route cover document_pages ' +
  'document_id delete_after_send document_deleted price amount_micro captured_micro refunded_micro ' +
  'checkout_expires_at confirm_deadline_at quote_id fax_job_id failure_code';
const PRICE = 'price_version currency flat_micro included_pages extra_page_micro cover_included';
const REVIEW =
  'id kind status quote_id fax_job_id bound document message reason consumed_by_job_id expires_at notified ' +
  'decided_by_person';
const BOUND = 'quote_id document_id document_sha256 to from amount_micro currency billable_pages expires_at';
const INBOX = 'id environment from to pages status media_status partial_content document_id received_at amount_micro';
const DOCUMENT =
  'id environment status source filename content_type size_bytes sha256 page_count render_status ' +
  'render_reason validation validation.warnings validation.warnings[] validation.warnings[].code ' +
  'validation.warnings[].message validation.warnings[].page';

const orderPaths = () => [
  ...object('one_time_send', ORDER),
  ...object('one_time_send.cover', COVER).slice(1),
  ...object('one_time_send.price', PRICE).slice(1),
];
const reviewPaths = () => [
  ...object('review_request', REVIEW),
  ...object('review_request.bound', BOUND).slice(1),
  ...object('review_request.document', 'id filename page_count state').slice(1),
];

const ALLOWED = {
  get_guide: new Set(['section', 'sections', 'sections[]']),
  get_fax_capabilities: new Set([
    ...object(
      'capabilities',
      'environment send receive numbers routes routes[] formats formats[] max_pages ' +
        'max_upload_bytes price_version rates scopes scopes[] default_scopes ' +
        'default_scopes[] admin_scopes admin_scopes[] approvals extraction extraction_pricing ' +
        'extraction_pricing.currency extraction_pricing.page_micro ' +
        'extraction_pricing.escalated_page_micro extraction_pricing.max_pages limits ' +
        'limits.requests_per_minute limits.quote_ttl_s limits.download_url_ttl_s ' +
        'limits.max_html_bytes one_time one_time.enabled one_time.published one_time.routes ' +
        'one_time.routes[] one_time.max_document_pages',
    ),
    ...object(
      'capabilities.rates',
      'price_version rates_version effective_from currency unit routes routes.* ' +
        'routes.*.label routes.*.countries routes.*.countries[] routes.*.prefixes ' +
        'routes.*.prefixes[] routes.*.send_per_page_micro routes.*.receive_per_page_micro ' +
        'routes.*.number_monthly_micro international international.* international.*.label ' +
        'international.*.country international.*.prefixes international.*.prefixes[] ' +
        'international.*.send_per_page_micro international.*.receive_per_page_micro ' +
        'international.*.number_monthly_micro excluded excluded.* excluded.*.prefixes ' +
        'excluded.*.prefixes[] excluded.*.reason sandbox sandbox.send_per_page_micro ' +
        'sandbox.receive_per_page_micro sandbox.number_monthly_micro changes ' +
        'changes.price_version changes.from_version changes.effective_from changes.routes ' +
        'changes.routes.* changes.routes.*.label changes.routes.*.was_micro ' +
        'changes.routes.*.now_micro one_time one_time.max_document_pages one_time.routes ' +
        'one_time.routes.* one_time.routes.*.flat_micro one_time.routes.*.included_pages ' +
        'one_time.routes.*.extra_page_micro one_time.routes.*.cover_included',
    ).slice(1),
    ...object('me', 'environment scopes scopes[]'),
  ]),
  prepare_fax: new Set(object('document', DOCUMENT)),
  get_fax_document: new Set([
    ...object('document', DOCUMENT),
    ...object(
      'pages',
      'document_id page_count render_status render_reason items items[] items[].page_number ' +
        'items[].width_px items[].height_px items[].url',
    ),
  ]),
  quote_fax: new Set([
    ...object(
      'quote',
      'id environment document_id document_sha256 document_pages to from route route_label ' +
        'route_paused quality sender_name cover cover_pages billable_pages per_page_micro ' +
        'amount_micro live_amount_micro currency price_version pricing delete_after_send ' +
        'authorization_required warnings warnings[] warnings[].code warnings[].message expires_at ' +
        'expired',
    ),
    ...object('quote.cover', COVER).slice(1),
    ...object('policy', 'decision rule reason policy_id policy_name version managed approval_required'),
  ]),
  send_approved_fax: new Set([...faxPaths('fax'), 'idempotency_key']),
  get_fax_status: new Set([...faxPaths('fax'), ...attemptPaths('attempts')]),
  list_faxes: new Set(['items', ...faxPaths('items[]'), 'next_cursor']),
  get_fax_balance: new Set(object('balance', 'environment currency available_micro held_micro held_jobs top_up_url')),
  cancel_fax: new Set(faxPaths('fax')),
  request_card_payment: new Set([...orderPaths(), 'status_url', 'idempotency_key']),
  get_card_payment_status: new Set([...orderPaths(), 'status_url', ...faxPaths('fax'), ...attemptPaths('attempts')]),
  request_human_review: new Set(reviewPaths()),
  get_review_status: new Set([...reviewPaths(), 'approval_id']),
  list_inbox: new Set(['items', ...object('items[]', INBOX), 'next_cursor']),
  read_inbound_fax: new Set([
    ...object('item', INBOX + ' text extraction_id document'),
    ...object('item.document', 'id page_count sha256 status').slice(1),
    ...object('extraction', 'id status pages_processed pages_requested confidence fields fields[]'),
    ...object('extraction.fields[]', FIELD).slice(1),
  ]),
  extract_fax_data: new Set([
    ...object(
      'extraction',
      'id status pages_requested pages_processed pages_escalated document_pages truncated ' +
        'confidence price_micro error_code text fields fields[] warnings warnings[]',
    ),
    ...object('extraction.fields[]', FIELD).slice(1),
  ]),
};

function matches(pattern, path) {
  if (pattern.endsWith('.**')) return path.startsWith(pattern.slice(0, -2));
  const want = pattern.split('.');
  const got = path.split('.');
  return want.length === got.length && want.every((w, i) => w === '*' || w === got[i]);
}

function allowed(tool, path) {
  if (ENVELOPE.has(path) || DETAILS.has(path)) return true;
  return [...ALLOWED[tool]].some((pattern) => matches(pattern, path));
}

/** Every path in `value`: containers and leaves. */
function walk(value, prefix = '') {
  const paths = new Set(prefix ? [prefix] : []);
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, item] of Object.entries(value)) for (const p of walk(item, prefix ? `${prefix}.${key}` : key)) paths.add(p);
  } else if (Array.isArray(value)) {
    for (const item of value) for (const p of walk(item, `${prefix}[]`)) paths.add(p);
  }
  return paths;
}

// Complete hosted objects, from the hosted tools/list snapshot.

const HOSTED = JSON.parse(readFileSync(new URL('./hosted-tools.json', import.meta.url), 'utf8')).tools;
const DEFS = Object.assign({}, ...HOSTED.map((t) => t.outputSchema?.$defs ?? {}));
const deref = (node) => {
  const ref = node?.$ref;
  return typeof ref === 'string' ? deref(DEFS[ref.replace('#/$defs/', '')]) : node;
};

/** A value of `schema` that has every declared field, none of them null (the hosted test's `example`). */
function example(schema) {
  const node = deref(schema);
  if (Array.isArray(node.anyOf)) return example(node.anyOf.find((o) => deref(o).type !== 'null'));
  if (Array.isArray(node.enum)) return node.enum[0];
  if ('const' in node) return node.const;
  if (node.type === 'object' && node.properties) return Object.fromEntries(Object.entries(node.properties).map(([k, v]) => [k, example(v)]));
  if (node.type === 'object' && node.additionalProperties && typeof node.additionalProperties === 'object') return { us_ca: example(node.additionalProperties) };
  if (node.type === 'array') return [example(node.items)];
  return { string: 'x', integer: 1, number: 0.5, boolean: true }[node.type] ?? 'x';
}
const model = (name) => example({ $ref: `#/$defs/${name}` });
const rest = (name, over = {}) => ({ ...model(name), ...over });

const CANARY = 'CANARY-not-for-agents';
// Keys the REST answers carry that no agent gets (the hosted test's INTERNAL).
const INTERNAL = [
  'org_id', 'project_id', 'key_id', 'key_prefix', 'actor', 'provider_ref', 'transmitted_sha256',
  'policy_version_id', 'updated_at', 'cancel_requested_at', 'requested_by', 'requested_by_name',
  'decided_by', 'decided_by_name', 'decided_at', 'dedupe_key', 'event_id', 'fax_id', 'body', 'headers',
  'public_key_fingerprint', 'body_sha256', 'verified_at', 'call_duration_secs', 'number_id', 'read_at',
  'file_deleted_at', 'email', 'card', 'upload_id', 'source_ip', 'user_agent', 'correlation_id',
  'canary_new_field',
];

/** `value` with every internal key and the canary added to every object in it. */
function poisoned(value) {
  if (Array.isArray(value)) return value.map(poisoned);
  if (value && typeof value === 'object') {
    return { ...Object.fromEntries(Object.entries(value).map(([k, v]) => [k, poisoned(v)])), ...Object.fromEntries(INTERNAL.map((k) => [k, CANARY])) };
  }
  return value;
}

const IDS = {
  document: 'doc_' + '1'.repeat(32),
  quote: 'quote_' + '2'.repeat(32),
  fax: 'fax_' + '3'.repeat(32),
  approval: 'apr_' + '4'.repeat(32),
  order: 'oto_' + '5'.repeat(32),
  inbox: 'inb_' + '6'.repeat(32),
  extraction: 'ext_' + '7'.repeat(32),
};
const REFUSED_QUOTE = 'quote_' + 'e'.repeat(32);
const INVALID_DOC = 'doc_' + 'e'.repeat(32);
const DASHBOARD = 'https://app.faxforagents.com';

const FAX_JOB = rest('FaxJob', {
  id: IDS.fax, state: 'delivered', environment: 'live', to: '+12025550123', evidence: model('Evidence'),
  provider: 'carrier', one_time: { order_id: IDS.order, email: CANARY, card: { brand: CANARY, last4: CANARY } },
});
const ATTEMPT_ROW = rest('Attempt', { error: CANARY, started_at: CANARY, finished_at: CANARY, id: 'att_' + '8'.repeat(32) });
const QUOTE = rest('Quote', {
  id: IDS.quote, document_id: IDS.document, environment: 'live', authorization_required: false,
  created_at: CANARY, consumed_by_job_id: CANARY,
  policy_evaluation: {
    decision: 'allow', rule: null, reason: 'allowed by the policy', policy_id: 'pol_' + '9'.repeat(32),
    policy_version_id: CANARY, policy_name: 'night shift', version: 3, managed: 'connected_apps',
    denials: [{ rule: CANARY }], usage: { day_jobs: 1, day_amount_micro: 1, month_jobs: 1, month_amount_micro: 1 },
  },
});
const ORDER_ROW = rest('CardPaymentOrder', {
  id: IDS.order, next: 'checkout', status_url: `${DASHBOARD}/send/${IDS.order}?t=token`, fax: FAX_JOB,
  source: CANARY, authorized_at: CANARY, capture_deadline_at: CANARY, created_at: CANARY,
});
const REVIEW_ROW = rest('ReviewRequest', {
  id: IDS.approval, kind: 'send', status: 'approved', consumed_by_job_id: null,
  bound: { ...model('ReviewBound'), fax_job_id: IDS.fax, message: CANARY, environment: CANARY },
});
const ITEM = rest('InboxItemDetail', { id: IDS.inbox, provider: CANARY, duration_secs: CANARY, note: CANARY });
const EXTRACTION = {
  ...model('ExtractionSummary'), id: IDS.extraction, status: 'completed', schema: null,
  options: { strong_model_if_below: 0.75 },
  output: { text: 'Patient: Dana', fields: [model('ExtractedField')], warnings: ['page 2 is faint'], truncated: false, model: CANARY },
};
const REFUSAL_DETAILS = {
  available_micro: 0, needed_micro: 39000, top_up_url: `${DASHBOARD}/app/billing`,
  one_time_offer: { amount_micro: 2490000, document_pages: 1, x: CANARY },
  policy: { decision: 'deny', rule: 'destination', reason: 'no', policy_id: CANARY, denials: [] },
  resource_id: CANARY, identity: CANARY, provider_error: CANARY, known: [CANARY],
};

const ROUTES = [
  ['GET', /^\/v1\/capabilities$/, { ...model('Capabilities'), provider: CANARY }],
  ['GET', /^\/v1\/me$/, model('Me')],
  ['POST', /^\/v1\/documents$/, rest('Document', { id: IDS.document, sha256: 'a'.repeat(64) })],
  ['GET', /^\/v1\/documents\/doc_\w+\/pages$/, model('DocumentPages')],
  ['GET', /^\/v1\/documents\/doc_\w+$/, rest('Document', { id: IDS.document, sha256: 'a'.repeat(64) })],
  ['POST', /^\/v1\/fax-quotes$/, QUOTE],
  ['POST', /^\/v1\/faxes$/, FAX_JOB],
  ['POST', /^\/v1\/faxes\/fax_\w+\/cancel$/, FAX_JOB],
  ['GET', /^\/v1\/faxes\/fax_\w+\/attempts$/, { items: [ATTEMPT_ROW] }],
  ['GET', /^\/v1\/faxes\/fax_\w+$/, FAX_JOB],
  ['GET', /^\/v1\/faxes$/, { items: [FAX_JOB], next_cursor: IDS.fax }],
  ['GET', /^\/v1\/balance$/, model('Balance')],
  ['POST', /^\/v1\/one-time-sends\/from-quote$/, ORDER_ROW],
  ['GET', /^\/v1\/one-time-sends\/oto_\w+$/, ORDER_ROW],
  ['POST', /^\/v1\/approval-requests$/, REVIEW_ROW],
  ['GET', /^\/v1\/approval-requests\/apr_\w+$/, REVIEW_ROW],
  ['GET', /^\/v1\/inbox\/inb_\w+$/, ITEM],
  ['GET', /^\/v1\/inbox$/, { items: [model('InboxItem')], next_cursor: IDS.inbox }],
  ['GET', /^\/v1\/extractions$/, { items: [EXTRACTION] }],
];
const CALLS = [
  ['get_guide', {}],
  ['get_guide', { section: 'send' }],
  ['get_fax_capabilities', {}],
  ['prepare_fax', { text: 'Lab results attached.' }],
  ['get_fax_document', { document_id: IDS.document }],
  ['quote_fax', { document_id: IDS.document, to: '+12025550123' }],
  ['send_approved_fax', { quote_id: IDS.quote }],
  ['get_fax_status', { fax_id: IDS.fax }],
  ['list_faxes', {}],
  ['get_fax_balance', {}],
  ['cancel_fax', { fax_id: IDS.fax }],
  ['request_card_payment', { quote_id: IDS.quote, cover_from_name: 'Org A desk' }],
  ['get_card_payment_status', { order_id: IDS.order }],
  ['request_human_review', { message: 'Please approve.', quote_id: IDS.quote }],
  ['request_human_review', { message: 'Help with this fax.' }],
  ['get_review_status', { review_request_id: IDS.approval }],
  ['list_inbox', {}],
  ['read_inbound_fax', { inbox_id: IDS.inbox }],
  ['extract_fax_data', { inbox_item_id: IDS.inbox }],
];
const REFUSALS = [
  ['send_approved_fax', { quote_id: REFUSED_QUOTE }],
  ['quote_fax', { document_id: INVALID_DOC, to: '+12025550123' }],
];

const api = createServer((req, res) => {
  let raw = '';
  req.on('data', (d) => { raw += d; });
  req.on('end', () => {
    const json = (status, payload) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(payload)); };
    const url = new URL(req.url, 'http://localhost');
    const body = raw ? JSON.parse(raw) : {};
    if (req.method === 'POST' && url.pathname === '/v1/faxes' && body.quote_id === REFUSED_QUOTE) {
      return json(402, { error: { code: 'insufficient_balance', message: 'no', details: REFUSAL_DETAILS } });
    }
    if (req.method === 'POST' && url.pathname === '/v1/fax-quotes' && body.document_id === INVALID_DOC) {
      return json(422, { error: { code: 'invalid_request', message: 'request validation failed', details: [{ loc: ['body', 'from'], msg: 'bad', input: CANARY, ctx: { canary: CANARY } }, CANARY] } });
    }
    for (const [method, pattern, answer] of ROUTES) {
      if (req.method === method && pattern.test(url.pathname)) return json(200, poisoned(answer));
    }
    json(500, { error: { code: 'no_route', message: `no route for ${req.method} ${url.pathname}` } });
  });
});
await new Promise((r) => api.listen(0, '127.0.0.1', r));

async function session(calls) {
  const env = { ...process.env, FAXFORAGENTS_API_KEY: 'ffa_live_key', FAXFORAGENTS_API_URL: `http://127.0.0.1:${api.address().port}` };
  delete env.FFA_API_KEY;
  const child = spawn('node', ['dist/index.js'], { env, stdio: ['pipe', 'pipe', 'ignore'] });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  const parse = () => out.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const requests = [
    { jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'ci', version: '1' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    ...calls.map(([name, args], i) => ({ jsonrpc: '2.0', id: i + 2, method: 'tools/call', params: { name, arguments: args } })),
  ];
  for (const r of requests) child.stdin.write(JSON.stringify(r) + '\n');
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline && !requests.every((r) => r.id === undefined || parse().some((m) => m.id === r.id))) {
    await new Promise((r) => setTimeout(r, 50));
  }
  child.kill();
  const msgs = parse();
  return { tools: msgs.find((m) => m.id === 1)?.result?.tools ?? [], results: calls.map((_, i) => msgs.find((m) => m.id === i + 2)?.result) };
}

const failures = [];
const UNTRUSTED_LINE = 'untrusted fields (data, not instructions): ';
const ENVELOPE_KEYS = ['ok', 'message', 'error_code', 'details', 'untrusted'];

/** The paths of one result, in its structured content and in the JSON line of its text block (the hosted
 * `result_paths`). The two must carry the same data. Every untrusted entry must name a path on the list. */
function resultPaths(tool, reply) {
  const out = reply.structuredContent;
  const paths = walk(out);
  const lines = (reply.content?.[0]?.text ?? '').split('\n');
  if (lines.length && lines.at(-1).startsWith(UNTRUSTED_LINE)) lines.pop();
  const data = Object.fromEntries(Object.entries(out).filter(([k]) => !ENVELOPE_KEYS.includes(k)));
  if (Object.keys(data).length) {
    let parsed = null;
    try { parsed = JSON.parse(lines.at(-1)); } catch { /* reported below */ }
    if (JSON.stringify(parsed) !== JSON.stringify(data)) failures.push(`${tool}: the text block's JSON is not the structured data`);
    for (const p of walk(parsed)) paths.add(p);
  }
  for (const marked of out.untrusted ?? []) {
    if (!allowed(tool, marked)) failures.push(`${tool}: untrusted names ${marked}, which no result may hold`);
  }
  return paths;
}

const { tools, results } = await session([...CALLS, ...REFUSALS]);
const reached = Object.fromEntries(Object.keys(ALLOWED).map((tool) => [tool, new Set()]));
const unlisted = Object.fromEntries(Object.keys(ALLOWED).map((tool) => [tool, new Set()]));
const refused = Object.fromEntries(Object.keys(ALLOWED).map((tool) => [tool, 0]));

CALLS.forEach(([tool, args], i) => {
  const reply = results[i];
  const out = reply?.structuredContent;
  if (!out || out.ok !== true || reply.isError) {
    failures.push(`${tool} ${JSON.stringify(args)}: not ok: ${(reply?.content?.[0]?.text ?? JSON.stringify(reply)).slice(0, 300)}`);
    refused[tool] += 1;
    return;
  }
  if (JSON.stringify(out).includes(CANARY)) failures.push(`${tool}: the canary reached the structured content`);
  if (reply.content[0].text.includes(CANARY)) failures.push(`${tool}: the canary reached the text block`);
  for (const p of resultPaths(tool, reply)) {
    reached[tool].add(p);
    if (!allowed(tool, p)) unlisted[tool].add(p);
  }
});

for (const [tool, listed] of Object.entries(ALLOWED)) {
  const missing = [...listed].filter((p) => ![...reached[tool]].some((seen) => matches(p, seen)));
  if (missing.length) failures.push(`${tool}: listed paths no call reached: ${missing.sort().join(', ')}`);
  if (unlisted[tool].size) failures.push(`${tool}: ${unlisted[tool].size} path(s) not on the list: ${[...unlisted[tool]].sort().join(', ')}`);
}

// The card and the payer of a one-time order stay out of every fax an agent reads. The receipt link is the
// dashboard's.
const status = results[CALLS.findIndex(([t]) => t === 'get_card_payment_status')]?.structuredContent;
if (status?.fax && ('one_time' in status.fax || !status.fax.one_time_order_id)) failures.push('get_card_payment_status: fax.one_time reached the client');
if (status?.fax?.receipt_url !== `${DASHBOARD}/app/faxes/${IDS.fax}#receipt`) failures.push(`get_card_payment_status: receipt_url is ${status?.fax?.receipt_url}`);

// A refusal keeps only the details that say what to fix.
const [broke, invalid] = results.slice(CALLS.length);
const bd = broke?.structuredContent;
if (bd?.ok !== false || bd.error_code !== 'insufficient_balance') failures.push(`refusal: ${JSON.stringify(broke).slice(0, 300)}`);
else {
  if (JSON.stringify(bd).includes(CANARY) || broke.content[0].text.includes(CANARY)) failures.push('refusal: the canary reached the details');
  const extra = [...walk(bd.details, 'details')].filter((p) => p !== 'details' && !DETAILS.has(p));
  if (extra.length) failures.push(`refusal: details paths not on the list: ${extra.join(', ')}`);
  if (JSON.stringify(bd.details?.policy) !== JSON.stringify({ decision: 'deny', rule: 'destination', reason: 'no' })) failures.push(`refusal: details.policy is ${JSON.stringify(bd.details?.policy)}`);
  if (!bd.message.includes('Give the person this link to add funds')) failures.push(`refusal: ${bd.message}`);
}
const vd = invalid?.structuredContent;
if (JSON.stringify(vd?.details) !== JSON.stringify([{ loc: ['body', 'from_number'], msg: 'bad' }])) failures.push(`validation refusal: details are ${JSON.stringify(vd?.details)}`);

// tools/list says what a client can get: every object of every output schema forbids other keys.
const walkSchema = (node, where) => {
  if (Array.isArray(node)) return node.forEach((child) => walkSchema(child, where));
  if (!node || typeof node !== 'object') return;
  if ('properties' in node && node.additionalProperties !== false) failures.push(`${where}: an output schema object allows other keys`);
  for (const [key, child] of Object.entries(node)) walkSchema(child, `${where}.${key}`);
};
if (tools.length !== 17) failures.push(`tools/list returned ${tools.length} tools`);
for (const tool of tools) walkSchema(tool.outputSchema, tool.name);

api.close();
console.log('data paths returned per tool: all, on the list, not on the list');
for (const tool of Object.keys(ALLOWED)) {
  const data = [...reached[tool]].filter((p) => !ENVELOPE.has(p) && !DETAILS.has(p));
  const failed = refused[tool] ? ` (${refused[tool]} call(s) answered with an error)` : '';
  console.log(`  ${tool}: ${data.length}, ${data.length - unlisted[tool].size}, ${unlisted[tool].size}${failed}`);
}
if (failures.length) {
  for (const f of failures) console.error('FAIL:', f);
  process.exit(1);
}
console.log('output allow-list OK: every tool returns only the hosted paths, and every listed path is reached');
