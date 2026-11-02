import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createInterface } from 'node:readline';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const fixtures = JSON.parse(readFileSync(new URL('./hosted-validation.json', import.meta.url))).cases;
const notFound = fixtures.find((f) => f.structuredContent.error_code === 'not_found').structuredContent;
const seen = [];
const api = createServer((req, res) => {
  seen.push(req.url);
  req.resume();
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: { code: notFound.error_code, message: notFound.message } }));
});
await new Promise((resolve) => api.listen(0, '127.0.0.1', resolve));
const env = {
  ...process.env,
  FAXFORAGENTS_API_KEY: 'ffa_test_fixture',
  FAXFORAGENTS_API_URL: `http://127.0.0.1:${api.address().port}`,
};
delete env.FFA_API_KEY;
delete env.FFA_API_URL;

const child = spawn(process.execPath, ['dist/index.js'], { env, stdio: ['pipe', 'pipe', 'ignore'] });
const lines = createInterface({ input: child.stdout });
const pending = new Map();
let nextId = 0;
lines.on('line', (line) => {
  const message = JSON.parse(line);
  pending.get(message.id)?.(message);
});
async function request(method, params) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`No response to ${method}`)); }, 8000);
    pending.set(id, (message) => { clearTimeout(timer); pending.delete(id); resolve(message); });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}

function check(response, fixture, before) {
  assert.deepEqual(response.structuredContent, fixture.structuredContent, `report row ${fixture.row}`);
  const invalid = fixture.structuredContent.error_code === 'invalid_input';
  assert.equal(response.isError, invalid);
  assert.equal(response.content[0].text, fixture.structuredContent.message);
  assert.equal(seen.length - before, invalid ? 0 : 1, 'only well-formed IDs reach REST');
}

const client = new Client({ name: 'validation-fixtures', version: '1' });
try {
  await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'validation-wire', version: '1' } });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  for (const fixture of fixtures) {
    const before = seen.length;
    const response = await request('tools/call', { name: fixture.name, arguments: fixture.arguments });
    assert.equal(response.error, undefined);
    check(response.result, fixture, before);
  }

  // Exercise the published entry point with the SDK as well as raw JSON-RPC.
  await client.connect(new StdioClientTransport({ command: process.execPath, args: ['dist/index.js'], env, stderr: 'ignore' }));
  await client.listTools();
  for (const fixture of fixtures) {
    const before = seen.length;
    check(await client.callTool({ name: fixture.name, arguments: fixture.arguments }), fixture, before);
  }

  const shapes = fixtures.filter((f) => f.structuredContent.message.includes('prefix') && Object.values(f.arguments).some((v) => typeof v === 'string' && v.endsWith('_wave2b')));
  assert.equal(shapes.length, 13);
  let edgeCases = 0;
  for (const fixture of shapes) {
    const argument = fixture.structuredContent.message.split(' ')[0];
    const prefix = fixture.arguments[argument].split('_')[0];
    for (const value of ['', `${prefix}_${'a'.repeat(31)}`, `${prefix}_${'a'.repeat(33)}`, `${prefix}_${'A'.repeat(32)}`, `${prefix}_${'a'.repeat(32)}\n`, `doc_${'a'.repeat(32)}`]) {
      if (value === `${prefix}_${'a'.repeat(32)}`) continue;
      const before = seen.length;
      const response = await request('tools/call', { name: fixture.name, arguments: { ...fixture.arguments, [argument]: value } });
      check(response.result, fixture, before);
      edgeCases++;
    }
  }
  for (const name of ['get_fax_capabilities', 'get_fax_balance']) {
    const response = await request('tools/call', { name, arguments: [] });
    assert.ok(response.error, 'non-object arguments remain a protocol error');
    assert.equal(response.result, undefined);
  }
  const missing = await request('tools/call', { name: 'get_document', arguments: {} });
  assert.equal(missing.result.structuredContent.error_code, 'invalid_input');
  assert.match(missing.result.structuredContent.message, /document_id requires a value of type string/);
  const nested = await request('tools/call', { name: 'quote_fax', arguments: { document_id: 'doc_' + 'a'.repeat(32), to: '+15550000001', cover: { subject: 17 } } });
  assert.match(nested.result.structuredContent.message, /cover.subject requires a value of type string/);
  const decimal = await request('tools/call', { name: 'list_faxes', arguments: { limit: 1.5 } });
  assert.match(decimal.result.structuredContent.message, /limit requires a value of type integer/);
  console.log(`validation OK: ${fixtures.length} hosted fixtures over raw stdio and SDK, ${edgeCases} ID boundaries, protocol and type boundaries`);
} finally {
  await client.close();
  lines.close();
  child.kill();
  await new Promise((resolve) => api.close(resolve));
}
