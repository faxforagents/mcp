#!/usr/bin/env node
/**
 * stdio entry point of the Fax for Agents MCP server.
 *
 *   claude mcp add faxforagents -e FAXFORAGENTS_API_KEY=ffa_test_... -- npx -y faxforagents-mcp
 *
 * Single-tenant by design: one user, one machine, their own key read from the environment
 * (FAXFORAGENTS_API_KEY, or FFA_API_KEY as the product CLI uses). The hosted server at
 * https://mcp.faxforagents.com/mcp/ serves the same tools over Streamable HTTP with the key per request.
 * The tools live in server.ts so the two cannot drift. Provenance: livetennisapi-mcp src/index.ts.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { VERSION, createServer } from './server.js';

const apiKey = (process.env.FAXFORAGENTS_API_KEY ?? process.env.FFA_API_KEY ?? '').trim();
const baseUrl = (process.env.FAXFORAGENTS_API_URL ?? process.env.FFA_API_URL ?? '').trim() || undefined;

async function main(): Promise<void> {
  const server = createServer({ apiKey, baseUrl });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout is the MCP channel. Anything logged there corrupts the protocol.
  console.error(`faxforagents-mcp ${VERSION} ready${apiKey ? '' : ' (no API key configured)'}`);
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
