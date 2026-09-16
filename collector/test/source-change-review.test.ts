import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { reviewFunctionChanges, syntaxEquivalent, sourceChangeSignals } from '../src/source-change-review.js';
import { functionEvidenceFingerprint, type ReviewedFunctionEvidence } from '../src/reviewed-evidence.js';
import { applyFunctionEvidenceCheck } from '../src/reviewed-evidence-state.js';
import type { DshPlugin } from '@dsh-top100/schema';
const identity = { packageName: '@test/widget', repositoryPath: 'packages/widget' };
const originals = { 'packages/widget/index.ts': 'export const action = "read";\n',
  'packages/widget/package.json': '{"name":"@test/widget"}' };
const files = Object.entries(originals).map(([path, text]) => ({ path, sha256: createHash('sha256').update(text).digest('hex') }));
const review: ReviewedFunctionEvidence = { ...identity, sourceCommit: 'a'.repeat(40), files, expectedFingerprint: functionEvidenceFingerprint(identity, files) };
const read = async (path: string) => originals[path as keyof typeof originals] ?? null;
const checked = (text: string | null, baseline = read) => reviewFunctionChanges('test/widget', identity,
  path => path.endsWith('index.ts') ? Promise.resolve(text) : read(path), baseline, review);

describe('automatic scoped source review', () => {
  it('allows ordinary comments/formatting only after validating the immutable baseline hash', async () => {
    const baseline = vi.fn(read);
    const result = await checked('// explanation\nexport   const action = "read";\n', baseline);
    expect(result.status).toBe('matched'); expect(result.marker).toBe('reviewed-function-sha256:' + review.expectedFingerprint);
    expect(result.fingerprint).not.toBe(review.expectedFingerprint);
    expect(result.sourceReview).toMatchObject({ decision: 'equivalent', currentFingerprint: result.fingerprint });
    expect(baseline.mock.calls).toEqual([['packages/widget/index.ts', review.sourceCommit]]);
    const source = { ...identity, fullName: 'test/widget', type: 'cordis-plugin', topics: [],
      install: { ...identity, discovery: { evidence: [], status: 'verified' } } } as unknown as DshPlugin;
    expect(applyFunctionEvidenceCheck(source, undefined, result).install.discovery?.functionReview).toEqual(result.sourceReview);
    expect(review.expectedFingerprint).toBe(functionEvidenceFingerprint(identity, files));
  });
  it('does not need a baseline read when exact hashes already match', async () => {
    const baseline = vi.fn(read); expect((await checked(originals['packages/widget/index.ts'], baseline)).status).toBe('matched');
    expect(baseline).not.toHaveBeenCalled();
  });
  it('holds real behavior changes and records a review candidate, never minting a marker', async () => {
    const result = await checked('export const action = "write";\n');
    expect(result).toMatchObject({ status: 'changed', marker: null, sourceReview: { decision: 'held', files: [
      { path: 'packages/widget/index.ts', outcome: 'changed' },
    ] } });
  });
  it('does not approve missing files, unavailable reads or an untrusted baseline', async () => {
    expect((await checked(null)).sourceReview?.files[0].outcome).toBe('missing');
    expect((await checked('// comment\n' + originals['packages/widget/index.ts'], async () => 'wrong baseline')).status).toBe('changed');
    const result = await reviewFunctionChanges('test/widget', identity, async path => {
      if (path.endsWith('package.json')) throw new Error('private network detail');
      return '// comment\n' + originals['packages/widget/index.ts'];
    }, read, review);
    expect(result.status).toBe('changed'); expect(result.sourceReview?.currentFingerprint).toBeNull();
    expect(result.sourceReview?.files.map(file => file.outcome)).toEqual(['equivalent', 'unavailable']);
    expect(JSON.stringify(result)).not.toContain('private network detail');
  });
  it.each([
    ['index.ts', 'function f(){return 1;}', 'function f(){return\n1;}'],
    ['index.ts', 'export const x="a b";', 'export const x="ab";'],
    ['index.ts', 'export const x=`a b`;', 'export const x=`a  b`;'],
    ['index.tsx', 'export const x=<div>a b</div>;', 'export const x=<div>ab</div>;'],
    ['index.ts', 'export const x=1;', '/*\n @__PURE__\n*/export const x=1;'],
    ['index.ts', 'export const x=1;', '// @ts-nocheck\nexport const x=1;'],
    ['index.ts', 'export const x=1;', '/** documentation */export const x=1;'],
    ['index.ts', 'export const x=1;', 'export const x=;'],
    ['package.json', '{"a":1}', '{ "a":1}'],
    ['index.ts', 'import "a";export const x=1;', 'import "b";export const x=1;'],
  ])('holds semantic, directive, unsupported or invalid changes: %s', (path, before, after) => {
    expect(syntaxEquivalent(path, before, after)).toBe(false);
  });
  it('checks selected package identity before any reads', async () => {
    const current = vi.fn(read), baseline = vi.fn(read);
    const result = await reviewFunctionChanges('test/widget', { ...identity, packageName: 'other' }, current, baseline, review);
    expect(result.status).toBe('identity-mismatch'); expect(current).not.toHaveBeenCalled(); expect(baseline).not.toHaveBeenCalled();
  });
  it('prepares concrete triage signals for import and process environment changes without executing them', () => {
    expect(sourceChangeSignals('index.ts', 'export const x=1;', 'import { cli } from "./connector"; process.env.PATH = cli.path; export const x=1;'))
      .toEqual(['source-change-needs-review', 'imports-changed', 'environment-writes-changed']);
  });
});
