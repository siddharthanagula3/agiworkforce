import { getSupportCorpus } from '@/lib/support/agent/corpus';
import { docMetadataFor, type DocMetadata } from '@/lib/support/doc-metadata';

export interface DocIndexEntry {
  docId: string;
  title: string;
  href: string;
  updated: string;
  metadata: DocMetadata | null;
}

export interface DocIndexGroup {
  id: string;
  label: string;
  entries: readonly DocIndexEntry[];
}

export interface DocumentationIndex {
  groups: readonly DocIndexGroup[];
  documentCount: number;
  newestUpdate: string | null;
}

function label(categoryId: string): string {
  const spaced = categoryId.replace(/-/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function documentationIndex(): DocumentationIndex {
  const corpus = getSupportCorpus();
  if (!corpus.available) return { groups: [], documentCount: 0, newestUpdate: null };

  const byCategory = new Map<string, Map<string, DocIndexEntry>>();
  for (const chunk of corpus.chunks) {
    if (chunk.origin !== 'markdown') continue;
    const entries = byCategory.get(chunk.category) ?? new Map<string, DocIndexEntry>();
    byCategory.set(chunk.category, entries);
    if (entries.has(chunk.docId)) continue;
    entries.set(chunk.docId, {
      docId: chunk.docId,
      title: chunk.docTitle,
      href: chunk.path,
      updated: chunk.updated,
      metadata: docMetadataFor(chunk.docId),
    });
  }

  const groups = [...byCategory.entries()]
    .map(([id, entries]) => ({
      id,
      label: label(id),
      entries: [...entries.values()].sort((a, b) => a.title.localeCompare(b.title)),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const documentCount = groups.reduce((total, group) => total + group.entries.length, 0);
  const newestUpdate = groups
    .flatMap((group) => group.entries.map((entry) => entry.updated))
    .sort()
    .at(-1);

  return { groups, documentCount, newestUpdate: newestUpdate ?? null };
}
