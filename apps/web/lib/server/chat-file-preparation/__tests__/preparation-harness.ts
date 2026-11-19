import { createMemoryObjectStore, type ObjectStore } from '@agiworkforce/object-storage';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { MAX_CHAT_ATTACHMENT_BYTES } from '@/lib/chat-attachment-policy';
import type { PreparationStorage } from '../derived-keys';

export const BUCKET = 'chat-preparation-test';
export const USER = 'user_preparation';
export const ORGANIZATION = '0b6f3c1e-7d2a-4c55-9a51-3f7e2b9d8c10';

export interface CountingStorage extends PreparationStorage {
  memory: ReturnType<typeof createMemoryObjectStore>;
  stats: {
    bytesRead: number;
    reads: number;
    ranges: string[];
    heads: number;
    puts: string[];
    deletes: string[];
  };
  failNextPut?: boolean;
}

export function createCountingStorage(): CountingStorage {
  const memory = createMemoryObjectStore();
  const stats: CountingStorage['stats'] = {
    bytesRead: 0,
    reads: 0,
    ranges: [],
    heads: 0,
    puts: [],
    deletes: [],
  };
  const store: ObjectStore = {
    put: async (input) => {
      if (counting.failNextPut) {
        counting.failNextPut = false;
        throw new Error('storage write failed');
      }
      stats.puts.push(input.key);
      return memory.put(input);
    },
    get: async (bucket, key) => {
      const stored = await memory.get(bucket, key);
      if (stored && !key.startsWith('chat-derived/')) {
        stats.reads += 1;
        stats.bytesRead += stored.data.byteLength;
      }
      return stored;
    },
    getStream: async (bucket, key, range) => {
      const stream = await memory.getStream(bucket, key, range);
      if (stream && !key.startsWith('chat-derived/')) {
        stats.reads += 1;
        stats.ranges.push(range ?? 'whole');
        stats.bytesRead += stream.contentLength ?? 0;
      }
      return stream;
    },
    head: (bucket, key) => {
      stats.heads += 1;
      return memory.head(bucket, key);
    },
    delete: (bucket, key) => {
      stats.deletes.push(key);
      return memory.delete(bucket, key);
    },
    copyIfMatch: (input) => memory.copyIfMatch(input),
    presignPut: (input) => memory.presignPut(input),
    presignGet: (input) => memory.presignGet(input),
  };
  const counting: CountingStorage = { store, bucket: BUCKET, memory, stats };
  return counting;
}

export async function storeSource(
  storage: CountingStorage,
  key: string,
  data: Uint8Array,
  contentType: string,
): Promise<void> {
  await storage.memory.put({ bucket: BUCKET, key, body: data, contentType });
}

export interface FakeAsset {
  id: string;
  user_id: string;
  organization_id: string | null;
  kind: string;
  mime_type: string;
  byte_size: number | null;
  storage_url: string;
  storage_pathname: string | null;
  metadata: Record<string, unknown>;
  deleted_at: string | null;
}

export type FakeRow = Record<string, unknown> & {
  id: string;
  media_asset_id: string | null;
  derived_keys: string[];
  cursor: Record<string, unknown>;
  coverage: Record<string, unknown>;
  state: string;
  updated_at: Date;
};

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function hasLoneSurrogate(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        index += 1;
        continue;
      }
      return true;
    }
    if (code >= 0xdc00 && code <= 0xdfff) return true;
  }
  return false;
}

/** Postgres refuses a jsonb value holding NUL or an unpaired surrogate; so does the fake. */
function assertJsonbStorable(json: unknown): void {
  const visit = (value: unknown): void => {
    if (typeof value === 'string') {
      if (value.includes('\u0000')) throw new Error('unsupported Unicode escape sequence');
      if (hasLoneSurrogate(value)) throw new Error('invalid input syntax for type json');
      return;
    }
    if (Array.isArray(value)) value.forEach(visit);
    else if (value !== null && typeof value === 'object') {
      for (const [key, entry] of Object.entries(value)) {
        visit(key);
        visit(entry);
      }
    }
  };
  visit(JSON.parse(String(json)));
}

let uuidCounter = 0;
export function testUuid(): string {
  uuidCounter += 1;
  return `00000000-0000-4000-8000-${String(uuidCounter).padStart(12, '0')}`;
}

/**
 * The preparations table as Postgres holds it, for the statements the
 * preparation modules send: rows keyed by id, `updated_at` moved on every
 * update as the table's trigger does, the cursor compared as jsonb.
 */
export class FakePreparationDb implements Pick<DatabaseAdapter, 'query'> {
  readonly assets = new Map<string, FakeAsset>();
  readonly rows = new Map<string, FakeRow>();
  readonly statements: string[] = [];
  clock = Date.parse('2026-11-15T10:00:00Z');
  failNextAdvance = false;
  beforeAdvance: (() => void) | null = null;
  beforeListKeys: (() => void) | null = null;
  beforePageTextListing: (() => void) | null = null;

  tick(ms = 1_000): void {
    this.clock += ms;
  }

  /** A statement that acts on one row by id must carry the owner, as the isolation guard requires. */
  private requireOwnerPredicate(text: string, predicate: string): void {
    if (!text.includes(predicate)) {
      throw new Error(
        `A row statement was sent without its owner predicate (${predicate}): ${text.slice(0, 120)}`,
      );
    }
  }

  private ownedBy(row: FakeRow, owner: unknown): boolean {
    return row['user_id'] === owner;
  }

  private now(): Date {
    return new Date(this.clock);
  }

  addAsset(
    asset: Partial<FakeAsset> & {
      id: string;
      mime_type: string;
      storage_pathname: string;
      filename: string;
    },
  ): FakeAsset {
    const { filename, ...rest } = asset;
    const row: FakeAsset = {
      user_id: USER,
      organization_id: null,
      kind: 'file',
      byte_size: MAX_CHAT_ATTACHMENT_BYTES + 1,
      storage_url: asset.storage_pathname,
      metadata: { filename, source: 'chat-attachment' },
      deleted_at: null,
      ...rest,
    };
    this.assets.set(row.id, row);
    return row;
  }

  rowForAsset(assetId: string): FakeRow | undefined {
    return [...this.rows.values()].find((row) => row.media_asset_id === assetId);
  }

  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    this.statements.push(sql);
    const text = sql.replace(/\s+/g, ' ').trim();
    const out = (rows: unknown[]) => rows.map((row) => structuredClone(row)) as T[];

    if (/to_regclass\('public\.chat_file_intakes'\)/.test(text)) {
      return out([{ intakes_table: true, preparations_table: true, scanned_sha256_column: true }]);
    }
    if (/from public\.media_assets where id = \$1/.test(text)) {
      const asset = this.assets.get(String(params[0]));
      return out(asset ? [asset] : []);
    }
    if (/^insert into public\.chat_file_preparations/.test(text)) {
      const [assetId, userId, organizationId, kind, version] = params;
      if (!this.rowForAsset(String(assetId))) {
        const id = testUuid();
        this.rows.set(id, {
          id,
          media_asset_id: String(assetId),
          user_id: String(userId),
          organization_id: (organizationId as string | null) ?? null,
          kind: String(kind),
          state: 'preparing',
          preparer_version: Number(version),
          cursor: {},
          segments_ready: 0,
          pages_read: 0,
          page_count: null,
          sheet_count: null,
          token_estimate: null,
          indexed_chars: '0',
          derived_keys: [],
          coverage: {},
          error: null,
          created_at: this.now(),
          updated_at: this.now(),
        });
      }
      return [];
    }
    if (
      /^select .* from public\.chat_file_preparations where media_asset_id = \$1::uuid and user_id = \$2$/.test(
        text,
      )
    ) {
      const row = this.rowForAsset(String(params[0]));
      return out(row && this.ownedBy(row, params[1]) ? [row] : []);
    }
    if (
      /^select .* from public\.chat_file_preparations where id = \$1::uuid( and user_id = \$2)?$/.test(
        text,
      )
    ) {
      this.requireOwnerPredicate(text, 'and user_id = $2');
      const row = this.rows.get(String(params[0]));
      return out(row && this.ownedBy(row, params[1]) ? [row] : []);
    }
    if (/^update public\.chat_file_preparations set cursor = \$3::jsonb/.test(text)) {
      this.requireOwnerPredicate(text, 'and user_id = $12');
      this.requireOwnerPredicate(text, "and state = 'preparing'");
      this.requireOwnerPredicate(text, 'and cursor = $2::jsonb');
      this.requireOwnerPredicate(text, 'updated_at = now()');
      this.beforeAdvance?.();
      if (this.failNextAdvance) {
        this.failNextAdvance = false;
        throw new Error('connection reset during advance');
      }
      assertJsonbStorable(params[1]);
      assertJsonbStorable(params[2]);
      assertJsonbStorable(params[8]);
      const row = this.rows.get(String(params[0]));
      if (!row || row.state !== 'preparing' || row['user_id'] !== params[11]) return [];
      if (canonical(row.cursor) !== canonical(JSON.parse(String(params[1])))) return [];
      const added = (params[10] as string[]).filter((key) => !row.derived_keys.includes(key));
      Object.assign(row, {
        cursor: JSON.parse(String(params[2])),
        state: params[3],
        segments_ready: params[4],
        pages_read: params[5],
        page_count: params[6],
        sheet_count: params[7],
        coverage: JSON.parse(String(params[8])),
        error: params[9],
        derived_keys: [...row.derived_keys, ...new Set(added)],
        updated_at: this.now(),
      });
      return out([row]);
    }
    if (
      /^update public\.chat_file_preparations set derived_keys = derived_keys \|\| coalesce/.test(
        text,
      )
    ) {
      this.requireOwnerPredicate(text, 'and user_id = $4');
      this.requireOwnerPredicate(text, "and state = 'preparing'");
      this.requireOwnerPredicate(text, 'and cursor = $2::jsonb');
      this.beforeListKeys?.();
      assertJsonbStorable(params[1]);
      const row = this.rows.get(String(params[0]));
      if (
        !row ||
        row.state !== 'preparing' ||
        row.media_asset_id === null ||
        row['user_id'] !== params[3]
      )
        return [];
      if (canonical(row.cursor) !== canonical(JSON.parse(String(params[1])))) return [];
      const added = (params[2] as string[]).filter((key) => !row.derived_keys.includes(key));
      row.derived_keys = [...row.derived_keys, ...new Set(added)];
      row.updated_at = this.now();
      return out([{ id: row.id }]);
    }
    if (/set derived_keys = derived_keys \|\| array\[\$2::text\]/.test(text)) {
      this.requireOwnerPredicate(text, 'and user_id = $5');
      this.beforePageTextListing?.();
      const row = this.rowForAsset(String(params[0]));
      const key = String(params[1]);
      const prefix = String(params[2]);
      if (
        !row ||
        !this.ownedBy(row, params[4]) ||
        row.derived_keys.includes(key) ||
        row.derived_keys.filter((existing) => existing.startsWith(prefix)).length >=
          Number(params[3])
      ) {
        return [];
      }
      row.derived_keys = [...row.derived_keys, key];
      row.updated_at = this.now();
      return out([{ id: row.id }]);
    }
    if (/set indexed_chars = \$2/.test(text)) {
      this.requireOwnerPredicate(text, 'and user_id = $3');
      const row = this.rowForAsset(String(params[0]));
      if (!row || row['user_id'] !== params[2]) return [];
      row['indexed_chars'] = String(params[1]);
      row.updated_at = this.now();
      return out([{ id: row.id }]);
    }
    if (/coalesce\(sum\(indexed_chars\), 0\)/.test(text)) {
      const total = [...this.rows.values()]
        .filter((row) => row['user_id'] === params[0] && row.media_asset_id !== null)
        .reduce((sum, row) => sum + Number(row['indexed_chars']), 0);
      return out([{ indexed_chars: String(total) }]);
    }
    if (/set state = 'prepare_failed', error = 'stalled'/.test(text)) {
      const cutoff = this.clock - Number(params[0]);
      const stalled = [...this.rows.values()]
        .filter((row) => row.state === 'preparing' && row.updated_at.getTime() < cutoff)
        .slice(0, Number(params[1]));
      for (const row of stalled)
        Object.assign(row, { state: 'prepare_failed', error: 'stalled', updated_at: this.now() });
      return out(stalled.map((row) => ({ id: row.id })));
    }
    if (
      /^select id, user_id, derived_keys, updated_at::text as updated_at from public\.chat_file_preparations where media_asset_id is null/.test(
        text,
      )
    ) {
      return out(
        [...this.rows.values()]
          .filter((row) => row.media_asset_id === null)
          .slice(0, Number(params[0]))
          .map((row) => ({
            id: row.id,
            user_id: row['user_id'],
            derived_keys: row.derived_keys,
            updated_at: row.updated_at.toISOString(),
          })),
      );
    }
    if (/^delete from public\.chat_file_preparations/.test(text)) {
      this.requireOwnerPredicate(text, 'and user_id = $4');
      const row = this.rows.get(String(params[0]));
      if (
        !row ||
        row['user_id'] !== params[3] ||
        row.media_asset_id !== null ||
        canonical(row.derived_keys) !== canonical(params[1])
      )
        return [];
      if (row.updated_at.getTime() !== new Date(String(params[2])).getTime()) return [];
      this.rows.delete(row.id);
      return out([{ id: row.id }]);
    }
    throw new Error(
      `The fake preparations database was sent a statement it does not know: ${text.slice(0, 160)}`,
    );
  }
}

/** A seeded generator, so a fixture is the same on every run and different across seeds. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const WORDS = [
  'harbor',
  'lantern',
  'meadow',
  'quartz',
  'falcon',
  'ember',
  'willow',
  'cobalt',
  'summit',
  'orchard',
  'tundra',
  'velvet',
  'canyon',
  'marble',
  'pepper',
  'saffron',
  'glacier',
  'thistle',
  'juniper',
  'copper',
];

export function seededWords(random: () => number, count: number): string {
  const words: string[] = [];
  for (let index = 0; index < count; index += 1) {
    words.push(WORDS[Math.floor(random() * WORDS.length)]!);
  }
  return words.join(' ');
}

export interface PdfFixtureOptions {
  /** One entry per page; an empty string is a page with no text layer. */
  pages: readonly string[];
  /** Bytes of an object no page refers to, placed between the pages and the cross-reference table. */
  paddingBytes?: number;
  outline?: readonly { title: string; page: number }[];
}

export function buildPdf(options: PdfFixtureOptions): Buffer {
  const objects: (string | Buffer)[] = [];
  const add = (body: string | Buffer): number => {
    objects.push(body);
    return objects.length;
  };
  const catalogId = add('');
  const pagesId = add('');
  const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pageIds: number[] = [];
  for (const text of options.pages) {
    const stream = text ? `BT /F1 12 Tf 72 700 Td (${text}) Tj ET` : '';
    const contentId = add(
      `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
    );
    pageIds.push(
      add(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`,
      ),
    );
  }
  let outlinesId: number | null = null;
  if (options.outline && options.outline.length > 0) {
    outlinesId = add('');
    const itemIds = options.outline.map(() => add(''));
    options.outline.forEach((item, index) => {
      const links = [
        index > 0 ? `/Prev ${itemIds[index - 1]} 0 R` : '',
        index < itemIds.length - 1 ? `/Next ${itemIds[index + 1]} 0 R` : '',
      ].join(' ');
      objects[itemIds[index]! - 1] =
        `<< /Title (${item.title}) /Parent ${outlinesId} 0 R /Dest [${pageIds[item.page - 1]} 0 R /Fit] ${links} >>`;
    });
    objects[outlinesId - 1] =
      `<< /Type /Outlines /First ${itemIds[0]} 0 R /Last ${itemIds.at(-1)} 0 R /Count ${itemIds.length} >>`;
  }
  if (options.paddingBytes) {
    const filler = Buffer.alloc(options.paddingBytes, 0x41);
    add(
      Buffer.concat([
        Buffer.from(`<< /Length ${filler.length} >>\nstream\n`),
        filler,
        Buffer.from('\nendstream'),
      ]),
    );
  }
  objects[catalogId - 1] =
    `<< /Type /Catalog /Pages ${pagesId} 0 R${outlinesId ? ` /Outlines ${outlinesId} 0 R` : ''} >>`;
  objects[pagesId - 1] =
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n', 'latin1')];
  let length = chunks[0]!.length;
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(length);
    const chunk = Buffer.concat([
      Buffer.from(`${index + 1} 0 obj\n`, 'latin1'),
      typeof object === 'string' ? Buffer.from(object, 'latin1') : object,
      Buffer.from('\nendobj\n', 'latin1'),
    ]);
    chunks.push(chunk);
    length += chunk.length;
  });
  let tail = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) tail += `${String(offset).padStart(10, '0')} 00000 n \n`;
  tail += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${length}\n%%EOF\n`;
  chunks.push(Buffer.from(tail, 'latin1'));
  return Buffer.concat(chunks);
}

/** Runs steps until the preparation says it is done, as the intake workflow does. */
export async function prepareUntilDone(
  step: () => Promise<{ done: boolean }>,
  maxSteps = 50,
): Promise<number> {
  for (let steps = 1; steps <= maxSteps; steps += 1) {
    const result = await step();
    if (result.done) return steps;
  }
  throw new Error('Preparation did not finish within the step bound.');
}
