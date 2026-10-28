// Provenance: livetennisapi-oss/livetennisapi-mcp/tsup.config.ts (2026-10-28).
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'es2022',
  clean: true,
  // No `banner`: esbuild keeps the shebang already at the top of src/index.ts. A second shebang on
  // line 2 is a syntax error, and this package runs as `npx faxforagents-mcp`.
});
