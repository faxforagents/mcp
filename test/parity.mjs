#!/usr/bin/env node
/**
 * Parity with the hosted server: the stdio package exposes the same 17 tools, with the same
 * descriptions, the same input properties, the same required lists, the same defaults and the same
 * annotations as https://mcp.faxforagents.com/mcp/ answered on 2026-10-28 (test/hosted-tools.json).
 * Refresh the snapshot with `node test/parity.mjs --refresh` (initialize and tools/list need no key).
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const SNAPSHOT = new URL('./hosted-tools.json', import.meta.url);
const HOSTED = 'https://mcp.faxforagents.com/mcp/';

async function fetchHosted() {
  const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
  const init = await fetch(HOSTED, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'parity', version: '0' } } }) });
  if (!init.ok) throw new Error(`initialize ${init.status}`);
  const list = await fetch(HOSTED, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) });
  return (await list.json()).result.tools;
}

if (process.argv.includes('--refresh')) {
  const tools = await fetchHosted();
  writeFileSync(SNAPSHOT, JSON.stringify({ captured_at: new Date().toISOString().slice(0, 10), source: `${HOSTED} tools/list`, tools }, null, 2) + '\n');
  console.log(`snapshot refreshed: ${tools.length} tools`);
  process.exit(0);
}

const hosted = JSON.parse(readFileSync(SNAPSHOT, 'utf8')).tools;

const env = { ...process.env };
delete env.FAXFORAGENTS_API_KEY;
const child = spawn('node', ['dist/index.js'], { env, stdio: ['pipe', 'pipe', 'ignore'] });
let out = '';
child.stdout.on('data', (d) => { out += d; });
child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'ci', version: '1' } } }) + '\n');
child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n');
await new Promise((r) => setTimeout(r, 2000));
child.kill();
const local = out.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean).find((m) => m.id === 2)?.result?.tools;

const fail = (msg) => { console.error('FAIL:', msg); process.exit(1); };
if (!local) fail('no local tools/list');

const byName = (tools) => Object.fromEntries(tools.map((t) => [t.name, t]));
const h = byName(hosted);
const l = byName(local);
if (hosted.map((t) => t.name).join() !== local.map((t) => t.name).join()) {
  fail(`tool names or order differ\n hosted: ${hosted.map((t) => t.name).join(', ')}\n local:  ${local.map((t) => t.name).join(', ')}`);
}

const typesOf = (schema) => {
  const types = new Set();
  const walk = (s) => {
    if (!s) return;
    if (Array.isArray(s.type)) s.type.forEach((t) => types.add(t));
    else if (s.type) types.add(s.type);
    (s.anyOf ?? []).forEach(walk);
  };
  walk(schema);
  return [...types].sort().join('|');
};

for (const name of Object.keys(h)) {
  const a = h[name];
  const b = l[name];
  if (a.description !== b.description) fail(`${name}: description differs\n hosted: ${a.description}\n local:  ${b.description}`);
  const ap = Object.keys(a.inputSchema.properties ?? {}).sort();
  const bp = Object.keys(b.inputSchema.properties ?? {}).sort();
  if (ap.join() !== bp.join()) fail(`${name}: properties differ (${ap} vs ${bp})`);
  const ar = [...(a.inputSchema.required ?? [])].sort().join();
  const br = [...(b.inputSchema.required ?? [])].sort().join();
  if (ar !== br) fail(`${name}: required differs (${ar} vs ${br})`);
  for (const p of ap) {
    const ta = typesOf(a.inputSchema.properties[p]);
    const tb = typesOf(b.inputSchema.properties[p]);
    if (ta !== tb) fail(`${name}.${p}: type differs (hosted ${ta}, local ${tb})`);
    const da = a.inputSchema.properties[p].default;
    const db = b.inputSchema.properties[p].default;
    if (JSON.stringify(da ?? null) !== JSON.stringify(db ?? null)) fail(`${name}.${p}: default differs (${da} vs ${db})`);
  }
  for (const k of ['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint']) {
    if (a.annotations?.[k] !== b.annotations?.[k]) fail(`${name}: annotation ${k} differs`);
  }
}
console.log(`parity OK: ${hosted.length} tools match the hosted snapshot (names, descriptions, properties, required, types, defaults, annotations)`);
