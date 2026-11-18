/**
 * What a tool may return, cut as the hosted server cuts it since API 1.21.11. The hosted code is
 * mcp/schemas.py in fax-for-agents: `shape`, `shape_data`, `shape_details` and `DETAIL_KEYS`.
 * A tool's data keeps only what its output schema in `output-schemas.json` declares, at every level.
 * The cut comes before the result is built. So a field the REST API adds reaches no client until the
 * hosted schemas declare it and scripts/import-hosted.py copies them here. A refusal's details keep only
 * what says what to fix. test/output-allowlist.mjs pins every path with a copy of the hosted list.
 */

import { resolve } from './output-schema.js';
import schemas from './output-schemas.json' with { type: 'json' };

type JsonSchema = Record<string, unknown>;
type Json = Record<string, unknown>;

const TOOLS = (schemas as { tools: Record<string, JsonSchema> }).tools;

/** The keys every result carries. They are the result's own, never data a tool passes on. */
const ENVELOPE = new Set(['ok', 'message', 'error_code', 'details', 'untrusted']);

const isObject = (value: unknown): value is Json =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Every `$defs` entry of every tool by name. On the hosted server one name is one model, so two tools that
 * disagree about a name stop the server at start. */
const DEFS: Record<string, JsonSchema> = {};
for (const [tool, schema] of Object.entries(TOOLS)) {
  for (const [name, def] of Object.entries((schema.$defs as Record<string, JsonSchema> | undefined) ?? {})) {
    const seen = DEFS[name];
    if (seen && JSON.stringify(seen) !== JSON.stringify(def)) throw new Error(`${tool}: $defs ${name} differs between tools`);
    DEFS[name] = def;
  }
}
const ROOT: JsonSchema = { $defs: DEFS };

/** `value` with only what `schema` declares, at every level. Values are not converted. A field the value
 * lacks stays absent. A map of objects keeps the entries that are objects. */
function shape(schema: JsonSchema, root: JsonSchema, value: unknown): unknown {
  if (value === null || value === undefined) return value;
  const node = resolve(schema, root);
  if (Array.isArray(node.anyOf)) {
    const options = (node.anyOf as JsonSchema[]).filter((o) => resolve(o, root).type !== 'null');
    // a union of plain values (an extracted field's value) is a value, not an object to cut
    return options.length === 1 ? shape(options[0]!, root, value) : value;
  }
  if (node.type === 'array') {
    if (!Array.isArray(value) || !isObject(node.items)) return value;
    return value.map((item) => shape(node.items as JsonSchema, root, item));
  }
  if (node.type !== 'object' || !isObject(value)) return value;
  const props = (node.properties as Record<string, JsonSchema> | undefined) ?? {};
  const entry = node.additionalProperties;
  if (Object.keys(props).length === 0 && isObject(entry)) {
    const objects = resolve(entry, root).type === 'object';
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => !objects || isObject(item))
        .map(([key, item]) => [key, shape(entry, root, item)]),
    );
  }
  if (Object.keys(props).length === 0 && entry !== false) return value;
  // in the order the value has them: output-schemas.json is written with sorted keys
  const out: Json = {};
  for (const [key, item] of Object.entries(value)) {
    if (Object.hasOwn(props, key)) out[key] = shape(props[key]!, root, item);
  }
  return out;
}

/** One tool's data cut to its output schema. A field the schema does not declare is dropped. So is an
 * envelope field, which the result sets itself. */
export function shapeData(tool: string, data: Json | undefined): Json | undefined {
  if (!data) return data;
  const schema = TOOLS[tool];
  if (!schema) throw new Error(`no output schema for ${tool}`);
  const props = (schema.properties as Record<string, JsonSchema> | undefined) ?? {};
  const out: Json = {};
  for (const [key, value] of Object.entries(data)) {
    if (ENVELOPE.has(key) || !Object.hasOwn(props, key)) continue;
    out[key] = shape(props[key]!, schema, value);
  }
  return out;
}

/** `value` cut to one model of the output schemas, by its `$defs` name (`FaxJob`, `Attempt`, ...). A tool
 * cuts a job this way before it reads it for its untrusted paths or its prose. */
export function shapeAs(name: string, value: Json): Json {
  if (!DEFS[name]) throw new Error(`no output model ${name}`);
  return shape({ $ref: `#/$defs/${name}` }, ROOT, value) as Json;
}

/** What a refusal's details can carry to a client (the hosted `DETAIL_KEYS`). An object lists what it can
 * carry in turn. null is a plain value or a list of plain values. Each says what to fix or where the
 * person acts. */
export const DETAIL_KEYS: Readonly<Record<string, ReadonlySet<string> | null>> = {
  field: null,
  fields: null,
  scope: null,
  state: null,
  status: null,
  reason: null,
  quote_id: null,
  fax_job_id: null,
  one_time_order_id: null,
  available_micro: null,
  needed_micro: null,
  pages: null,
  document_pages: null,
  max_document_pages: null,
  max_pages: null,
  max_upload_bytes: null,
  formats: null,
  format: null,
  codepoint: null,
  name: null,
  environment: null,
  top_up_url: null,
  aup_url: null,
  one_time_offer: new Set([
    'amount_micro', 'currency', 'document_pages', 'included_pages', 'extra_page_micro', 'max_document_pages',
    'approval_id',
  ]),
  policy: new Set(['decision', 'rule', 'reason']),
};

/** What a validation error keeps of each item: where and what. */
const VALIDATION_KEYS = new Set(['loc', 'msg']);

/** A refusal's details cut to `DETAIL_KEYS`, or null when nothing is left (the hosted `shape_details`). */
export function shapeDetails(details: unknown): unknown {
  if (Array.isArray(details)) {
    const kept = details
      .filter((item) => isObject(item) && Array.isArray(item.loc))
      .map((item) => Object.fromEntries(Object.entries(item as Json).filter(([k]) => VALIDATION_KEYS.has(k))));
    return kept.length ? kept : null;
  }
  if (!isObject(details)) return null;
  const out: Json = {};
  for (const [key, value] of Object.entries(details)) {
    if (!Object.hasOwn(DETAIL_KEYS, key)) continue;
    const inner = DETAIL_KEYS[key];
    if (!inner) {
      if (!isObject(value)) out[key] = value;
    } else if (isObject(value)) {
      out[key] = Object.fromEntries(Object.entries(value).filter(([k]) => inner.has(k)));
    }
  }
  return Object.keys(out).length ? out : null;
}
