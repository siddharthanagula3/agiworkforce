/**
 * The Library domain, once.
 *
 * `apps/web/features/library` was the only place that knew a Library entry is a
 * file's newest version plus the file it came from, so desktop and mobile had
 * lists of files and no way to show either fact. Nothing here renders; it is
 * the grouping and the lineage walk, which is all three surfaces needed.
 */

import {
  canReadFileReference,
  documentClassFor,
  latestFileVersion,
  sortFileVersions,
  type FileOwnerScope,
  type ManagedFile,
} from '@agiworkforce/types';

export interface LibraryEntry {
  /** The newest revision. The older ones are in `versions`, newest first. */
  file: ManagedFile;
  versions: ManagedFile[];
  /** The id of the file these bytes were derived from, for the "derived from" link. */
  derivedFromFileId: string | null;
}

/** Every revision of one file, oldest reachable ancestor last. */
export function fileVersionChain(files: readonly ManagedFile[], id: string): ManagedFile[] {
  const byId = new Map(files.map((file) => [file.id, file]));
  const chain: ManagedFile[] = [];
  const seen = new Set<string>();
  let cursor = byId.get(id) ?? null;
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    chain.push(cursor);
    cursor = cursor.parentVersionId ? (byId.get(cursor.parentVersionId) ?? null) : null;
  }
  return chain;
}

function isSupersededVersion(files: readonly ManagedFile[]): ReadonlySet<string> {
  const superseded = new Set<string>();
  for (const file of files) {
    if (file.parentVersionId) superseded.add(file.parentVersionId);
  }
  return superseded;
}

/**
 * One entry per file, not one per revision. A list that shows every revision as
 * its own row is what made "my files" unreadable after three edits.
 */
export function buildLibraryEntries(files: readonly ManagedFile[]): LibraryEntry[] {
  const superseded = isSupersededVersion(files);
  const entries: LibraryEntry[] = [];
  for (const file of files) {
    if (superseded.has(file.id)) continue;
    entries.push({
      file,
      versions: sortFileVersions(fileVersionChain(files, file.id)),
      derivedFromFileId: file.lineage.derivedFromFileId,
    });
  }
  return entries;
}

export interface FileLineageNode {
  file: ManagedFile;
  /** Steps from the original: 0 is the source the chain starts at. */
  depth: number;
}

/**
 * Source to edits to exports, in that order.
 *
 * Walks up `derivedFromFileId` to the original the given file descends from,
 * then back down through everything derived from it. A file that was never
 * derived from anything and produced nothing is a chain of one.
 */
export function fileLineageGraph(files: readonly ManagedFile[], id: string): FileLineageNode[] {
  const byId = new Map(files.map((file) => [file.id, file]));
  const start = byId.get(id);
  if (!start) return [];

  let root = start;
  const climbed = new Set<string>([root.id]);
  while (root.lineage.derivedFromFileId) {
    const parent = byId.get(root.lineage.derivedFromFileId);
    if (!parent || climbed.has(parent.id)) break;
    climbed.add(parent.id);
    root = parent;
  }

  const childrenOf = new Map<string, ManagedFile[]>();
  for (const file of files) {
    const parentId = file.lineage.derivedFromFileId;
    if (!parentId) continue;
    const bucket = childrenOf.get(parentId);
    if (bucket) bucket.push(file);
    else childrenOf.set(parentId, [file]);
  }

  const nodes: FileLineageNode[] = [];
  const visited = new Set<string>();
  const queue: FileLineageNode[] = [{ file: root, depth: 0 }];
  while (queue.length > 0) {
    const node = queue.shift()!;
    if (visited.has(node.file.id)) continue;
    visited.add(node.file.id);
    nodes.push(node);
    for (const child of childrenOf.get(node.file.id) ?? []) {
      queue.push({ file: child, depth: node.depth + 1 });
    }
  }
  return nodes;
}

/** The file a Library row links back to, or null when it is an original. */
export function derivedFromFile(
  files: readonly ManagedFile[],
  file: ManagedFile,
): ManagedFile | null {
  const parentId = file.lineage.derivedFromFileId;
  if (!parentId) return null;
  const versions = files.filter(
    (candidate) => candidate.id === parentId || candidate.parentVersionId === parentId,
  );
  return versions.find((candidate) => candidate.id === parentId) ?? latestFileVersion(versions);
}

/**
 * A page of Library rows for one reader. Keyset, not offset: the Library is
 * written to while it is read, and offsets repeat a row the moment it is.
 */
export interface LibraryPageQuery {
  reader: Partial<FileOwnerScope>;
  documentClassIds?: readonly string[];
  search?: string;
  cursor?: string | null;
  limit?: number;
}

export interface LibraryPage {
  entries: LibraryEntry[];
  nextCursor: string | null;
  hasMore: boolean;
}

export const LIBRARY_PAGE_SIZE = 24;
export const LIBRARY_MAX_PAGE_SIZE = 100;

export function libraryEntryCursor(entry: LibraryEntry): string {
  return `${entry.file.createdAt ?? ''}|${entry.file.id}`;
}

function matchesSearch(file: ManagedFile, search: string): boolean {
  return file.name.toLowerCase().includes(search);
}

/**
 * Only the reader's own rows. The filter is the reference's owner scope, so a
 * file that lost its tenant is invisible rather than visible to everybody.
 */
export function readableByOwner(
  files: readonly ManagedFile[],
  reader: Partial<FileOwnerScope>,
): ManagedFile[] {
  return files.filter((file) => canReadFileReference(file, reader));
}

export function listLibraryPage(
  files: readonly ManagedFile[],
  query: LibraryPageQuery,
): LibraryPage {
  const limit = Math.min(
    Math.max(1, Math.trunc(query.limit ?? LIBRARY_PAGE_SIZE)),
    LIBRARY_MAX_PAGE_SIZE,
  );
  const search = query.search?.trim().toLowerCase() ?? '';
  const classes = query.documentClassIds ? new Set(query.documentClassIds) : null;

  const visible = readableByOwner(files, query.reader);
  const entries = buildLibraryEntries(visible)
    .filter((entry) => search.length === 0 || matchesSearch(entry.file, search))
    .filter((entry) => {
      if (!classes) return true;
      const documentClass = documentClassFor(entry.file.name, entry.file.mediaType);
      return documentClass !== null && classes.has(documentClass.id);
    })
    .sort((left, right) => libraryEntryCursor(right).localeCompare(libraryEntryCursor(left)));

  const after = query.cursor ?? null;
  const page = (
    after === null ? entries : entries.filter((e) => libraryEntryCursor(e) < after)
  ).slice(0, limit + 1);
  const hasMore = page.length > limit;
  const rows = hasMore ? page.slice(0, limit) : page;
  const last = rows[rows.length - 1];
  return { entries: rows, nextCursor: hasMore && last ? libraryEntryCursor(last) : null, hasMore };
}

/**
 * The rows a delete may touch. A destructive Library action resolves its
 * targets through this, so a row somebody else owns is never among them.
 */
export function deletableByOwner(
  files: readonly ManagedFile[],
  reader: Partial<FileOwnerScope>,
  ids: readonly string[],
): ManagedFile[] {
  const wanted = new Set(ids);
  return readableByOwner(files, reader).filter((file) => wanted.has(file.id));
}
