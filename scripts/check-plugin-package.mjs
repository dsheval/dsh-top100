import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function exportTargets(value) {
  if (typeof value === 'string') return [value];
  return value && typeof value === 'object' ? Object.values(value).flatMap(exportTargets) : [];
}

/** Validate the tarball contents, not files left over in the build directory. */
export function validatePluginPackage({ manifest, files, readFile, expectedManifest, sourceFiles }) {
  assert.deepEqual(manifest, expectedManifest, 'Packed package.json differs from the plugin manifest');
  const required = [manifest.main, manifest.types, ...exportTargets(manifest.exports), manifest.dsh?.bundle?.patch];
  assert(required.every(path => typeof path === 'string' && path.length), 'Missing package entry declaration');
  const paths = new Set(files);
  for (const declared of [...required, ...Object.keys(sourceFiles)]) {
    const path = declared.replace(/^\.\//, '');
    assert(!path.startsWith('/') && !path.split('/').includes('..') && !path.includes('*'), `Unsupported package path: ${declared}`);
    assert(paths.has(path), `Missing package file: ${path}`);
    assert(readFile(path).trim().length, `Empty package file: ${path}`);
  }
  for (const [path, source] of Object.entries(sourceFiles)) {
    if (path.endsWith('.json')) assert.deepEqual(JSON.parse(readFile(path)), JSON.parse(source), `Stale package data: ${path}`);
    else assert.equal(readFile(path), source, `Stale package asset: ${path}`);
  }
  const client = readFile('client/client.js');
  assert(client.includes('window.__ModuleLoader__.load') && client.includes(JSON.stringify(manifest.name)),
    'Client bundle must register the plugin with the DSH module loader');
  return { name: manifest.name, version: manifest.version, files: paths.size };
}

function sourceAssets(pluginRoot) {
  const sources = {};
  function walk(relative) {
    for (const entry of readdirSync(join(pluginRoot, relative), { withFileTypes: true })) {
      const path = `${relative}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) sources[path] = readFileSync(join(pluginRoot, path), 'utf8');
    }
  }
  walk('skills');
  assert(Object.keys(sources).some(path => path.endsWith('/SKILL.md')), 'No bundled skill found');
  sources['cordis.patch.yml'] = readFileSync(join(pluginRoot, 'cordis.patch.yml'), 'utf8');
  sources['lib/shared/reviewed-descriptions.json'] = readFileSync(join(pluginRoot, 'src/shared/reviewed-descriptions.json'), 'utf8');
  return sources;
}

export function checkPluginPackage() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const pluginRoot = join(root, 'plugin');
  const expectedManifest = JSON.parse(readFileSync(join(pluginRoot, 'package.json'), 'utf8'));
  const temporary = mkdtempSync(join(tmpdir(), 'dsh-top100-pack-'));
  try {
    // npm pack runs the real prepack build, but does not publish or install anything.
    // Force scripts on even if the caller configured npm to ignore lifecycle scripts.
    const output = execFileSync('npm', ['pack', '--workspace', expectedManifest.name, '--json',
      '--ignore-scripts=false', '--foreground-scripts=false', '--pack-destination', temporary],
    { cwd: root, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] });
    const packs = JSON.parse(output);
    assert.equal(packs.length, 1, 'Expected exactly one plugin tarball');
    assert.equal(packs[0].filename, `${expectedManifest.name.replace('@', '').replace('/', '-')}-${expectedManifest.version}.tgz`);
    const archive = join(temporary, packs[0].filename);
    const entries = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).trim().split('\n');
    assert(entries.every(path => path.startsWith('package/')), 'Unexpected archive root');
    const files = entries.filter(path => !path.endsWith('/')).map(path => path.slice('package/'.length));
    const cache = new Map();
    const readFile = path => {
      assert(files.includes(path), `Missing package file: ${path}`);
      if (!cache.has(path)) cache.set(path, execFileSync('tar', ['-xOzf', archive, `package/${path}`], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }));
      return cache.get(path);
    };
    const result = validatePluginPackage({ manifest: JSON.parse(readFile('package.json')), files, readFile,
      expectedManifest, sourceFiles: sourceAssets(pluginRoot) });
    console.log(`Plugin package verified: ${result.name}@${result.version}, ${result.files} files; entries, client, patch, skills and reviewed descriptions present.`);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) checkPluginPackage();
