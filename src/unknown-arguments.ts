/**
 * The refusal for arguments a tool does not declare, in the hosted server's words (its mcp/validation.py,
 * `unknown_arguments`). Zod drops a name the shape does not have, so a call with the REST name of a field
 * (`from` for `from_number`, `status` for `state`) ran as if the argument had not been sent.
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/** Names another surface uses for a tool argument: the REST field, the list filter, the bare noun. */
const ALIASES = new Map<string, string>([
  ['from', 'from_number'],
  ['sender', 'from_number'],
  ['from_', 'from_number'],
  ['to_number', 'to'],
  ['destination', 'to'],
  ['status', 'state'],
  ['document', 'document_id'],
  ['doc_id', 'document_id'],
  ['quote', 'quote_id'],
  ['fax', 'fax_id'],
  ['fax_job_id', 'fax_id'],
  ['job_id', 'fax_id'],
  ['approval', 'approval_id'],
  ['inbox_item_id', 'inbox_id'],
  ['inbox_id', 'inbox_item_id'],
  ['item_id', 'inbox_id'],
  ['id', ''],
  ['key', 'idempotency_key'],
  ['idempotency-key', 'idempotency_key'],
  ['idempotencyKey', 'idempotency_key'],
  ['page_size', 'limit'],
  ['per_page', 'limit'],
]);

/** Names a workflow client adds to the arguments of every tool call. They describe the client's own run,
 * not the call, so they are dropped and the call is judged on the arguments it meant to send. */
const CLIENT_KEYS = new Set(['sessionId', 'action', 'chatInput', 'toolCallId']);

/** An argument name the text may repeat: an identifier, not a sentence a caller put in a key. */
const NAME = /^[A-Za-z_][A-Za-z0-9_-]{0,39}$/;
const MAX_NAMED = 5;
const CUTOFF = 0.8;

/** The number of characters two strings share in order, as Python's difflib counts them: the longest
 * common block first, then the same on each side of it. */
function matching(a: string, b: string, alo = 0, ahi = a.length, blo = 0, bhi = b.length): number {
  let besti = alo;
  let bestj = blo;
  let bestsize = 0;
  let previous = new Map<number, number>();
  for (let i = alo; i < ahi; i++) {
    const current = new Map<number, number>();
    for (let j = blo; j < bhi; j++) {
      if (a[i] !== b[j]) continue;
      const k = (previous.get(j - 1) ?? 0) + 1;
      current.set(j, k);
      if (k > bestsize) {
        besti = i - k + 1;
        bestj = j - k + 1;
        bestsize = k;
      }
    }
    previous = current;
  }
  if (!bestsize) return 0;
  return (
    bestsize +
    matching(a, b, alo, besti, blo, bestj) +
    matching(a, b, besti + bestsize, ahi, bestj + bestsize, bhi)
  );
}

/** difflib's ratio: twice the shared characters over the two lengths. */
function ratio(a: string, b: string): number {
  const total = a.length + b.length;
  return total ? (2 * matching(a, b)) / total : 1;
}

/** The declared argument an unknown name most likely stands for, or null. */
function meant(name: string, properties: string[]): string | null {
  const alias = ALIASES.get(name);
  if (alias && properties.includes(alias)) return alias;
  if (name === 'id') {
    const ids = properties.filter((p) => p.endsWith('_id'));
    return ids.length === 1 ? ids[0]! : null;
  }
  const lowered = new Map(properties.map((p) => [p.toLowerCase().replaceAll('-', '_'), p]));
  const folded = name.replace(/(?<=[a-z0-9])(?=[A-Z])/g, '_').toLowerCase().replaceAll('-', '_');
  const exact = lowered.get(folded);
  if (exact) return exact;
  let best: [number, string] | null = null;
  for (const candidate of lowered.keys()) {
    const score = ratio(candidate, folded);
    if (score < CUTOFF) continue;
    if (!best || score > best[0] || (score === best[0] && candidate > best[1])) best = [score, candidate];
  }
  return best ? lowered.get(best[1])! : null;
}

/** A refusal for arguments the tool does not declare, or null when every one is declared. Only
 * identifier-like names are repeated, at most five, and never an argument's value. */
export function unknownArguments(args: unknown, declared: Record<string, unknown>): CallToolResult | null {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return null;
  const properties = Object.keys(declared);
  const unknown = Object.keys(args).filter((name) => !Object.hasOwn(declared, name) && !CLIENT_KEYS.has(name));
  if (!unknown.length) return null;
  const named = unknown.filter((name) => NAME.test(name)).slice(0, MAX_NAMED);
  const parts = named.map((name) => {
    const target = meant(name, properties);
    return target ? `${name} (did you mean ${target}?)` : name;
  });
  const rest = unknown.length - named.length;
  let listed: string;
  if (parts.length && rest) listed = `${parts.join(', ')} and ${rest} more`;
  else if (parts.length) listed = parts.join(', ');
  else listed = `${rest} of the names sent`;
  const s = unknown.length !== 1 ? 's' : '';
  const accepted = [...properties].sort();
  const message =
    `This tool does not take the argument${s} ${listed}. ` +
    `It takes: ${accepted.join(', ') || 'none'}. Nothing was done. Correct the argument${s} and try again.`;
  return {
    content: [{ type: 'text', text: message }],
    structuredContent: {
      ok: false,
      error_code: 'invalid_input',
      message,
      details: { unknown_arguments: named, accepted_arguments: accepted },
    },
    isError: true,
  };
}
