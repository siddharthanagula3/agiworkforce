import 'server-only';

import type { ObjectStore } from '@agiworkforce/object-storage';
import { CHAT_LARGE_FILE_POLICY } from '@/lib/chat-attachment-policy';
import { isPrivateObjectStorageConfigured } from '@/lib/server/object-storage';
import { getObjectStore, objectStorageConfig } from '@/lib/server/object-storage-runtime';

const DERIVED_ROOT = 'chat-derived';
const KEY_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SEGMENT_NUMBER_WIDTH = 4;

export const PREPARED_TEXT_CONTENT_TYPE = 'text/plain; charset=utf-8';
export const PREPARED_INDEX_CONTENT_TYPE = 'application/json';

export interface PreparationStorage {
  store: ObjectStore;
  bucket: string;
}

export class PreparationStorageUnavailableError extends Error {
  constructor() {
    super('Private object storage is not configured for chat file preparation.');
    this.name = 'PreparationStorageUnavailableError';
  }
}

export function defaultPreparationStorage(): PreparationStorage {
  const bucket = objectStorageConfig().privateBucket;
  if (!isPrivateObjectStorageConfigured() || !bucket) {
    throw new PreparationStorageUnavailableError();
  }
  return { store: getObjectStore(), bucket };
}

function keySegment(value: string, label: string): string {
  if (!KEY_SEGMENT.test(value) || value.includes('..')) {
    throw new RangeError(`A derived object key cannot be built from this ${label}.`);
  }
  return value;
}

function numbered(value: number): string {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError('Derived objects are numbered from 1.');
  }
  return String(value).padStart(SEGMENT_NUMBER_WIDTH, '0');
}

export function preparationKeyPrefix(
  userId: string,
  assetId: string,
  preparerVersion: number = CHAT_LARGE_FILE_POLICY.preparation.preparerVersion,
): string {
  if (!Number.isSafeInteger(preparerVersion) || preparerVersion < 1) {
    throw new RangeError('A preparer version is a whole number from 1.');
  }
  return `${DERIVED_ROOT}/${keySegment(userId, 'user id')}/${keySegment(assetId, 'asset id')}/v${preparerVersion}/`;
}

export function textSegmentKey(prefix: string, segment: number): string {
  return `${prefix}text/${numbered(segment)}.txt`;
}

/**
 * One page index per batch, named by the batch's first page. A batch's input
 * is fixed by its cursor, so a run that lost the race rewrites the same bytes
 * under the same key instead of replacing a newer index.
 */
export function pagesIndexKey(prefix: string, firstPage: number): string {
  return `${prefix}pages/${numbered(firstPage)}.json`;
}

export function pagesIndexFirstPage(prefix: string, key: string): number | null {
  const match = /^pages\/(\d+)\.json$/.exec(key.startsWith(prefix) ? key.slice(prefix.length) : '');
  return match ? Number(match[1]) : null;
}

export function outlineKey(prefix: string): string {
  return `${prefix}outline.json`;
}

export function ocrPrefix(prefix: string): string {
  return `${prefix}ocr/`;
}

export function ocrPageKey(prefix: string, page: number): string {
  return `${ocrPrefix(prefix)}${numbered(page)}.txt`;
}

/** Offsets are characters in the whole prepared text, so a page reads as one slice of it. */
export interface PreparedPageEntry {
  page: number;
  start: number;
  end: number;
  hasText: boolean;
}

export const MAX_OUTLINE_TITLE_CHARS = 300;

export interface PreparedOutlineAnchor {
  title: string;
  level: number;
  page?: number;
  char?: number;
}

function wholeNumber(value: unknown, minimum: number): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum
    ? value
    : null;
}

export function serializePagesIndex(pages: readonly PreparedPageEntry[]): string {
  return JSON.stringify({ pages });
}

export function parsePagesIndex(text: string): PreparedPageEntry[] {
  const parsed = JSON.parse(text) as { pages?: unknown };
  if (!Array.isArray(parsed.pages)) return [];
  const pages: PreparedPageEntry[] = [];
  for (const raw of parsed.pages) {
    if (raw === null || typeof raw !== 'object') continue;
    const entry = raw as Record<string, unknown>;
    const page = wholeNumber(entry['page'], 1);
    const start = wholeNumber(entry['start'], 0);
    const end = wholeNumber(entry['end'], 0);
    if (page === null || start === null || end === null || end < start) continue;
    pages.push({ page, start, end, hasText: entry['hasText'] === true });
  }
  return pages;
}

export function serializeOutline(anchors: readonly PreparedOutlineAnchor[]): string {
  return JSON.stringify({ anchors });
}

export function parseOutline(text: string): PreparedOutlineAnchor[] {
  const parsed = JSON.parse(text) as { anchors?: unknown };
  if (!Array.isArray(parsed.anchors)) return [];
  const anchors: PreparedOutlineAnchor[] = [];
  for (const raw of parsed.anchors) {
    if (raw === null || typeof raw !== 'object') continue;
    const entry = raw as Record<string, unknown>;
    const level = wholeNumber(entry['level'], 0);
    if (typeof entry['title'] !== 'string' || level === null) continue;
    const page = wholeNumber(entry['page'], 1);
    const char = wholeNumber(entry['char'], 0);
    anchors.push({
      title: entry['title'],
      level,
      ...(page === null ? {} : { page }),
      ...(char === null ? {} : { char }),
    });
  }
  return anchors;
}

export async function writeDerivedObject(
  storage: PreparationStorage,
  key: string,
  body: string,
  contentType: string,
): Promise<void> {
  const data = Buffer.from(body, 'utf8');
  await storage.store.put({
    bucket: storage.bucket,
    key,
    body: data,
    contentType,
    contentLength: data.byteLength,
  });
}

export async function readDerivedText(
  storage: PreparationStorage,
  key: string,
): Promise<string | null> {
  const stored = await storage.store.get(storage.bucket, key);
  if (!stored) return null;
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(stored.data);
}

export class SourceObjectChangedError extends Error {
  constructor(readonly key: string) {
    super('The stored chat file did not answer with the bytes it was asked for.');
    this.name = 'SourceObjectChangedError';
  }
}

async function drain(body: ReadableStream<Uint8Array>, expected: number, key: string) {
  const reader = body.getReader();
  const data = new Uint8Array(expected);
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      if (received + value.byteLength > expected) throw new SourceObjectChangedError(key);
      data.set(value, received);
      received += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  if (received !== expected) throw new SourceObjectChangedError(key);
  return data;
}

/** Reads bytes `start` to `endExclusive` of a stored object; a short or long answer throws. */
export async function readObjectRange(
  storage: PreparationStorage,
  key: string,
  start: number,
  endExclusive: number,
): Promise<Uint8Array> {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(endExclusive) || start < 0) {
    throw new RangeError('A ranged read needs whole byte offsets.');
  }
  if (endExclusive <= start) return new Uint8Array(0);
  const stream = await storage.store.getStream(
    storage.bucket,
    key,
    `bytes=${start}-${endExclusive - 1}`,
  );
  if (!stream) throw new SourceObjectChangedError(key);
  return drain(stream.body, endExclusive - start, key);
}

export async function readWholeObject(
  storage: PreparationStorage,
  key: string,
  byteCount: number,
): Promise<Uint8Array> {
  const stream = await storage.store.getStream(storage.bucket, key);
  if (!stream) throw new SourceObjectChangedError(key);
  return drain(stream.body, byteCount, key);
}

export async function sourceObjectLength(
  storage: PreparationStorage,
  key: string,
): Promise<number | null> {
  const head = await storage.store.head(storage.bucket, key);
  return head?.contentLength ?? null;
}
