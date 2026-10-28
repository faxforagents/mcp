#!/usr/bin/env node
/**
 * Protocol smoke test. Drives the built server over stdio as an MCP client would and asserts the
 * handshake, the 17 tools, the no-key path and the introspection triple. Runs WITHOUT a key on purpose:
 * that path is what every new user and every indexer hits first, and it has to degrade to a message.
 * Provenance: livetennisapi-mcp test/protocol.mjs (2026-10-28).
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

const EXPECTED_TOOLS = [
  'guide',
  'get_fax_capabilities',
  'prepare_fax',
  'preview_fax',
  'quote_fax',
  'send_approved_fax',
  'get_fax_status',
  'list_faxes',
  'get_fax_balance',
  'cancel_fax',
  'request_fax_approval',
  'evaluate_fax_policy',
  'get_delivery_evidence',
  'list_inbox',
  'read_inbound_fax',
  'extract_fax_data',
  'request_human_help',
];

const requests = [
  { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'ci', version: '1' } } },
  { jsonrpc: '2.0', method: 'notifications/initialized' },
  { jsonrpc: '2.0', id: 2, method: 'tools/list' },
  { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_fax_balance', arguments: {} } },
  { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'guide', arguments: { section: 'send' } } },
  { jsonrpc: '2.0', id: 5, method: 'resources/list' },
  { jsonrpc: '2.0', id: 6, method: 'prompts/list' },
];

const env = { ...process.env };
delete env.FAXFORAGENTS_API_KEY;
delete env.FFA_API_KEY;

const child = spawn('node', ['dist/index.js'], { env, stdio: ['pipe', 'pipe', 'pipe'] });
let out = '';
let errOut = '';
child.stdout.on('data', (d) => { out += d; });
child.stderr.on('data', (d) => { errOut += d; });
for (const r of requests) child.stdin.write(JSON.stringify(r) + '\n');
await new Promise((resolve) => setTimeout(resolve, 2500));
child.kill();

const fail = (msg) => { console.error('FAIL:', msg); process.exit(1); };
const messages = out.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

const init = messages.find((m) => m.id === 1);
if (!init?.result?.serverInfo) fail('no initialize result');
if (init.result.serverInfo.name !== 'faxforagents') fail(`server name ${init.result.serverInfo.name}`);
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
if (init.result.serverInfo.version !== pkg.version) fail(`version ${init.result.serverInfo.version} != package.json ${pkg.version}`);
if (!init.result.instructions?.includes('Fax for Agents MCP server')) fail('instructions missing');
for (const cap of ['tools', 'resources', 'prompts']) {
  if (!init.result.capabilities?.[cap]) fail(`${cap} capability not advertised`);
}

const tools = messages.find((m) => m.id === 2)?.result?.tools;
if (!Array.isArray(tools)) fail('no tools/list result');
const names = tools.map((t) => t.name);
if (names.length !== 17) fail(`expected 17 tools, got ${names.length}: ${names.join(', ')}`);
for (const t of tools) {
  const out = t.outputSchema;
  if (!out || out.type !== 'object') fail(`${t.name}: no outputSchema`);
  for (const k of ['ok', 'message']) if (!out.required?.includes(k)) fail(`${t.name}: outputSchema lacks ${k}`);
  if (!out.properties?.untrusted) fail(`${t.name}: outputSchema lacks untrusted`);
  if (out.additionalProperties !== false) fail(`${t.name}: outputSchema allows unknown keys`);
}
for (const expected of EXPECTED_TOOLS) if (!names.includes(expected)) fail(`missing tool: ${expected}`);
for (const tool of tools) {
  if (!tool.description) fail(`tool ${tool.name} has no description`);
  if (!tool.annotations) fail(`tool ${tool.name} has no annotations`);
}

// Without a key, a tool answers ok=false, error_code=invalid_token and names the env var.
const call = messages.find((m) => m.id === 3)?.result;
if (!call) fail('no tools/call result');
const sc = call.structuredContent;
if (!sc || sc.ok !== false || sc.error_code !== 'invalid_token') fail(`no-key path: ${JSON.stringify(sc)}`);
if (!/FAXFORAGENTS_API_KEY/.test(call.content?.[0]?.text ?? '')) fail('no-key message does not name FAXFORAGENTS_API_KEY');
if (call.content?.[0]?.text !== sc.message) fail('text and structured message differ');

// guide works without a key.
const guide = messages.find((m) => m.id === 4)?.result;
if (!guide || guide.structuredContent?.ok !== true || !/prepare_fax/.test(guide.content?.[0]?.text ?? '')) fail('guide(section=send) failed');

for (const [id, key] of [[5, 'resources'], [6, 'prompts']]) {
  const m = messages.find((x) => x.id === id);
  if (!m) fail(`no response to ${key}/list`);
  if (m.error) fail(`${key}/list errored (${m.error.code})`);
  if (!Array.isArray(m.result?.[key])) fail(`${key}/list did not return a ${key} array`);
}

if (!/ready \(no API key configured\)/.test(errOut)) fail(`stderr banner missing: ${errOut}`);
console.log(`protocol OK: ${names.length} tools, no-key path degrades, introspection triple answers`);
