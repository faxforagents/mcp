# Fax for Agents on tool.store

Build the local stdio bundle from the repository root with `npm run pack:tool-store`.

The bundle contains all 15 tools.
It requires a Fax for Agents API key from the [dashboard](https://app.faxforagents.com).

## Build

Install the repository dependencies with `npm ci`.
Provide the official `tool` CLI on `PATH`, or set `TOOL_STORE_CLI` to its executable path.
The script also checks `.coding-agent/tmp/tool-store-cli/bin/tool` for a local installation.
On Windows, that executable is `tool.exe`.

The [publishing guide](https://tool.store/docs/publishing-tools) links a shell installer for the CLI.
The linked [CLI repository](https://github.com/superradcompany/tool-cli) also documents Cargo installation.
Neither fetched source names an npm CLI package, checked on 2026-11-04.
Keep any local CLI installation under `.coding-agent/tmp`.
This build used the [official v0.2.0 release](https://github.com/superradcompany/tool-cli/releases/tag/v0.2.0).
Download the archive for your build platform and verify its matching `.sha256` file before extracting the executable.
Place that executable in `.coding-agent/tmp/tool-store-cli/bin`.

Run from the repository root:

```bash
npm run pack:tool-store
```

The script reuses `tsup.mcpb.config.ts` and copies its dependency bundle to `server/index.js`.
A generated `package.json` declares ESM for the extracted server.
Strict tool.store validation requires a `.js` entrypoint and `node_modules`, even when dependencies are already bundled.
The script installs production dependencies from the repository lockfile with lifecycle scripts disabled.
It checks the manifest version, Node requirement and tool declarations against their source files.
Update the manifest when those sources change.

The script runs these commands inside `distribution/tool-store`:

```bash
tool validate --strict
tool pack
```

The expected output is `distribution/tool-store/faxforagents-0.4.3.mcpb`.
Generated files and archives are ignored by Git.
The archive includes production dependencies and their license files.
The tracked `logo.png` is the original 512 by 512 brand image.
The manifest declares Node 20 or later on macOS, Linux and Windows.

## Ben's installation and publishing steps

These are manual steps after local validation and packing succeed.
The build script does not run them.

1. Create or access your [tool.store account](https://tool.store).
2. Generate a publishing token in the account settings.
3. Open `distribution/tool-store` in a terminal with the official CLI on `PATH`.
4. Install the prepared bundle locally and test it with a sandbox API key.
5. Log in with the publishing token and confirm the account.
6. Publish after reviewing the local test results and bundle contents.

Run the B10 commands from the prepared directory:

```bash
tool validate --strict
tool pack
tool install .
tool login
tool whoami
tool publish
```

`FAXFORAGENTS_API_KEY` is required and sensitive in the manifest.
Enter the service API key through the client's configuration prompt.
The publishing token belongs to tool.store and is separate from the Fax for Agents API key.
Local installation and publication remain Ben's steps.

## Hosted OAuth status

2026-11-04: The hosted OAuth-only route is untested on tool.store.
This package bundles the Node stdio implementation and uses an API key.
It does not establish compatibility for a bundle containing only the hosted OAuth URL.

## Format references

The [tool.store manifest reference](https://tool.store/docs/advanced/manifest) describes the MCPB 0.3 fields used here.
The [MCPB specification](https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md) defines the base bundle format.
The [CLI reference](https://tool.store/docs/cli) documents validation, packaging and publishing commands.
These sources were checked on 2026-11-04.
