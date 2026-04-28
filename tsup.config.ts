import { defineConfig } from 'tsup';
import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'path';

dotenvConfig({ path: resolve(process.cwd(), '.env') });

export default defineConfig({
  entry: ['src/cli.ts', 'src/postinstall.ts'],
  format: ['esm'],
  target: 'node18',
  outDir: 'dist',
  clean: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
  define: {
    'process.env.WL_DOCS_URL': JSON.stringify(process.env.WL_DOCS_URL ?? ''),
  },
});
