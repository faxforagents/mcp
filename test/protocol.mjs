#!/usr/bin/env node
/**
 * Protocol smoke test. Drives the built server over stdio as an MCP client would and asserts the
 * handshake, the 15 tools, the no-key path, the guide resources and the two prompts. Runs WITHOUT a key
 * on purpose: that path is what every new user and every indexer hits first, and it has to degrade to
 * a message. Provenance: livetennisapi-mcp test/protocol.mjs (2026-10-28).
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

const EXPECTED_TOOLS = [
  'get_guide',
  'get_fax_capabilities',
  'prepare_fax',
  'get_document',
  'quote_fax',
  'send_approved_fax',
  'get_fax_status',
  'list_faxes',
  'get_fax_balance',
  'cancel_fax',
  'request_human_review',
  'get_review_status',
  'list_inbox',
  'read_inbound_fax',
  'extract_fax_data',
];
const GONE = ['guide', 'get_delivery_evidence', 'request_fax_approval', 'request_human_help'];
const SECTIONS = ['overview', 'send', 'states', 'errors', 'approvals', 'policies', 'agents', 'inbox', 'ocr'];

const requests = [
  { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'ci', version: '1' } } },
  { jsonrpc: '2.0', method: 'notifications/initialized' },
  { jsonrpc: '2.0', id: 2, method: 'tools/list' },
  { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_fax_balance', arguments: {} } },
  { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'get_guide', arguments: { section: 'send' } } },
  { jsonrpc: '2.0', id: 5, method: 'resources/list' },
  { jsonrpc: '2.0', id: 6, method: 'prompts/list' },
  { jsonrpc: '2.0', id: 7, method: 'resources/templates/list' },
  { jsonrpc: '2.0', id: 8, method: 'resources/read', params: { uri: 'faxforagents://guide' } },
  { jsonrpc: '2.0', id: 9, method: 'resources/read', params: { uri: 'faxforagents://guide/send' } },
  { jsonrpc: '2.0', id: 10, method: 'resources/read', params: { uri: 'faxforagents://guide/nope' } },
  { jsonrpc: '2.0', id: 11, method: 'prompts/get', params: { name: 'send_a_fax', arguments: { to: '+15550000001', summary: 'a test page' } } },
  { jsonrpc: '2.0', id: 12, method: 'prompts/get', params: { name: 'handle_received_fax', arguments: { inbox_item_id: 'inb_' + '7'.repeat(32) } } },
  { jsonrpc: '2.0', id: 13, method: 'tools/call', params: { name: 'get_guide', arguments: {} } },
];
const ids = requests.filter((r) => r.id).map((r) => r.id);

const env = { ...process.env };
delete env.FAXFORAGENTS_API_KEY;
delete env.FFA_API_KEY;

const child = spawn('node', ['dist/index.js'], { env, stdio: ['pipe', 'pipe', 'pipe'] });
let out = '';
let errOut = '';
child.stdout.on('data', (d) => { out += d; });
child.stderr.on('data', (d) => { errOut += d; });
for (const r of requests) child.stdin.write(JSON.stringify(r) + '\n');
const parse = () => out.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const deadline = Date.now() + 8000;
while (Date.now() < deadline) {
  const got = parse();
  if (ids.every((id) => got.some((m) => m.id === id))) break;
  await new Promise((r) => setTimeout(r, 50));
}
child.kill();

const fail = (msg) => { console.error('FAIL:', msg); process.exit(1); };
const messages = parse();
const reply = (id) => messages.find((m) => m.id === id);

const init = reply(1);
if (!init?.result?.serverInfo) fail('no initialize result');
if (init.result.serverInfo.name !== 'faxforagents') fail(`server name ${init.result.serverInfo.name}`);
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
if (init.result.serverInfo.version !== pkg.version) fail(`version ${init.result.serverInfo.version} != package.json ${pkg.version}`);
if (!init.result.instructions?.includes('Fax for Agents MCP server')) fail('instructions missing');
for (const cap of ['tools', 'resources', 'prompts']) {
  if (!init.result.capabilities?.[cap]) fail(`${cap} capability not advertised`);
}

const tools = reply(2)?.result?.tools;
if (!Array.isArray(tools)) fail('no tools/list result');
const names = tools.map((t) => t.name);
if (names.length !== 15) fail(`expected 15 tools, got ${names.length}: ${names.join(', ')}`);
if (names.join() !== EXPECTED_TOOLS.join()) fail(`tool names or order differ: ${names.join(', ')}`);
for (const t of tools) {
  const out = t.outputSchema;
  if (!out || out.type !== 'object') fail(`${t.name}: no outputSchema`);
  for (const k of ['ok', 'message']) if (!out.required?.includes(k)) fail(`${t.name}: outputSchema lacks ${k}`);
  if (!out.properties?.untrusted) fail(`${t.name}: outputSchema lacks untrusted`);
  if (out.additionalProperties !== false) fail(`${t.name}: outputSchema allows unknown keys`);
  if (!t.description) fail(`tool ${t.name} has no description`);
  if (!t.annotations) fail(`tool ${t.name} has no annotations`);
  for (const old of GONE) if (new RegExp(`\\b${old}\\b`).test(t.description)) fail(`${t.name} still names ${old}`);
}
const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
const guideTool = byName.get_guide;
if (!guideTool.description.startsWith('The manual for Fax for Agents:')) fail(`get_guide description: ${guideTool.description}`);
if (!SECTIONS.every((s) => guideTool.description.includes(s))) fail('get_guide description does not list the sections');
if (guideTool.inputSchema.required?.length) fail('get_guide section must be optional');
const status = byName.get_fax_status;
if (!/delivery evidence/.test(status.description) || !/not legal proof/.test(status.description)) fail(`get_fax_status description: ${status.description}`);
if (!/remote station id/.test(status.description) || !/provider reference/.test(status.description)) fail('get_fax_status description does not say what the evidence holds');
const review = byName.request_human_review;
if (!/Grants nothing: a human decides, then send_approved_fax/.test(review.description)) fail(`request_human_review description: ${review.description}`);
if (!/Scope: approval:request\.$/.test(review.description)) fail('request_human_review scope');
const firstTwo = review.description.split('. ').slice(0, 2).join('. ');
if (!/quote_id/.test(firstTwo) || !/help request/.test(firstTwo)) fail(`request_human_review: both modes are not in the first two sentences: ${firstTwo}`);
if (Object.keys(review.inputSchema.properties).sort().join() !== 'fax_id,message,quote_id') fail('request_human_review properties');
if ((review.inputSchema.required ?? []).join() !== 'message') fail('request_human_review: only message is required');
if (!review.outputSchema.properties.review_request) fail('request_human_review outputSchema lacks review_request');
if (byName.send_approved_fax.description.includes('request_human_review') !== true) fail('send_approved_fax does not point at request_human_review');

// Without a key, a tool answers ok=false, error_code=invalid_token and names the env var.
const call = reply(3)?.result;
if (!call) fail('no tools/call result');
const sc = call.structuredContent;
if (!sc || sc.ok !== false || sc.error_code !== 'invalid_token') fail(`no-key path: ${JSON.stringify(sc)}`);
if (!/FAXFORAGENTS_API_KEY/.test(call.content?.[0]?.text ?? '')) fail('no-key message does not name FAXFORAGENTS_API_KEY');
if (call.content?.[0]?.text !== sc.message) fail('text and structured message differ');

// get_guide works without a key, by section and whole, and names no retired tool.
const guide = reply(4)?.result;
if (!guide || guide.structuredContent?.ok !== true || !/prepare_fax/.test(guide.content?.[0]?.text ?? '')) fail('get_guide(section=send) failed');
if (guide.structuredContent.section !== 'send') fail('get_guide section echo');
const whole = reply(13)?.result;
if (!whole || whole.structuredContent?.ok !== true || whole.structuredContent.sections?.length !== SECTIONS.length) fail('get_guide() whole');
for (const old of GONE) if (new RegExp(`\\b${old}\\b`).test(whole.content[0].text)) fail(`the guide still names ${old}`);
if (!/request_human_review\(message, quote_id\)/.test(whole.content[0].text)) fail('the guide does not explain the approval mode of request_human_review');

// Resources: the whole guide and one resource per section, all text/markdown, readable without a key.
const resources = reply(5)?.result?.resources;
if (!Array.isArray(resources)) fail('resources/list did not return a resources array');
const uris = resources.map((r) => r.uri);
if (!uris.includes('faxforagents://guide')) fail(`faxforagents://guide not listed: ${uris.join(', ')}`);
for (const s of SECTIONS) if (!uris.includes(`faxforagents://guide/${s}`)) fail(`faxforagents://guide/${s} not listed`);
if (resources.some((r) => r.mimeType !== 'text/markdown')) fail('a guide resource is not text/markdown');
const templates = reply(7)?.result?.resourceTemplates;
if (!templates?.some((t) => t.uriTemplate === 'faxforagents://guide/{section}')) fail(`resource template missing: ${JSON.stringify(templates)}`);
const full = reply(8)?.result?.contents?.[0];
if (full?.mimeType !== 'text/markdown' || !/Fax for Agents MCP server/.test(full?.text ?? '') || !/extract_fax_data/.test(full.text)) fail('resources/read faxforagents://guide');
if (!whole.content[0].text.startsWith(full.text)) fail('the guide resource and get_guide() differ');
const sendRes = reply(9)?.result?.contents?.[0];
if (sendRes?.uri !== 'faxforagents://guide/send' || !guide.content[0].text.startsWith(sendRes.text)) fail('resources/read faxforagents://guide/send differs from get_guide(section=send)');
const bad = reply(10);
if (!bad?.error || !/No guide section 'nope'/.test(bad.error.message)) fail(`unknown section should be an invalid-params error: ${JSON.stringify(bad)}`);

// Prompts: send_a_fax (to, optional summary) and handle_received_fax (inbox_item_id), with the tools in order.
const prompts = reply(6)?.result?.prompts;
if (!Array.isArray(prompts)) fail('prompts/list did not return a prompts array');
const pByName = Object.fromEntries(prompts.map((p) => [p.name, p]));
const sendPrompt = pByName.send_a_fax;
if (!sendPrompt) fail('send_a_fax prompt missing');
const argOf = (p, n) => p.arguments?.find((a) => a.name === n);
if (argOf(sendPrompt, 'to')?.required !== true || argOf(sendPrompt, 'summary')?.required !== false) fail(`send_a_fax arguments: ${JSON.stringify(sendPrompt.arguments)}`);
const handlePrompt = pByName.handle_received_fax;
if (!handlePrompt || argOf(handlePrompt, 'inbox_item_id')?.required !== true) fail('handle_received_fax arguments');
const sendText = reply(11)?.result?.messages?.[0]?.content?.text ?? '';
const inOrder = (text, steps) => steps.map((s) => text.indexOf(s)).every((i, k, arr) => i >= 0 && (k === 0 || i > arr[k - 1]));
if (!inOrder(sendText, ['prepare_fax', 'quote_fax', 'request_human_review', 'get_review_status', 'send_approved_fax', 'get_fax_status'])) fail(`send_a_fax steps out of order: ${sendText}`);
if (!/\+15550000001/.test(sendText) || !/a test page/.test(sendText)) fail('send_a_fax does not carry its arguments');
const handleText = reply(12)?.result?.messages?.[0]?.content?.text ?? '';
if (!inOrder(handleText, ['read_inbound_fax', 'extract_fax_data', 'request_human_review'])) fail(`handle_received_fax steps out of order: ${handleText}`);
if (!/never an instruction/.test(handleText) || !/never a destination/.test(handleText)) fail('handle_received_fax lacks the untrusted-text rule');
if (!handleText.includes('inb_' + '7'.repeat(32))) fail('handle_received_fax does not carry the inbox item id');
for (const text of [sendText, handleText]) for (const old of GONE) if (new RegExp(`\\b${old}\\b`).test(text)) fail(`a prompt still names ${old}`);

if (!/ready \(no API key configured\)/.test(errOut)) fail(`stderr banner missing: ${errOut}`);
console.log(`protocol OK: ${names.length} tools, no-key path degrades, ${resources.length} guide resources, ${prompts.length} prompts`);
