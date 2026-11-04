import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bundle = join(root, 'distribution/tool-store');
const readJson = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'));
const pkg = readJson('package.json');
const manifest = readJson('distribution/tool-store/manifest.json');
const tools = Object.values(readJson('src/tool-definitions.json').tools).map(({ name, description }) => ({ name, description }));

assert.equal(manifest.version, pkg.version, 'Update the tool.store manifest version to match package.json.');
assert.deepEqual(manifest.tools, tools, 'Update the tool.store declarations from src/tool-definitions.json.');
assert.equal(manifest.compatibility.runtimes.node, pkg.engines.node, 'Update the tool.store Node requirement.');
assert.equal(manifest.server.entry_point, 'server/index.js');

function run(command, args, cwd, env = process.env) {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit' });
  if (result.error) {
    throw new Error(`Cannot run ${command}: ${result.error.message}. See distribution/tool-store/README.md.`);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// Use the same dependency bundle as Claude Desktop.
run(process.execPath, [join(root, 'node_modules/tsup/dist/cli-default.js'), '--config', 'tsup.mcpb.config.ts'], root);
rmSync(join(bundle, 'server'), { recursive: true, force: true });
mkdirSync(join(bundle, 'server'), { recursive: true });
copyFileSync(join(root, 'dist-mcpb/index.js'), join(bundle, 'server/index.js'));
copyFileSync(join(root, 'LICENSE'), join(bundle, 'LICENSE'));
writeFileSync(join(bundle, 'package.json'), JSON.stringify({
  name: pkg.name,
  version: pkg.version,
  private: true,
  type: 'module',
  engines: pkg.engines,
  dependencies: pkg.dependencies,
}, null, 2) + '\n');
copyFileSync(join(root, 'package-lock.json'), join(bundle, 'package-lock.json'));
// Strict tool.store validation requires node_modules even for a self-contained bundle.
assert.ok(process.env.npm_execpath, 'Run this script with npm run pack:tool-store.');
run(process.execPath, [process.env.npm_execpath, 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], bundle, {
  ...process.env,
  npm_config_cache: join(root, '.coding-agent/tmp/npm-cache'),
});
writeFileSync(join(bundle, '.mcpbignore'), [
  '*',
  '!manifest.json',
  '!logo.png',
  '!README.md',
  '!LICENSE',
  '!package.json',
  '!server/',
  'server/*',
  '!server/index.js',
  '!node_modules/',
  '!node_modules/**',
  'node_modules/.package-lock.json',
  '',
].join('\n'));

const scratchCli = join(root, '.coding-agent/tmp/tool-store-cli/bin', process.platform === 'win32' ? 'tool.exe' : 'tool');
const cli = process.env.TOOL_STORE_CLI || (existsSync(scratchCli) ? scratchCli : 'tool');
// Remove the previous archive so a failed run cannot leave a stale release.
rmSync(join(bundle, `${manifest.name}-${manifest.version}.mcpb`), { force: true });
run(cli, ['validate', '--strict'], bundle);
run(cli, ['pack'], bundle);
