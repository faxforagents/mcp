#!/usr/bin/env node
/**
 * Compare the full tool definitions with a recorded hosted or local Python snapshot.
 * Normal runs never contact the hosted server. --refresh explicitly fetches tools/list.
 * scripts/import-hosted.py imports definitions before the hosted release is deployed.
 * FFA_SKIP_PARITY=1 skips this suite when the fixture intentionally trails local work.
 */
import assert from 'node:assert/strict';
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

if (process.env.FFA_SKIP_PARITY === '1') {
  console.log('parity SKIPPED (FFA_SKIP_PARITY=1): recorded snapshot comparison disabled');
  process.exit(0);
}

const hosted = JSON.parse(readFileSync(SNAPSHOT, 'utf8')).tools;

const env = { ...process.env };
delete env.FAXFORAGENTS_API_KEY;
delete env.FFA_API_KEY;
const child = spawn('node', ['dist/index.js'], { env, stdio: ['pipe', 'pipe', 'ignore'] });
let out = '';
child.stdout.on('data', (d) => { out += d; });
child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'ci', version: '1' } } }) + '\n');
child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n');
// wait for the tools/list answer itself (bounded), not a fixed timer
const parse = () => out.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const deadline = Date.now() + 8000;
while (Date.now() < deadline && !parse().some((m) => m.id === 2)) await new Promise((r) => setTimeout(r, 50));
child.kill();
const local = parse().find((m) => m.id === 2)?.result?.tools;

const fail = (msg) => { console.error('FAIL:', msg); process.exit(1); };
if (!local) fail('no local tools/list');

assert.equal(hosted.length, 15, 'snapshot tool count');
assert.deepEqual(local, hosted, 'full tool definitions must match the source snapshot');
const plugin = JSON.parse(readFileSync(new URL('../lhm.plugin.json', import.meta.url), 'utf8'));
assert.deepEqual(plugin.tools, hosted, 'plugin tools must match the source snapshot');
console.log(`parity OK: ${hosted.length} tools match the snapshot and plugin (names, titles, descriptions, full input/output schemas, annotations)`);
