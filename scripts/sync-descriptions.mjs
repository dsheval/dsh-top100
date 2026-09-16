// Generate shared display formatting only; editorial content stays on the server.
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const root = new URL('../', import.meta.url);
await build({
  entryPoints: [fileURLToPath(new URL('plugin/src/shared/description-rules.ts', root))],
  bundle: true, platform: 'browser', format: 'esm',
  outfile: fileURLToPath(new URL('web/public/description-rules.js', root)),
});

await build({ entryPoints: [fileURLToPath(new URL("plugin/src/shared/install-assessment.ts", root))], bundle: true, platform: "browser", format: "esm", outfile: fileURLToPath(new URL("web/public/install-assessment.js", root)) });
