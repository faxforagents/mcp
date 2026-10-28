#!/usr/bin/env node
/**
 * One real pass against https://api.faxforagents.com through the built stdio server, on the sandbox.
 * Opt in with FAXFORAGENTS_API_KEY (a test key). Nothing leaves the sandbox and nothing is charged.
 *
 *   FAXFORAGENTS_API_KEY=ffa_test_... npm run test:live
 */
import { spawn } from 'node:child_process';

const KEY = (process.env.FAXFORAGENTS_API_KEY ?? '').trim();
if (!KEY.startsWith('ffa_test_')) {
  console.log('live: skipped (FAXFORAGENTS_API_KEY is not a test key)');
  process.exit(0);
}

const child = spawn('node', ['dist/index.js'], { env: { ...process.env, FAXFORAGENTS_API_KEY: KEY }, stdio: ['pipe', 'pipe', 'inherit'] });
let out = '';
child.stdout.on('data', (d) => { out += d; });
let nextId = 1;
const pending = new Map();
child.stdout.on('data', () => {
  for (const line of out.split('\n').filter(Boolean)) {
    let m;
    try { m = JSON.parse(line); } catch { continue; }
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  }
});
const send = (method, params) => new Promise((resolve) => {
  const id = nextId++;
  pending.set(id, resolve);
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
});
const call = async (name, args) => {
  const m = await send('tools/call', { name, arguments: args });
  const sc = m.result?.structuredContent;
  console.log(`${name}: ${sc?.message?.split('\n')[0]}`);
  return sc;
};
const fail = (msg) => { console.error('FAIL:', msg); child.kill(); process.exit(1); };

await send('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'live', version: '1' } });
child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

const caps = await call('get_fax_capabilities', {});
if (caps.ok !== true || caps.capabilities.provider !== 'sandbox') fail('capabilities');
const prep = await call('prepare_fax', { text: 'Live test from faxforagents-mcp.', filename: 'mcp-live' });
if (prep.ok !== true) fail('prepare_fax');
const quote = await call('quote_fax', { document_id: prep.document.id, to: '+15550000001' });
if (quote.ok !== true || quote.quote.authorization_required !== false) fail('quote_fax');
const idem = `mcp-live-${Date.now()}`;
const sent = await call('send_approved_fax', { quote_id: quote.quote.id, idempotency_key: idem });
if (sent.ok !== true || sent.fax.state !== 'queued') fail('send_approved_fax');
const again = await call('send_approved_fax', { quote_id: quote.quote.id, idempotency_key: idem });
if (again.ok !== true || again.fax.id !== sent.fax.id) fail('idempotent resend');
let status;
for (let i = 0; i < 60; i++) {
  status = await call('get_fax_status', { fax_id: sent.fax.id });
  if (['delivered', 'partial', 'failed', 'unknown'].includes(status.fax.state)) break;
  await new Promise((r) => setTimeout(r, 2000));
}
if (status.fax.state !== 'delivered' || !status.fax.evidence) fail(`final state ${status.fax.state}, evidence ${JSON.stringify(status.fax.evidence)}`);
const ev = await call('get_delivery_evidence', { fax_id: sent.fax.id });
if (ev.ok !== true || !ev.evidence) fail('get_delivery_evidence');
const bal = await call('get_fax_balance', {});
if (bal.ok !== true) fail('get_fax_balance');
const list = await call('list_faxes', { limit: 1 });
if (list.ok !== true || list.items.length !== 1) fail('list_faxes');
child.kill();
console.log('live OK: sandbox send delivered with evidence through the stdio server');
