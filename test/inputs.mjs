#!/usr/bin/env node
/**
 * Every input the tool list advertises is taken by its handler, with the advertised type and limits.
 *
 * Zod drops an argument a handler's shape does not name, so an advertised input the handler forgot is ignored
 * without a word. Versions up to 0.5.1 advertised five inputs like that. This test reads tools/list from
 * the built server and asks the same server about every property of every tool:
 *   - a value of the wrong type is refused and the refusal names the property and its advertised type,
 *   - the advertised example is accepted, and null where the schema allows null,
 *   - a string over maxLength, a value outside the enum and a malformed id are refused,
 *   - a name the tool does not advertise is refused by name, with the names it takes, and every input
 *     schema says additionalProperties false.
 * An input the handler ignores fails the first check: nothing refuses the wrong type.
 * The server also compares the two lists of names when it registers a tool and does not start when they
 * differ. This test prints what the server said in that case.
 * This proves a handler takes each input. Where the input goes is test/tools-output.mjs: without a key no
 * handler runs past its arguments here. An API address nothing listens on: no call leaves this machine.
 */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const env = { ...process.env, FAXFORAGENTS_API_URL: 'http://127.0.0.1:9' };
for (const name of ['FAXFORAGENTS_API_KEY', 'FFA_API_KEY', 'FFA_API_URL']) delete env[name];

const child = spawn(process.execPath, ['dist/index.js'], { env, stdio: ['pipe', 'pipe', 'pipe'] });
let stderr = '';
child.stderr.on('data', (d) => { stderr += d; });
const pending = new Map();
createInterface({ input: child.stdout }).on('line', (line) => {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  pending.get(message.id)?.(message);
});
// A server that died answers nothing more: every open request ends now, not at its timeout.
child.on('exit', () => { for (const answer of [...pending.values()]) answer(null); });
child.stdin.on('error', () => {});
let nextId = 0;
function request(method, params) {
  const id = ++nextId;
  return new Promise((resolve) => {
    const timer = setTimeout(() => { pending.delete(id); resolve(null); }, 8000);
    pending.set(id, (message) => { clearTimeout(timer); pending.delete(id); resolve(message); });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}

const failures = [];
function finish() {
  child.kill();
  if (failures.length) {
    for (const f of failures) console.error('FAIL:', f);
    process.exit(1);
  }
}

const init = await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'inputs', version: '1' } });
if (!init?.result) {
  failures.push(`the server did not start. It said: ${stderr.trim().split('\n')[0] || 'nothing'}`);
  finish();
}
child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
const tools = (await request('tools/list', {}))?.result?.tools ?? [];
if (tools.length !== 17) failures.push(`expected 17 tools, got ${tools.length}`);

const TRY_AGAIN = 'Correct the argument and try again.';
// A value no schema of that type accepts.
const WRONG = { string: 17, integer: 'x', number: 'x', boolean: 'x', object: 17 };

/** The advertised schema of one property, whichever way it writes "or null". */
function describe(property) {
  const variants = Array.isArray(property.anyOf) ? property.anyOf : [property];
  const value = variants.find((v) => v.type !== 'null') ?? {};
  return { value, nullable: variants.some((v) => v.type === 'null') };
}

let checks = 0;
let properties = 0;
for (const tool of tools) {
  const advertised = tool.inputSchema?.properties ?? {};
  // The other arguments of a call: every required one, set to its own advertised example.
  const base = Object.fromEntries((tool.inputSchema?.required ?? []).map((name) => [name, advertised[name].examples[0]]));
  const call = async (name, value) => {
    checks++;
    const answer = await request('tools/call', { name: tool.name, arguments: { ...base, [name]: value } });
    return answer?.result ?? {};
  };
  const refused = (result) => result.isError === true && result.structuredContent?.error_code === 'invalid_input';
  // Past its arguments a call ends at the missing key. get_guide needs no key and answers. No answer is neither.
  const accepted = (result) => result.structuredContent?.error_code === 'invalid_token' || result.structuredContent?.ok === true;
  const show = (result) => JSON.stringify(result.structuredContent ?? result.content ?? result).slice(0, 200);

  // The tool list says what the call enforces: the schema closes the object, and a name it does not
  // advertise is refused by name before any advertised input is judged.
  if (tool.inputSchema?.additionalProperties !== false) failures.push(`${tool.name}: the input schema does not say additionalProperties false`);
  const names = Object.keys(advertised).sort();
  const stranger = await call('not_an_input', 1);
  const strangerMessage = `This tool does not take the argument not_an_input. It takes: ${names.join(', ') || 'none'}. Nothing was done. Correct the argument and try again.`;
  if (!refused(stranger) || stranger.structuredContent.message !== strangerMessage) failures.push(`${tool.name}: an argument it does not advertise was not refused as "${strangerMessage}". It answered ${show(stranger)}`);
  else if (JSON.stringify(stranger.structuredContent.details) !== JSON.stringify({ unknown_arguments: ['not_an_input'], accepted_arguments: names })) failures.push(`${tool.name}: the refusal of an unknown argument does not carry the names in details: ${show(stranger)}`);

  for (const [name, property] of Object.entries(advertised)) {
    properties++;
    const where = `${tool.name}.${name}`;
    const { value, nullable } = describe(property);
    if (!(value.type in WRONG)) {
      failures.push(`${where}: this test does not know the advertised type ${value.type}`);
      continue;
    }

    const wrong = await call(name, WRONG[value.type]);
    const typeMessage = `${name} requires a value of type ${value.type}. ${TRY_AGAIN}`;
    if (!refused(wrong) || wrong.structuredContent.message !== typeMessage) {
      failures.push(`${where} is advertised, and a ${typeof WRONG[value.type]} in it was not refused as "${typeMessage}". The handler ignores this input or takes another type. It answered ${show(wrong)}`);
      continue;
    }

    const example = await call(name, property.examples[0]);
    if (!accepted(example)) failures.push(`${where}: the advertised example was not accepted: ${show(example)}`);

    if (nullable) {
      const empty = await call(name, null);
      if (!accepted(empty)) failures.push(`${where} is advertised as nullable and null was not accepted: ${show(empty)}`);
    }

    if (value.maxLength) {
      const over = await call(name, 'k'.repeat(value.maxLength + 1));
      if (!refused(over) || over.structuredContent.message !== typeMessage) failures.push(`${where}: ${value.maxLength + 1} characters were not refused, the advertised limit is ${value.maxLength}`);
      const full = await call(name, 'k'.repeat(value.maxLength));
      if (!accepted(full)) failures.push(`${where}: ${value.maxLength} characters were not accepted, the advertised limit allows them`);
    }

    if (value.enum) {
      const outside = await call(name, 'not-an-advertised-value');
      if (!refused(outside) || outside.structuredContent.message !== typeMessage) failures.push(`${where}: a value outside the advertised enum was not refused`);
      for (const allowed of value.enum) {
        if (!accepted(await call(name, allowed))) failures.push(`${where}: the advertised value ${allowed} was not accepted`);
      }
    }

    if (value.pattern) {
      const prefix = /^\^([a-z]+)_\[0-9a-f\]\{32\}\$$/.exec(value.pattern)?.[1];
      if (!prefix) {
        failures.push(`${where}: this test does not know the advertised pattern ${value.pattern}`);
        continue;
      }
      const malformed = await call(name, `${prefix}_not-an-id`);
      const idMessage = `${name} must be a string with the ${prefix}_ prefix and 32 lowercase hexadecimal characters. ${TRY_AGAIN}`;
      if (!refused(malformed) || malformed.structuredContent.message !== idMessage) failures.push(`${where}: a malformed id was not refused as "${idMessage}": ${show(malformed)}`);
    }
  }
}

finish();
console.log(`inputs OK: ${properties} advertised inputs of ${tools.length} tools are taken by their handlers and no other name is (${checks} calls: types, examples, null, limits, enums, id formats, unknown arguments)`);
