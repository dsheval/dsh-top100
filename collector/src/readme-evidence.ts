/** Bind a summary to the exact selected document, independently of its prose. */
import { createHash } from 'node:crypto';
import type { InstallInfo } from '@dsh-top100/schema';

type Source = { fullName?: string; id?: string; name?: string; readmeSummary?: string | null; install?: Partial<InstallInfo> | null };
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
export function selectedReadmeEvidence(fullName: string, packageName: string | null | undefined,
  repositoryPath: string | null | undefined, sourceRevision: string, document: string, summary: string) {
  return { fullName: fullName.toLowerCase(), packageName: packageName ?? null,
    path: repositoryPath ? `${repositoryPath}/README.md` : 'README.md', sourceRevision,
    documentSha256: sha256(document), summarySha256: sha256(summary) };
}
export function hasSelectedReadmeEvidence(source: Source): boolean {
  const proof = source.install?.discovery?.readme;
  return !!proof && proof.fullName === (source.fullName ?? source.id ?? source.name ?? '').toLowerCase()
    && proof.packageName === (source.install?.packageName ?? null)
    && proof.path === (source.install?.repositoryPath ? `${source.install.repositoryPath}/README.md` : 'README.md')
    && !!proof.sourceRevision && proof.sourceRevision === source.install?.discovery?.sourceRevision
    && /^[a-f0-9]{64}$/.test(proof.documentSha256)
    && proof.summarySha256 === sha256(source.readmeSummary ?? '');
}
