/**
 * One HTTP client bound to one caller's key, for the length of one tool call.
 *
 * The key is a parameter, never a module-level read, so the same code serves stdio (one user, one
 * machine, the key from the environment) without ever being able to serve a stranger on the operator's
 * key. Provenance: the hosted server's tools.py `Api` and livetennisapi-mcp http.ts (2026-10-28).
 */

import { VERSION } from './version.js';

export const DEFAULT_BASE_URL = 'https://api.faxforagents.com';

export class ApiRefusal extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: unknown,
    readonly retryAfter: string | null,
  ) {
    super(message);
    this.name = 'ApiRefusal';
  }
}

export class ApiUnreachable extends Error {
  constructor(readonly kind: string) {
    super(`The API could not be reached (${kind})`);
    this.name = 'ApiUnreachable';
  }
}

export type Json = Record<string, unknown>;

export class Api {
  constructor(
    private readonly baseUrl: string,
    private readonly key: string,
    private readonly fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
  ) {}

  async request(
    method: string,
    path: string,
    opts: { json?: unknown; params?: Record<string, string | number | null | undefined>; headers?: Record<string, string> } = {},
  ): Promise<Json> {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.params ?? {})) {
      if (v !== null && v !== undefined) q.set(k, String(v));
    }
    const url = this.baseUrl + path + (q.toString() ? `?${q}` : '');
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.key}`,
      Accept: 'application/json',
      'User-Agent': `faxforagents-mcp/${VERSION}`,
      ...(opts.headers ?? {}),
    };
    let body: string | undefined;
    if (opts.json !== undefined) {
      headers['Content-Type'] = 'application/json';
      const clean = Object.fromEntries(
        Object.entries(opts.json as Json).filter(([, v]) => v !== null && v !== undefined),
      );
      body = JSON.stringify(clean);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    let resp: Response;
    try {
      resp = await this.fetchImpl(url, { method, headers, body, signal: controller.signal });
    } catch (err) {
      clearTimeout(timer);
      const name = (err as { name?: string })?.name ?? 'Error';
      throw new ApiUnreachable(name === 'AbortError' ? 'timeout' : name);
    }
    clearTimeout(timer);
    const text = await resp.text();
    let payload: unknown = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }
    if (resp.status >= 400) {
      const err = ((payload as Json | null)?.error ?? {}) as Json;
      throw new ApiRefusal(
        resp.status,
        String(err.code ?? 'http_error'),
        String(err.message ?? `HTTP ${resp.status}`),
        err.details,
        resp.headers.get('retry-after'),
      );
    }
    return (payload ?? {}) as Json;
  }
}
