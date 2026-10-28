// Build for the MCPB bundle only, not for npm. Provenance: livetennisapi-oss/livetennisapi-mcp/tsup.mcpb.config.ts (2026-10-28).
//
// An MCPB bundle has no install step: the host unzips it and runs the entry point, so every dependency
// has to be inside the archive. Bundling everything into one tree-shaken file keeps it small and
// auditable. The npm build (tsup.config.ts) leaves dependencies external as usual.
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'es2022',
  outDir: 'dist-mcpb',
  clean: true,
  noExternal: [/.*/],
  treeshake: true,
  minify: false,
});
