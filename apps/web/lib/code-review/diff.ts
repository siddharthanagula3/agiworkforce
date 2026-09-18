export type ReviewDiffLineKind = 'context' | 'added' | 'removed';

export interface ReviewDiffLine {
  kind: ReviewDiffLineKind;
  /** Line number in the head revision, absent for a removed line. */
  newLine: number | null;
  text: string;
}

export interface ReviewDiffHunk {
  header: string;
  newStart: number;
  lines: ReviewDiffLine[];
}

export interface ReviewDiffFile {
  /** Path in the head revision, which is what a review comment anchors to. */
  path: string;
  previousPath: string | null;
  binary: boolean;
  deleted: boolean;
  hunks: ReviewDiffHunk[];
}

const FILE_HEADER = /^diff --git a\/(.+?) b\/(.+)$/;
const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

function quotedPath(value: string): string {
  if (!value.startsWith('"') || !value.endsWith('"')) return value;
  try {
    return JSON.parse(value) as string;
  } catch {
    return value.slice(1, -1);
  }
}

/**
 * Parse a unified diff into files and hunks.
 *
 * The point is the line numbers: a review comment GitHub accepts must name a
 * line that is part of the diff on the head side, and a finding that names any
 * other line is a fabrication whatever the model believed. Everything the
 * anchor check needs is derived here, never guessed downstream.
 */
export function parseUnifiedDiff(diff: string): ReviewDiffFile[] {
  const files: ReviewDiffFile[] = [];
  let file: ReviewDiffFile | null = null;
  let hunk: ReviewDiffHunk | null = null;
  let newLine = 0;

  for (const raw of diff.split('\n')) {
    const header = FILE_HEADER.exec(raw);
    if (header) {
      file = {
        path: quotedPath(header[2] ?? ''),
        previousPath: null,
        binary: false,
        deleted: false,
        hunks: [],
      };
      hunk = null;
      files.push(file);
      continue;
    }
    if (!file) continue;

    if (raw.startsWith('Binary files ') || raw.startsWith('GIT binary patch')) {
      file.binary = true;
      continue;
    }
    if (raw.startsWith('deleted file mode')) {
      file.deleted = true;
      continue;
    }
    if (raw.startsWith('rename from ')) {
      file.previousPath = quotedPath(raw.slice('rename from '.length));
      continue;
    }
    if (raw.startsWith('--- ') || raw.startsWith('+++ ') || raw.startsWith('index ')) continue;

    const hunkHeader = HUNK_HEADER.exec(raw);
    if (hunkHeader) {
      newLine = Number(hunkHeader[3]);
      hunk = { header: raw, newStart: newLine, lines: [] };
      file.hunks.push(hunk);
      continue;
    }
    if (!hunk) continue;

    if (raw.startsWith('+')) {
      hunk.lines.push({ kind: 'added', newLine, text: raw.slice(1) });
      newLine += 1;
    } else if (raw.startsWith('-')) {
      hunk.lines.push({ kind: 'removed', newLine: null, text: raw.slice(1) });
    } else if (raw.startsWith(' ')) {
      hunk.lines.push({ kind: 'context', newLine, text: raw.slice(1) });
      newLine += 1;
    }
  }

  return files;
}

/**
 * The lines a review comment may anchor to, per path. Removed lines are absent:
 * they do not exist in the head revision, so GitHub rejects a right-side
 * comment on one.
 */
export function anchorableLines(files: readonly ReviewDiffFile[]): Map<string, Set<number>> {
  const anchors = new Map<string, Set<number>>();
  for (const file of files) {
    if (file.binary || file.deleted) continue;
    const lines = anchors.get(file.path) ?? new Set<number>();
    for (const hunk of file.hunks) {
      for (const line of hunk.lines) {
        if (line.newLine !== null && line.kind !== 'removed') lines.add(line.newLine);
      }
    }
    if (lines.size > 0) anchors.set(file.path, lines);
  }
  return anchors;
}

export interface ReviewDiffChunk {
  /** Paths this chunk carries, for the prompt and for logging. */
  paths: string[];
  text: string;
  byteLength: number;
}

function renderHunk(path: string, hunk: ReviewDiffHunk): string {
  const body = hunk.lines
    .map((line) => {
      const marker = line.kind === 'added' ? '+' : line.kind === 'removed' ? '-' : ' ';
      const number = line.newLine === null ? '    ' : String(line.newLine).padStart(4, ' ');
      return `${number} ${marker}${line.text}`;
    })
    .join('\n');
  return `--- ${path} ${hunk.header}\n${body}`;
}

/**
 * Split the diff into prompt-sized pieces, each carrying whole hunks.
 *
 * A large PR used to be truncated to the first 50 KB and everything after it
 * went unreviewed without anyone being told. Chunking reviews all of it, and
 * the per-line numbers are rendered into the text so the model names a real
 * line instead of counting.
 */
export function chunkDiff(
  files: readonly ReviewDiffFile[],
  options: { maxBytes: number; maxChunks: number },
): ReviewDiffChunk[] {
  const chunks: ReviewDiffChunk[] = [];
  let current: { paths: Set<string>; parts: string[]; bytes: number } | null = null;

  const flush = (): void => {
    if (!current || current.parts.length === 0) return;
    const text = current.parts.join('\n\n');
    chunks.push({ paths: [...current.paths], text, byteLength: Buffer.byteLength(text, 'utf8') });
    current = null;
  };

  for (const file of files) {
    if (file.binary || file.deleted) continue;
    for (const hunk of file.hunks) {
      if (chunks.length >= options.maxChunks) return chunks;
      const rendered = renderHunk(file.path, hunk);
      const size = Buffer.byteLength(rendered, 'utf8');
      if (current && current.bytes + size > options.maxBytes) flush();
      current ??= { paths: new Set(), parts: [], bytes: 0 };
      current.paths.add(file.path);
      current.parts.push(rendered.slice(0, options.maxBytes));
      current.bytes += size;
    }
  }
  flush();
  return chunks.slice(0, options.maxChunks);
}
