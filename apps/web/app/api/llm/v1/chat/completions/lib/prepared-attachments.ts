import 'server-only';

import {
  CHAT_LARGE_FILE_POLICY,
  MAX_CHAT_ATTACHMENT_BYTES,
  chatAttachmentSizeLabel,
  type ChatLargeFilePolicy,
} from '@/lib/chat-attachment-policy';
import { SANDBOX_WORKSPACE_ROOT, type StorageTurnFile } from '@/lib/e2b/attachment-staging';
import { logger } from '@/lib/logger';
import type { AttachmentUploadKind } from '@/lib/server/attachment-allowance';
import { chatFileSchemaReady } from '@/lib/server/chat-file-intake/schema';
import { listScannedChatFileAssets } from '@/lib/server/media-assets';
import type { PreparationStorage } from '@/lib/server/chat-file-preparation/derived-keys';
import type { PreparationDb } from '@/lib/server/chat-file-preparation/progress-store';
import {
  readPreparedCard,
  readPreparedText,
  type PreparedFileCard,
} from '@/lib/server/chat-file-preparation/readers';
import { sliceWholeCodePoints, storableText } from '@/lib/server/chat-file-preparation/text-stream';
import { untrustedDocumentText } from '@/lib/server/untrusted-document-text';
import { searchAttachedFiles } from '@/lib/services/retrieval-search-service';
import {
  LARGE_FILE_CARD_DETAIL_KEY,
  LARGE_FILE_CARD_KEY,
  estimateAttachmentTokens,
  largeFileTextPart,
  plainTextFilePart,
  renderLargeFileCard,
  type LargeFileCardDetailMarker,
  type LargeFileCardMarker,
  type LargeFileTextMarker,
} from './attachment-turn-budget';
import {
  defaultOversizeAttachmentResolver,
  type AttachmentReferencePart,
  type OversizeAttachmentResolver,
  type ResolvedMediaAsset,
} from './chat-attachment-hydration';

const ESTIMATED_CHARS_PER_TOKEN = 3.5;
const MAX_OUTLINE_ANCHORS = 100;
const NOT_READABLE_LINE = 'This file could not be read as text.';
const PDF_KIND = 'pdf';
const CHAT_ATTACHMENT_SOURCE: AttachmentUploadKind = 'chat-attachment';
const CHAT_ATTACHMENT_KEY_PREFIX = 'chat-attachments/';

export interface HydratedLargeFile {
  assetId: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  live: boolean;
}

export type PassageSearch = (request: {
  assetId: string;
  query: string;
  limit: number;
}) => Promise<string[]>;

export interface PreparedAttachmentResolverDeps {
  db: PreparationDb;
  /** Every preparation statement also requires this owner. */
  userId: string;
  temporaryChat: boolean;
  /** The person's message this turn, which the keyword passages answer. */
  query: string;
  onTruncated?: (filename: string) => void;
  searchPassages?: PassageSearch;
  storage?: PreparationStorage;
  policy?: ChatLargeFilePolicy;
}

export interface PreparedAttachmentResolver {
  resolve: OversizeAttachmentResolver;
  largeFiles(): readonly HydratedLargeFile[];
  textSections(): readonly LargeFileTextMarker[];
}

function filenameOf(asset: ResolvedMediaAsset): string {
  const filename = asset.metadata['filename'];
  return typeof filename === 'string' && filename.trim()
    ? filename.trim()
    : `attachment-${asset.id}`;
}

/** The rows 0422's insert trigger holds to a matching scan verdict. */
function isChatAttachmentRow(source: unknown, storagePathname: string | null): boolean {
  return (
    source === CHAT_ATTACHMENT_SOURCE ||
    (storagePathname?.startsWith(CHAT_ATTACHMENT_KEY_PREFIX) ?? false)
  );
}

function isLargeChatFile(asset: ResolvedMediaAsset): asset is ResolvedMediaAsset & {
  byteSize: number;
} {
  return (
    asset.byteSize !== null &&
    Number.isSafeInteger(asset.byteSize) &&
    asset.byteSize > MAX_CHAT_ATTACHMENT_BYTES &&
    isChatAttachmentRow(asset.metadata['source'], asset.storagePathname)
  );
}

function wholeNumber(value: number): string {
  return value.toLocaleString('en-US');
}

function oneLineCard(file: HydratedLargeFile): string {
  return `[attached file: ${file.filename} (${file.mimeType}), ${chatAttachmentSizeLabel(file.byteSize)}, id ${file.assetId}]`;
}

function readLines(card: PreparedFileCard | null, policy: ChatLargeFilePolicy): string[] {
  if (!card || card.state === 'prepare_failed') return [NOT_READABLE_LINE];
  const lines: string[] = [];
  if (card.kind === PDF_KIND && card.pageCount !== null) {
    lines.push(`It has ${wholeNumber(card.pageCount)} ${card.pageCount === 1 ? 'page' : 'pages'}.`);
    if (card.pagesRead > 0) {
      lines.push(
        `Text read for pages 1 to ${wholeNumber(card.pagesRead)} of ${wholeNumber(card.pageCount)}.`,
      );
    }
    const lastToRead = Math.min(card.pageCount, policy.kinds.pdf.maxTextPages);
    if (card.state === 'preparing' && card.pagesRead < lastToRead) {
      lines.push(
        `Still reading pages ${wholeNumber(card.pagesRead + 1)} to ${wholeNumber(lastToRead)}.`,
      );
    }
  } else {
    if (card.sheetCount !== null) {
      lines.push(
        `It has ${wholeNumber(card.sheetCount)} ${card.sheetCount === 1 ? 'sheet' : 'sheets'}.`,
      );
    }
    lines.push(`Text read: ${wholeNumber(card.textChars)} characters.`);
    if (card.state === 'preparing') lines.push('Still reading the rest of the file.');
  }
  if (card.state === 'ready_partial' || card.coverage.textTruncated === true) {
    lines.push('Only part of this file could be read as text.');
  }
  return lines;
}

function profileColumns(columns: unknown): string {
  if (!Array.isArray(columns)) return '';
  return columns
    .map((column) => {
      if (!column || typeof column !== 'object') return null;
      const { name, type } = column as { name?: unknown; type?: unknown };
      return typeof name === 'string'
        ? typeof type === 'string'
          ? `${name} (${type})`
          : name
        : null;
    })
    .filter((entry): entry is string => entry !== null)
    .join(', ');
}

/** Stated before the column list, which is the first thing cut when the card is fitted to its budget. */
function columnTotal(columnCount: unknown): string {
  return typeof columnCount === 'number' ? `, ${wholeNumber(columnCount)} columns` : '';
}

function unlistedColumns(columnCount: unknown, columns: unknown): string {
  if (typeof columnCount !== 'number' || !Array.isArray(columns) || columns.length === 0) return '';
  const more = columnCount - columns.length;
  return more > 0 ? `, and ${wholeNumber(more)} more not listed` : '';
}

function detailText(card: PreparedFileCard): string {
  const lines: string[] = [];
  const outline = card.outline.slice(0, MAX_OUTLINE_ANCHORS);
  if (outline.length > 0) {
    lines.push('Outline:');
    for (const anchor of outline) {
      const indent = '  '.repeat(Math.max(0, anchor.level - 1));
      lines.push(
        `${indent}${anchor.title}${anchor.page !== undefined ? ` (page ${anchor.page})` : ''}`,
      );
    }
  }
  const sheets = card.coverage['sheets'];
  if (Array.isArray(sheets)) {
    for (const sheet of sheets) {
      if (!sheet || typeof sheet !== 'object') continue;
      const { name, rowCount, columnCount, columns } = sheet as {
        name?: unknown;
        rowCount?: unknown;
        columnCount?: unknown;
        columns?: unknown;
      };
      if (typeof name !== 'string') continue;
      const rows = typeof rowCount === 'number' ? `, ${wholeNumber(rowCount)} rows` : '';
      const cols = profileColumns(columns);
      lines.push(
        `Sheet ${name}${rows}${columnTotal(columnCount)}${cols ? `; columns: ${cols}${unlistedColumns(columnCount, columns)}` : ''}`,
      );
    }
  }
  const table = card.coverage['table'];
  if (table && typeof table === 'object') {
    const { rowCount, columnCount, columns } = table as {
      rowCount?: unknown;
      columnCount?: unknown;
      columns?: unknown;
    };
    const cols = profileColumns(columns);
    lines.push(
      `Table${typeof rowCount === 'number' ? ` of ${wholeNumber(rowCount)} rows` : ''}${columnTotal(columnCount)}${cols ? `; columns: ${cols}${unlistedColumns(columnCount, columns)}` : ''}`,
    );
  }
  return lines.join('\n');
}

function charsForTokens(tokens: number): number {
  return Math.max(0, Math.floor(tokens * ESTIMATED_CHARS_PER_TOKEN));
}

/** The longest start of the detail, whole lines where one fits, whose fenced form is within `room`. */
function fittedDetail(name: string, detail: string, room: number): string | null {
  if (room <= 0) return null;
  const fits = (text: string) =>
    estimateAttachmentTokens(untrustedDocumentText(name, text)) <= room;
  if (fits(detail)) return untrustedDocumentText(name, detail);
  let low = 0;
  let high = Math.min(detail.length, charsForTokens(room));
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (fits(sliceWholeCodePoints(detail, middle))) low = middle;
    else high = middle - 1;
  }
  const cut = sliceWholeCodePoints(detail, low);
  const lastBreak = cut.lastIndexOf('\n');
  const text = (lastBreak > 0 ? cut.slice(0, lastBreak) : cut).trimEnd();
  return text ? untrustedDocumentText(name, text) : null;
}

interface PreparedRead {
  card: PreparedFileCard | null;
  section: LargeFileTextMarker | null;
  partial: boolean;
  unreadable: boolean;
}

/**
 * A large file's share of the turn: the card, its outline or sheets as
 * fenced data, and the text the ledger later shrinks to the step's budget.
 * A file with no preparation, or one that failed, gets the card only. Before
 * the schema that guarantees a scan verdict exists, no file above the inline
 * limit can be sealed, so every such file is handled as it is today.
 */
export function createPreparedAttachmentResolver(
  deps: PreparedAttachmentResolverDeps,
): PreparedAttachmentResolver {
  const policy = deps.policy ?? CHAT_LARGE_FILE_POLICY;
  const files: HydratedLargeFile[] = [];
  const sections: LargeFileTextMarker[] = [];
  const reads = new Map<string, Promise<PreparedRead>>();
  const truncationReported = new Set<string>();
  let schemaReady: Promise<boolean> | null = null;
  const readerDeps = {
    db: deps.db,
    userId: deps.userId,
    ...(deps.storage ? { storage: deps.storage } : {}),
    policy,
  };

  async function passages(assetId: string): Promise<string[]> {
    const query = deps.query.trim();
    if (deps.temporaryChat || !query || !deps.searchPassages) return [];
    try {
      const found = await deps.searchPassages({
        assetId,
        query,
        limit: policy.turnBudget.passageWindows,
      });
      return found
        .slice(0, policy.turnBudget.passageWindows)
        .map((text) => text.slice(0, policy.turnBudget.passageChars).trim())
        .filter((text) => text.length > 0);
    } catch (error) {
      logger.warn({ err: error, assetId }, '[prepared-attachments] keyword passages unavailable');
      return [];
    }
  }

  async function read(file: HydratedLargeFile): Promise<PreparedRead> {
    try {
      const card = await readPreparedCard(file.assetId, readerDeps);
      if (!card || card.state === 'prepare_failed') {
        return { card, section: null, partial: true, unreadable: true };
      }
      if (card.textChars === 0) return { card, section: null, partial: true, unreadable: false };
      const maxChars = charsForTokens(policy.turnBudget.maxAttachmentTokensPerTurn / 2);
      const whole = card.textChars <= maxChars;
      const found = whole ? [] : await passages(file.assetId);
      const passageText = found.map((text, index) => `[${index + 1}] ${text}`).join('\n\n');
      const slice = await readPreparedText(
        file.assetId,
        { startChar: 0, maxChars: Math.max(0, maxChars - passageText.length) },
        readerDeps,
      );
      const head = storableText(slice?.text ?? '');
      const text = passageText
        ? `Passages that match the message:\n\n${passageText}\n\nStart of the file:\n${head}`
        : head;
      const complete =
        whole &&
        slice?.reachedEnd === true &&
        card.state === 'ready' &&
        card.coverage.textTruncated !== true;
      return {
        card,
        section: text.trim()
          ? { assetId: file.assetId, filename: file.filename, live: file.live, text }
          : null,
        partial: !complete,
        unreadable: false,
      };
    } catch (error) {
      logger.warn(
        { err: error, assetId: file.assetId },
        '[prepared-attachments] prepared chat file could not be read; sending its card only',
      );
      return { card: null, section: null, partial: true, unreadable: true };
    }
  }

  /**
   * One asset attached in several turns is read once and its text sent once,
   * by its first slot: hydration resolves the current turn's slots first.
   */
  function addSection(section: LargeFileTextMarker): void {
    const index = sections.findIndex((existing) => existing.assetId === section.assetId);
    if (index < 0) sections.push(section);
    else if (section.live && !sections[index]!.live)
      sections[index] = { ...sections[index]!, live: true };
  }

  const resolve: OversizeAttachmentResolver = async (input) => {
    if (!isLargeChatFile(input.asset)) return defaultOversizeAttachmentResolver(input);
    schemaReady ??= chatFileSchemaReady(deps.db, { cached: true }).catch((error: unknown) => {
      logger.warn(
        { err: error },
        '[prepared-attachments] chat file schema check failed; large files are handled as today',
      );
      return false;
    });
    if (!(await schemaReady)) return defaultOversizeAttachmentResolver(input);
    const file: HydratedLargeFile = {
      assetId: input.asset.id,
      filename: filenameOf(input.asset),
      mimeType: input.asset.mimeType,
      byteSize: input.asset.byteSize,
      live: input.turn === 'live',
    };
    const repeat = reads.has(file.assetId);
    if (!repeat) {
      files.push(file);
      reads.set(file.assetId, read(file));
    }
    const prepared = await reads.get(file.assetId)!;
    const searchable = !deps.temporaryChat && (prepared.card?.indexedChars ?? 0) > 0;
    const card: LargeFileCardMarker = {
      assetId: file.assetId,
      live: file.live,
      lines: [
        oneLineCard(file),
        ...readLines(prepared.card, policy),
        searchable ? 'Its text is searchable.' : 'Its text is not searchable.',
        `When code runs, the file is placed in the code sandbox under ${SANDBOX_WORKSPACE_ROOT}.`,
      ],
      oneLine: oneLineCard(file),
      partial: prepared.partial,
      ...(prepared.unreadable ? { unreadable: true } : {}),
    };
    const finishedWithoutText =
      prepared.card !== null &&
      prepared.card.state !== 'preparing' &&
      prepared.card.textChars === 0;
    if (
      prepared.partial &&
      !prepared.unreadable &&
      !finishedWithoutText &&
      file.live &&
      !truncationReported.has(file.assetId)
    ) {
      truncationReported.add(file.assetId);
      deps.onTruncated?.(file.filename);
    }
    if (prepared.section) addSection({ ...prepared.section, live: file.live });

    const parts: AttachmentReferencePart[] = [
      {
        type: 'text',
        text: renderLargeFileCard(card, { oneLine: false, fileToolsOffered: false }),
        [LARGE_FILE_CARD_KEY]: card,
      } as AttachmentReferencePart,
    ];
    const detail = prepared.card && !repeat ? detailText(prepared.card) : '';
    if (detail) {
      const room =
        policy.turnBudget.cardMaxTokens -
        estimateAttachmentTokens(
          renderLargeFileCard(
            { ...card, partial: true },
            {
              oneLine: false,
              fileToolsOffered: true,
            },
          ),
        );
      const detailName = `${file.filename} (outline)`;
      const fenced = fittedDetail(detailName, detail, room);
      if (fenced) {
        const marker: LargeFileCardDetailMarker = { assetId: file.assetId, text: fenced };
        const detailPart: Record<string, unknown> = {
          ...plainTextFilePart(detailName, fenced),
          [LARGE_FILE_CARD_DETAIL_KEY]: marker,
        };
        parts.push(detailPart as AttachmentReferencePart);
      }
    }
    return { kind: 'parts', parts };
  };

  return {
    resolve,
    largeFiles: () => files,
    textSections: () => sections,
  };
}

type HydratedMessage = {
  role: string;
  content: string | AttachmentReferencePart[];
};

/** Every file reference of the conversation, which scoped file search is limited to. */
export function attachmentAssetIdsOf(messages: readonly HydratedMessage[]): string[] {
  const ids = new Set<string>();
  for (const message of messages) {
    if (!Array.isArray(message.content)) continue;
    for (const part of message.content) {
      const assetId = part?.file?.asset_id;
      if (part?.type === 'file' && typeof assetId === 'string' && assetId) ids.add(assetId);
    }
  }
  return [...ids];
}

/**
 * The prepared text of every large file goes at the end of the message being
 * sent, where the ledger rewrites it before each step.
 */
export function appendLargeFileText(
  messages: HydratedMessage[],
  sections: readonly LargeFileTextMarker[],
): void {
  if (sections.length === 0) return;
  let index = messages.length - 1;
  while (index >= 0 && messages[index]?.role !== 'user') index -= 1;
  const message = messages[index];
  if (!message) return;
  const parts: AttachmentReferencePart[] =
    typeof message.content === 'string'
      ? message.content
        ? [{ type: 'text', text: message.content }]
        : []
      : [...message.content];
  for (const section of sections) {
    parts.push(largeFileTextPart(section) as AttachmentReferencePart);
  }
  message.content = parts;
}

export function attachedFilePassageSearch(scope: {
  db: PreparationDb;
  userId: string;
  organizationId: string | null;
  healthSpaceProjectId?: string | null;
}): PassageSearch {
  return async ({ assetId, query, limit }) => {
    const hits = await searchAttachedFiles(
      {
        db: scope.db,
        userId: scope.userId,
        organizationId: scope.organizationId,
        healthSpaceProjectId: scope.healthSpaceProjectId ?? null,
      },
      { text: query, assetIds: [assetId], limit, maxPerSource: limit },
    );
    return hits.map((hit) => hit.text);
  };
}

/**
 * The large files of a turn as the sandbox stages them, read again with the
 * owner check: only the caller's own live chat-file rows above the inline
 * limit whose scan verdict matches their content, and none at all before
 * the schema that records that verdict exists.
 */
export async function resolveLargeFileStorageFiles(
  db: PreparationDb,
  owner: { userId: string; organizationId: string | null },
  assetIds: readonly string[],
): Promise<StorageTurnFile[]> {
  if (assetIds.length === 0) return [];
  if (!(await chatFileSchemaReady(db, { cached: true }))) return [];
  const rows = await listScannedChatFileAssets(
    owner,
    assetIds,
    { source: CHAT_ATTACHMENT_SOURCE, keyPrefix: CHAT_ATTACHMENT_KEY_PREFIX },
    db,
  );
  const byId = new Map(rows.map((row) => [row.id, row]));
  return [...new Set(assetIds)].flatMap((assetId): StorageTurnFile[] => {
    const row = byId.get(assetId);
    if (!row || !row.storagePathname || row.byteSize === null) return [];
    if (!isChatAttachmentRow(row.source, row.storagePathname)) return [];
    const byteSize = row.byteSize;
    if (!Number.isSafeInteger(byteSize) || byteSize <= MAX_CHAT_ATTACHMENT_BYTES) return [];
    return [
      {
        assetId,
        filename: row.filename?.trim() || `attachment-${assetId}`,
        mimeType: row.mimeType,
        byteSize,
        key: row.storagePathname,
      },
    ];
  });
}
