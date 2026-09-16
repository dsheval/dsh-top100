/** Conservative, offline comparison. No repository code is executed. */
import { createHash } from 'node:crypto';
import ts from 'typescript';
import type { DiscoveryEvidence } from '@dsh-top100/schema';
import { reviewedFunctionEvidence, verifyReviewedFunctionEvidence, functionEvidenceFingerprint,
  FUNCTION_EVIDENCE_MARKER_PREFIX, type FunctionEvidenceCheck, type ReviewedFunctionEvidence } from './reviewed-evidence.js';

export type SourceChangeReview = NonNullable<DiscoveryEvidence['functionReview']>;
export type AutomaticFunctionCheck = FunctionEvidenceCheck & { sourceReview?: SourceChangeReview };
const sha = (text: string) => createHash('sha256').update(text).digest('hex');

/** Bounded triage hints, not an assertion that imported code is understood. */
export function sourceChangeSignals(path: string, before: string, after: string): NonNullable<SourceChangeReview['files'][number]['signals']> {
  const signals: NonNullable<SourceChangeReview['files'][number]['signals']> = ['source-change-needs-review'];
  if (Math.max(Buffer.byteLength(before), Buffer.byteLength(after)) > 128_000 || !/\.(?:[cm]?[jt]s|[jt]sx)$/.test(path)) return signals;
  const facts = (text: string) => {
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    const printer = ts.createPrinter({ removeComments: true });
    const print = (node: ts.Node) => printer.printNode(ts.EmitHint.Unspecified, node, source);
    const imports: string[] = [], environment: string[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isImportDeclaration(node)) imports.push(print(node));
      if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
        && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment && /^process\.env(?:\.|\[)/.test(print(node.left))) environment.push(print(node));
      ts.forEachChild(node, visit);
    };
    visit(source); return { imports: JSON.stringify(imports), environment: JSON.stringify(environment) };
  };
  const old = facts(before), current = facts(after);
  if (old.imports !== current.imports) signals.push('imports-changed');
  if (old.environment !== current.environment) signals.push('environment-writes-changed');
  return signals;
}

/** Printer retains AST structure (including ASI), literals, JSX whitespace and
 * template contents. We never strip whitespace from its output. Directive and
 * JSDoc comments are deliberately outside this narrow automatic allowance. */
export function syntaxEquivalent(path: string, before: string, after: string): boolean {
  if (before === after) return true;
  if (Buffer.byteLength(before) > 128_000 || Buffer.byteLength(after) > 128_000
    || !/\.(?:[cm]?[jt]s|[jt]sx)$/.test(path)) return false;
  const canonical = (text: string) => {
    // Keep all directive-like comments verbatim, rather than guessing which
    // build tools interpret them. The scanner here only rejects conservatively.
    const comments = text.match(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g) ?? [];
    if (comments.some(comment => /^\/\*\*|^\/\/\/|@|#|webpack|vite|istanbul|eslint|prettier|sourceURL|sourceMappingURL/i.test(comment))) return null;
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    if ((source as ts.SourceFile & { parseDiagnostics: readonly unknown[] }).parseDiagnostics.length) return null;
    return ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed }).printFile(source);
  };
  const left = canonical(before), right = canonical(after);
  return left !== null && right !== null && left === right;
}

export async function reviewFunctionChanges(fullName: string,
  identity: { packageName?: string | null; repositoryPath?: string | null },
  readCurrent: (path: string) => Promise<string | null>,
  readBaseline: (path: string, commit: string) => Promise<string | null>,
  review: ReviewedFunctionEvidence | undefined = reviewedFunctionEvidence[fullName.toLowerCase()],
): Promise<AutomaticFunctionCheck> {
  const current = new Map<string, string | null>();
  const check = await verifyReviewedFunctionEvidence(review, identity, async path => {
    const text = await readCurrent(path); current.set(path, text); return text;
  });
  if (check.status !== 'changed' || !review) return check;
  const allPresent = review.files.every(file => typeof current.get(file.path) === 'string');
  const fingerprint = allPresent ? functionEvidenceFingerprint(review,
    review.files.map(file => ({ path: file.path, sha256: sha(current.get(file.path)!) }))) : null;
  const files: SourceChangeReview['files'] = [];
  // Only changed files need an extra read; the trusted baseline SHA must match.
  for (const file of review.files) {
    const text = current.get(file.path);
    if (typeof text === 'string' && sha(text) === file.sha256) continue;
    let outcome: SourceChangeReview['files'][number]['outcome'] = text === null ? 'missing' : 'unavailable';
    let signals: SourceChangeReview['files'][number]['signals'];
    if (typeof text === 'string') {
      let baseline: string | null = null;
      try { baseline = await readBaseline(file.path, review.sourceCommit); } catch { /* hold; never leak provider errors */ }
      outcome = baseline === null || sha(baseline) !== file.sha256 ? 'baseline-unverified'
        : syntaxEquivalent(file.path, baseline, text) ? 'equivalent' : 'changed';
      if (outcome === 'changed' && baseline !== null) signals = sourceChangeSignals(file.path, baseline, text);
    }
    files.push({ path: file.path, beforeSha256: file.sha256,
      afterSha256: typeof text === 'string' ? sha(text) : null, outcome, ...(signals ? { signals } : {}) });
  }
  const equivalent = allPresent && files.length > 0 && files.every(file => file.outcome === 'equivalent');
  const sourceReview: SourceChangeReview = { policy: 'syntax-equivalence-v1', decision: equivalent ? 'equivalent' : 'held',
    baselineCommit: review.sourceCommit, expectedFingerprint: review.expectedFingerprint, currentFingerprint: fingerprint, files };
  if (!equivalent) return { ...check, sourceReview };
  // The marker still refers to the immutable reviewed baseline, not a newly
  // approved semantic revision. Store the actual current fingerprint separately.
  return { ...check, status: 'matched', fingerprint,
    marker: FUNCTION_EVIDENCE_MARKER_PREFIX + review.expectedFingerprint,
    reason: 'Scoped files match the approved baseline after syntax-preserving formatting/comment changes.', sourceReview };
}
