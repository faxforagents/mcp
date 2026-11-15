#!/usr/bin/env node
/**
 * A refusal names the tool's arguments, never the REST fields they are sent as (the hosted `REST_FIELDS`,
 * API 1.20.8). quote_fax sends from_number as from, request_card_payment sends cover_from_name as
 * sender_name, request_human_review sends fax_id as fax_job_id. The fake API puts the REST name in
 * details.field, details.fields, a validation error's loc and the message, as the API does. The stdio
 * server has to answer with the argument's name, as the hosted server does.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';

const DOC = 'doc_' + '2'.repeat(32);
const QUOTE = 'quote_' + 'c'.repeat(32);
const FAX = 'fax_' + '1'.repeat(32);
const refuse = (status, code, message, details) => ({ status, body: { error: { code, message, retryable: false, correlation_id: 'req_1', details } } });

// What the API answers, picked by a value of the request body.
const ANSWERS = {
  '+14155550100': refuse(404, 'not_found', 'no such sender number; omit from to send from the shared pool', { field: 'from' }),
  '+1415': refuse(422, 'invalid_destination', 'from must be E.164', { field: 'from' }),
  '+1999': refuse(422, 'invalid_destination', 'destination must be E.164', { field: 'to' }),
  '+14155550111': refuse(422, 'invalid_request', 'the from field is wrong', { field: 'from' }),
  'D': refuse(422, 'invalid_request', 'sender_name is 2 to 120 characters; it goes on the cover sheet', { field: 'sender_name' }),
  'two fields': refuse(422, 'invalid_request', 'fax_job_id and message do not fit together', { fields: ['fax_job_id', 'message'], limit: 2 }),
  'malformed': refuse(422, 'invalid_request', 'the request is invalid', [{ loc: ['body', 'fax_job_id'], msg: 'String should match pattern' }, 'text']),
  [QUOTE]: refuse(422, 'invalid_destination', 'from must be E.164', { field: 'from' }),
};

const api = createServer((req, res) => {
  let raw = '';
  req.on('data', (d) => { raw += d; });
  req.on('end', () => {
    const body = raw ? JSON.parse(raw) : {};
    const key = [body.from, body.to, body.sender_name, body.message, body.quote_id].find((v) => v in ANSWERS);
    const answer = ANSWERS[key] ?? refuse(404, 'not_found', 'nope', null);
    res.writeHead(answer.status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(answer.body));
  });
});
await new Promise((r) => api.listen(0, '127.0.0.1', r));

async function session(calls) {
  const env = { ...process.env, FAXFORAGENTS_API_KEY: 'ffa_test_ok', FAXFORAGENTS_API_URL: `http://127.0.0.1:${api.address().port}` };
  delete env.FFA_API_KEY;
  const child = spawn('node', ['dist/index.js'], { env, stdio: ['pipe', 'pipe', 'ignore'] });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  const reqs = [
    { jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'ci', version: '1' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    ...calls.map(([name, args], i) => ({ jsonrpc: '2.0', id: i + 1, method: 'tools/call', params: { name, arguments: args } })),
  ];
  for (const r of reqs) child.stdin.write(JSON.stringify(r) + '\n');
  const parse = () => out.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline && !calls.every((_, i) => parse().some((m) => m.id === i + 1))) await new Promise((r) => setTimeout(r, 50));
  child.kill();
  return calls.map((_, i) => parse().find((m) => m.id === i + 1)?.result?.structuredContent);
}

const fail = (msg) => { console.error('FAIL:', msg); api.close(); process.exit(1); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const [notOurs, malformed, destination, later, card, plain, fields, validation] = await session([
  ['quote_fax', { document_id: DOC, to: '+15550000001', from_number: '+14155550100' }],
  ['quote_fax', { document_id: DOC, to: '+15550000001', from_number: '+1415' }],
  ['quote_fax', { document_id: DOC, to: '+1999' }],
  ['quote_fax', { document_id: DOC, to: '+15550000001', from_number: '+14155550111' }],
  ['request_card_payment', { quote_id: 'quote_' + 'd'.repeat(32), cover_from_name: 'D' }],
  ['send_approved_fax', { quote_id: QUOTE }],
  ['request_human_review', { message: 'two fields', fax_id: FAX }],
  ['request_human_review', { message: 'malformed', fax_id: FAX }],
]);

if (!same(notOurs?.details, { field: 'from_number' }) || !notOurs.message.startsWith('from_number is not a fax number of your organization')) fail(`not_found of the sender: ${JSON.stringify(notOurs)}`);
if (!same(malformed?.details, { field: 'from_number' }) || malformed.message !== 'from_number must be E.164') fail(`malformed sender: ${JSON.stringify(malformed)}`);
// the destination keeps its name: it is the same on both sides
if (!same(destination?.details, { field: 'to' }) || destination.message !== 'destination must be E.164') fail(`destination: ${JSON.stringify(destination)}`);
// a message that names the field later on is not rewritten
if (!same(later?.details, { field: 'from_number' }) || later.message !== 'the from field is wrong') fail(`message mentioning from later: ${JSON.stringify(later)}`);
if (!same(card?.details, { field: 'cover_from_name' }) || card.message !== 'cover_from_name is 2 to 120 characters; it goes on the cover sheet') fail(`card sender: ${JSON.stringify(card)}`);
// a tool with no row says what the API said, word for word
if (!same(plain?.details, { field: 'from' }) || plain.message !== 'from must be E.164') fail(`a tool without renamed arguments: ${JSON.stringify(plain)}`);
if (!same(fields?.details, { fields: ['fax_id', 'message'], limit: 2 }) || fields.error_code !== 'invalid_request') fail(`details.fields: ${JSON.stringify(fields)}`);
if (!same(validation?.details, [{ loc: ['body', 'fax_id'], msg: 'String should match pattern' }, 'text'])) fail(`validation loc: ${JSON.stringify(validation)}`);

api.close();
console.log('argument-names OK: 8 refusals name the tool arguments from_number, cover_from_name and fax_id, and a tool without renamed arguments keeps the API wording');
