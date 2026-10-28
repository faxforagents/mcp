/**
 * The output schema of every tool, mirrored from the hosted server (fax-for-agents
 * `scripts/export-mcp-output-schemas.py` writes `output-schemas.json`; copied here, never imported across
 * repos). The SDK wants zod, so the small JSON Schema subset pydantic emits for those models is turned
 * into zod here: objects with properties and required, `$defs` references, anyOf-with-null (nullable),
 * arrays, strings, numbers, integers, booleans, enums, consts and free-form objects. Anything else
 * throws at registration, so a schema the converter does not understand fails `npm test`, never a
 * client at call time.
 */

import { z } from 'zod';

import schemas from './output-schemas.json' with { type: 'json' };

type JsonSchema = Record<string, unknown>;

const DEFS = '$defs';

function resolve(node: JsonSchema, root: JsonSchema): JsonSchema {
  const ref = node.$ref;
  if (typeof ref !== 'string') return node;
  const m = /^#\/\$defs\/(.+)$/.exec(ref);
  if (!m) throw new Error(`unsupported $ref ${ref}`);
  const key = m[1] ?? '';
  const target = (root[DEFS] as Record<string, JsonSchema> | undefined)?.[key];
  if (!target) throw new Error(`missing $defs entry ${key}`);
  return resolve(target, root);
}

export function toZod(schema: JsonSchema, root: JsonSchema = schema): z.ZodTypeAny {
  const node = resolve(schema, root);
  if (Array.isArray(node.anyOf)) {
    const options = (node.anyOf as JsonSchema[]).map((o) => resolve(o, root));
    const nullable = options.some((o) => o.type === 'null');
    const rest = options.filter((o) => o.type !== 'null');
    let inner: z.ZodTypeAny;
    if (rest.length === 0) inner = z.null();
    else if (rest.length === 1) inner = toZod(rest[0] as JsonSchema, root);
    else {
      const built = rest.map((o) => toZod(o, root));
      inner = z.union([built[0], built[1], ...built.slice(2)] as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
    }
    return nullable ? inner.nullable() : inner;
  }
  if (Array.isArray(node.enum)) {
    const values = node.enum as unknown[];
    if (values.every((v) => typeof v === 'string')) return z.enum(values as [string, ...string[]]);
    throw new Error('non-string enum');
  }
  if ('const' in node) return z.literal(node.const as string | number | boolean);
  const type = Array.isArray(node.type) ? undefined : (node.type as string | undefined);
  if (Array.isArray(node.type)) {
    const types = node.type as string[];
    const nonNull = types.filter((t) => t !== 'null');
    const inner = nonNull.length === 1 ? toZod({ ...node, type: nonNull[0] }, root) : z.unknown();
    return types.includes('null') ? inner.nullable() : inner;
  }
  switch (type) {
    case 'string':
      return z.string();
    case 'number':
      return z.number();
    case 'integer':
      return z.number().int();
    case 'boolean':
      return z.boolean();
    case 'null':
      return z.null();
    case 'array':
      return z.array(node.items ? toZod(node.items as JsonSchema, root) : z.unknown());
    case 'object': {
      const props = (node.properties as Record<string, JsonSchema> | undefined) ?? {};
      if (Object.keys(props).length === 0) return z.record(z.unknown());
      const required = new Set((node.required as string[] | undefined) ?? []);
      const shape: Record<string, z.ZodTypeAny> = {};
      for (const [name, prop] of Object.entries(props)) {
        const field = toZod(prop, root);
        shape[name] = required.has(name) ? field : field.optional();
      }
      const obj = z.object(shape);
      return node.additionalProperties === false ? obj.strict() : obj.passthrough();
    }
    case undefined:
      return z.unknown();
    default:
      throw new Error(`unsupported type ${type}`);
  }
}

/** The zod object of one tool's output schema, as `registerTool` takes it. */
export function outputSchema(tool: string): z.ZodObject<z.ZodRawShape> {
  const tools = (schemas as { tools: Record<string, JsonSchema> }).tools;
  const schema = tools[tool];
  if (!schema) throw new Error(`no output schema for ${tool}`);
  const built = toZod(schema);
  if (!(built instanceof z.ZodObject)) throw new Error(`output schema of ${tool} is not an object`);
  return built as z.ZodObject<z.ZodRawShape>;
}

export const OUTPUT_SCHEMA_TOOLS: string[] = Object.keys((schemas as { tools: Record<string, JsonSchema> }).tools);
