/** Static source fallback: parse data only, never import/evaluate repository code. */
import { createHash } from 'node:crypto';
import ts from 'typescript';
import type { DshPlugin, DiscoveryEvidence } from '@dsh-top100/schema';
import { fetchRawFile } from './github.js';
import { reviewedFunctionEvidence } from './reviewed-evidence.js';

const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const safePath = (value: string) => /^[\w.@/-]+$/.test(value) && !value.startsWith('/') && !value.split('/').some(x => !x || x === '.' || x === '..');
export function hasPackageSourceFacts(source: { fullName?: string; id?: string; name?: string; readmeSummary?: string | null;
  install?: { packageName?: string; repositoryPath?: string; discovery?: Partial<DiscoveryEvidence> } | null }): boolean {
  const proof = source.install?.discovery?.sourceFiles;
  return !!proof && proof.kind === 'static-package-facts-v1'
    && proof.fullName === (source.fullName ?? source.id ?? source.name ?? '').toLowerCase()
    && proof.packageName === source.install?.packageName && proof.repositoryPath === (source.install?.repositoryPath ?? '')
    && proof.sourceRevision === source.install?.discovery?.sourceRevision && /^[a-f0-9]{40}$/.test(proof.sourceRevision)
    && proof.summarySha256 === sha(source.readmeSummary ?? '') && proof.files.length >= 2 && proof.files.length <= 3
    && proof.files.every(file => safePath(file.path) && (!proof.repositoryPath || file.path.startsWith(proof.repositoryPath + '/')) && /^[a-f0-9]{64}$/.test(file.sha256));
}
/** Facts are deliberately syntactic. They do not claim security, runtime success or imported helpers' behavior. */
export function staticEntryFacts(text: string): string[] {
  if (Buffer.byteLength(text) > 24_000) return [];
  const source = ts.createSourceFile('entry.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if ((source as ts.SourceFile & { parseDiagnostics: readonly unknown[] }).parseDiagnostics.length) return [];
  const printer = ts.createPrinter({ removeComments: true });
  const compact = (node: ts.Node) => printer.printNode(ts.EmitHint.Unspecified, node, source).replace(/\s+/g, ' ').trim();
  const hooks: string[] = [], toolRules: string[] = [], config: string[] = [], conditions: string[] = [];
  let exportedApply = false;
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'apply' && node.modifiers?.some(x => x.kind === ts.SyntaxKind.ExportKeyword)) exportedApply = true;
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && ['on', 'before', 'tool', 'command', 'provide'].includes(node.expression.name.text)
      && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      const owner = compact(node.expression.expression);
      if (/^(?:ctx|\(ctx as [\w.]+\))$/.test(owner)) hooks.push(`${node.expression.name.text}(${JSON.stringify(node.arguments[0].text)})`);
    }
    if (ts.isPropertyAssignment(node) && node.name.getText(source) === 'tools' && node.initializer.getText(source).includes('.filter(')) toolRules.push(compact(node));
    if (ts.isVariableDeclaration(node) && node.initializer && /\b(?:config\.|shellTools|commonTools|selectedShells|bootstrap)\b/.test(node.initializer.getText(source))) config.push(compact(node));
    if (ts.isIfStatement(node) && /(?:isPromoted|delegationDepth|promoted\.has)/.test(node.expression.getText(source))) conditions.push(compact(node));
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (!exportedApply || !hooks.length) return [];
  // No prose comments, dependency descriptions or root product claims become evidence.
  return [...new Set([...hooks.map(x => `registration: ${x}`), ...toolRules, ...config, ...conditions])];
}
export async function readPackageSourceFacts(source: DshPlugin, revision: string,
  read = (path: string) => fetchRawFile(source.fullName, path, revision)) {
  // Fixed source reviews remain opt-in and immutable; generic fallback cannot unlock them.
  if (reviewedFunctionEvidence[source.fullName.toLowerCase()]) return null;
  const directory = source.install.repositoryPath ?? '';
  if (directory && !safePath(directory)) return null;
  const file = (name: string) => directory ? `${directory}/${name}` : name;
  const manifest = await read(file('package.json'));
  if (!manifest || Buffer.byteLength(manifest) > 16_000) return null;
  let pkg: any; try { pkg = JSON.parse(manifest); } catch { return null; }
  if (pkg.name !== source.install.packageName) return null;
  // A conventional source entry only. No unbounded graph walking or arbitrary manifest URLs.
  const text = await read(file('src/index.ts'));
  if (!text) return null;
  const facts = staticEntryFacts(text);
  if (!facts.length) return null;
  const prefix = `Selected package ${pkg.name}; static source facts only (not a runtime verification). `;
  const selected: string[] = [];
  for (const fact of facts) if ((prefix + [...selected, fact].join('; ')).length <= 1150) selected.push(fact);
  if (selected.length < 2) return null;
  const summary = prefix + selected.join('; ');
  const proof: NonNullable<DiscoveryEvidence['sourceFiles']> = {
    kind: 'static-package-facts-v1', fullName: source.fullName.toLowerCase(), packageName: pkg.name,
    repositoryPath: directory, sourceRevision: revision, summarySha256: sha(summary),
    files: [{ path: file('package.json'), sha256: sha(manifest) }, { path: file('src/index.ts'), sha256: sha(text) }],
  };
  return { summary, proof };
}
