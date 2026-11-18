#!/usr/bin/env node
/**
 * The API base URL and the dashboard URL lose their trailing slashes through `trimTrailingSlashes` of
 * src/api.ts, a scan from the end. The regex `/\/+$/` it replaces took about 16 s on 100,000 slashes followed
 * by another character (CodeQL js/polynomial-redos, faxforagents/sdk-typescript PR 25). The modules are
 * bundled in memory with esbuild and imported from a data URL, so nothing is written to disk.
 */
import { build } from 'esbuild';

const load = async (entry) => {
  const bundle = await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' });
  return import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
};
const { trimTrailingSlashes } = await load('src/api.ts');
const { faxOut } = await load('src/server.ts');

const failures = [];
const same = (got, want, label) => { if (got !== want) failures.push(`${label}: got ${JSON.stringify(got).slice(0, 80)}, want ${JSON.stringify(want).slice(0, 80)}`); };

// It drops the trailing slashes and nothing else.
same(trimTrailingSlashes('https://api.example.test///'), 'https://api.example.test', 'three trailing slashes');
same(trimTrailingSlashes('https://api.example.test/v1/'), 'https://api.example.test/v1', 'a path with one trailing slash');
same(trimTrailingSlashes('https://api.example.test'), 'https://api.example.test', 'no trailing slash');
same(trimTrailingSlashes('///'), '', 'only slashes');
const fax = { id: 'fax_' + '1'.repeat(32), state: 'delivered' };
same(faxOut(fax, 'https://app.example.test//').receipt_url, `https://app.example.test/app/faxes/${fax.id}#receipt`, 'receipt_url under a dashboard URL with trailing slashes');

// It takes linear time on a long run of slashes that does not end the string.
const long = `https://api.example.test${'/'.repeat(100_000)}x`;
const started = performance.now();
same(trimTrailingSlashes(long), long, '100,000 slashes, then a character');
same(trimTrailingSlashes(`${long}${'/'.repeat(100_000)}`), long, 'the same with 100,000 trailing slashes');
const took = performance.now() - started;
if (took >= 1_000) failures.push(`the long inputs took ${Math.round(took)} ms, over a second`);

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`base-url OK: trailing slashes trimmed, 200,000 slashes in ${Math.round(took)} ms`);
