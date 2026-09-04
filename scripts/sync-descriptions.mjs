// The npm plugin owns the canonical editorial data and presentation rules.
// Regenerate the website assets without requiring a live server or collector.
import { copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const root = new URL('../', import.meta.url);
await copyFile(new URL('plugin/src/shared/reviewed-descriptions.json', root), new URL('web/public/reviewed-descriptions.json', root));
await build({
  entryPoints: [fileURLToPath(new URL('plugin/src/shared/description-rules.ts', root))],
  bundle: true, platform: 'browser', format: 'esm',
  outfile: fileURLToPath(new URL('web/public/description-rules.js', root)),
});
