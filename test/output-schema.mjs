#!/usr/bin/env node
/**
 * The JSON Schema to zod converter of src/output-schema.ts on maps of objects. pydantic writes a
 * dict[str, Model] as an object whose additionalProperties is the entry's schema. The hosted price card
 * has five of them since API 1.21.11. They are the routes, the international rates, the excluded prefixes,
 * the changed routes and the card routes. Every entry is held to its schema: right types, nothing else.
 * The module is bundled in memory with esbuild and imported from a data URL, so nothing is written to disk.
 */
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: ['src/output-schema.ts'], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent',
});
const { toZod, outputSchema } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

const failures = [];
const accepts = (schema, value, label) => { if (!schema.safeParse(value).success) failures.push(`${label}: refused ${JSON.stringify(value)}`); };
const refuses = (schema, value, label) => { if (schema.safeParse(value).success) failures.push(`${label}: accepted ${JSON.stringify(value)}`); };

const PRICE = {
  type: 'object', additionalProperties: false, required: ['flat_micro'],
  properties: { flat_micro: { type: 'integer' }, cover_included: { anyOf: [{ type: 'boolean' }, { type: 'null' }], default: null } },
};
const map = toZod({
  type: 'object', additionalProperties: false, required: ['routes'],
  properties: { routes: { type: 'object', additionalProperties: { $ref: '#/$defs/Price' } } },
  $defs: { Price: PRICE },
});
accepts(map, { routes: { us_ca: { flat_micro: 2490000, cover_included: true } } }, 'a map entry that fits');
accepts(map, { routes: {} }, 'an empty map');
accepts(map, { routes: { us_ca: { flat_micro: 1 }, intl: { flat_micro: 2 } } }, 'two entries');
refuses(map, { routes: { us_ca: { flat_micro: 'x' } } }, 'an entry of the wrong type');
refuses(map, { routes: { us_ca: { flat_micro: 1, org_id: 'x' } } }, 'an entry with a key its schema does not declare');
refuses(map, { routes: { us_ca: 'x' } }, 'an entry that is not an object');
refuses(map, { routes: { us_ca: {} } }, 'an entry without a required key');
refuses(map, { routes: { us_ca: { flat_micro: 1 } }, extra: 1 }, 'the object around the map keeps forbidding other keys');

// Declared properties beside an entry schema: the declared ones keep their types, any other key is an entry.
const mixed = toZod({ type: 'object', properties: { label: { type: 'string' } }, additionalProperties: { type: 'integer' } });
accepts(mixed, { label: 'US', us_ca: 1 }, 'declared key and an entry');
refuses(mixed, { label: 'US', us_ca: 'x' }, 'an entry of the wrong type beside declared keys');

// A free-form object still takes anything, as before.
accepts(toZod({ type: 'object' }), { anything: { at: ['all'] } }, 'a free-form object');

// The real output schema of get_fax_capabilities, at the card routes of the price card.
const caps = outputSchema('get_fax_capabilities');
const route = { flat_micro: 2490000, included_pages: 5, extra_page_micro: 490000, cover_included: true };
const rates = {
  price_version: 'v', rates_version: 'r', effective_from: '2026-11-12', currency: 'USD', unit: 'page',
  routes: { us_ca: { label: 'US and Canada', send_per_page_micro: 39000 } }, international: {}, excluded: {},
  sandbox: { send_per_page_micro: 0 }, one_time: { max_document_pages: 20, routes: { us_ca: route } },
};
const capabilities = {
  environment: 'test', send: true, receive: true, numbers: false, routes: ['us_ca'], formats: ['pdf'], max_pages: 200,
  max_upload_bytes: 1, price_version: 'v', rates, scopes: [], approvals: true, extraction: true, limits: {},
  one_time: { enabled: true },
};
const result = (card) => ({ ok: true, message: 'm', capabilities: { ...capabilities, rates: { ...rates, one_time: { max_document_pages: 20, routes: card } } } });
accepts(caps, result({ us_ca: route }), 'get_fax_capabilities with a card route');
refuses(caps, result({ us_ca: { ...route, flat_micro: '2.49' } }), 'get_fax_capabilities with a card route of the wrong type');
refuses(caps, result({ us_ca: { ...route, provider: 'x' } }), 'get_fax_capabilities with a card route that carries another key');

if (failures.length) {
  for (const f of failures) console.error('FAIL:', f);
  process.exit(1);
}
console.log('output-schema OK: maps of objects hold every entry to its schema, in a test schema and in get_fax_capabilities');
