/** Selected Skill identity and functional summary; no network or model operations. */
import { createHash } from 'node:crypto';
import { load, JSON_SCHEMA } from 'js-yaml';
import type { DshPlugin, InstallInfo } from '@dsh-top100/schema';
type ContentSource = { type?: string; fullName?: string; id?: string; readmeSummary?: string | null; install?: Partial<InstallInfo> | null };
export const skillHash = (value: string) => createHash('sha256').update(value).digest('hex');
const hash = skillHash;
export function hasSkillSourceEvidence(source: ContentSource): boolean {
  const proof = source.install?.discovery?.skill;
  return source.type === 'skill' && !source.install?.repositoryPath && !source.install?.packageName
    && source.install?.discovery?.status === 'verified' && proof?.policy === 'selected-skill-v1'
    && proof.fullName === (source.fullName ?? source.id ?? '').toLowerCase() && validSkillPath(proof.path)
    && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(proof.name) && proof.name.length <= 64
    && /^[a-f0-9]{40}$/.test(proof.sourceRevision) && proof.sourceRevision === source.install.discovery.sourceRevision
    && /^[a-f0-9]{64}$/.test(proof.documentSha256) && proof.summarySha256 === hash(source.readmeSummary ?? '')
    && (source.readmeSummary ?? '').startsWith(`SKILL.md (${proof.name}): `);
}
export const validSkillPath = (path: string) => path.length <= 400 && !path.startsWith('/') && !/[\\?#%\u0000-\u001f]/.test(path)
  && !path.split('/').some(part => !part || part === '.' || part === '..') && /(?:^|\/)SKILL\.md$/.test(path);

export function skillDocument(document: string): { name: string; summary: string } | null {
  if (Buffer.byteLength(document) > 100_000) return null;
  const header = document.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!header || header[1].length > 8000) return null;
  try {
    const meta = load(header[1], { schema: JSON_SCHEMA }) as { name?: unknown; description?: unknown } | null;
    const name = typeof meta?.name === 'string' ? meta.name.trim() : '';
    const description = typeof meta?.description === 'string' ? meta.description.replace(/\s+/g, ' ').trim() : '';
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 64 || description.length > 1800
      || (description.replace(/https?:\/\/\S+/g, '').match(/\p{L}/gu)?.length ?? 0) < 24
      || /^(?:install|installation|setup|安装|配置)(?:\s|:|：)/i.test(description)) return null;
    return { name, summary: `SKILL.md (${name}): ${description}` };
  } catch { return null; }
}

/** Existing collector summaries flatten frontmatter. Require its explicit name field. */
export function currentSkillName(source: ContentSource): string | null {
  const proof = source.install?.discovery?.skill;
  if (proof?.policy === 'selected-skill-v1' && validSkillPath(proof.path)) return proof.name;
  const text = source.readmeSummary ?? '';
  return text.match(/^SKILL\.md:\s*(?:---\s*)?name:\s*["']?([a-z0-9]+(?:-[a-z0-9]+)*)["']?(?=\s|$)/)?.[1] ?? null;
}

/** Reuse the pinned Skill document only when its full bytes match the checked baseline. */
export function restoreKnownSkillSource(source: DshPlugin, previous: DshPlugin, path: string, document: string): boolean {
  const proof = previous.install.discovery?.skill;
  if (!hasSkillSourceEvidence(previous) || source.type !== 'skill' || source.install.packageName || source.install.repositoryPath
    || !proof || path !== proof.path) return false;
  if (hash(document) !== proof.documentSha256) {
    source.install.discovery = { ...source.install.discovery!, skill: { ...proof }, status: 'review-required' };
    return false;
  }
  source.readmeSummary = previous.readmeSummary;
  source.install.discovery = { ...source.install.discovery!, status: 'verified', kind: 'skill',
    sourceRevision: proof.sourceRevision, skill: { ...proof }, checkedAt: previous.install.discovery!.checkedAt };
  return true;
}

