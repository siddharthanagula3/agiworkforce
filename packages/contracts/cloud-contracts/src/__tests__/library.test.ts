
import { describe, expect, it } from 'vitest';
import {
  LibraryItemSchema,
  LibraryListQuerySchema,
  LibraryListResponseSchema,
  LIBRARY_DEFAULT_PAGE_SIZE,
  LIBRARY_MAX_PAGE_SIZE,
} from '../library';

const item = {
  id: '22222222-2222-4222-8222-222222222222',
  file_name: 'report.pdf',
  mime_type: 'application/pdf',
  kind: 'file',
  byte_count: 2048,
  uri: '/api/files/22222222-2222-4222-8222-222222222222',
  surface: 'file',
  previewable: true,
  origin: 'generated',
  source_surface: 'web',
  provider: 'anthropic',
  model: 'model-x',
  prompt: null,
  created_at: '2026-07-01T00:00:00.000Z',
};

describe('LibraryItemSchema', () => {
  it('accepts the full server item shape', () => {
    expect(LibraryItemSchema.safeParse(item).success).toBe(true);
  });

  it('defaults surface/previewable/origin for legacy rows that omit them', () => {
    const { surface: _s, previewable: _p, origin: _o, ...legacy } = item;
    const parsed = LibraryItemSchema.parse(legacy);
    expect(parsed.surface).toBe('file');
    expect(parsed.previewable).toBe(false);
    expect(parsed.origin).toBe('generated');
  });

  it('folds unknown future surface/origin values to safe defaults instead of dropping the item', () => {
    const parsed = LibraryItemSchema.parse({
      ...item,
      surface: 'hologram',
      origin: 'teleported',
    });
    expect(parsed.surface).toBe('file');
    expect(parsed.origin).toBe('generated');
  });

  it('rejects an item missing the uri', () => {
    const { uri: _omitted, ...rest } = item;
    expect(LibraryItemSchema.safeParse(rest).success).toBe(false);
  });
});

describe('LibraryListQuerySchema', () => {
  it('applies defaults for an empty query', () => {
    const parsed = LibraryListQuerySchema.parse({});
    expect(parsed.limit).toBe(LIBRARY_DEFAULT_PAGE_SIZE);
    expect(parsed.offset).toBe(0);
    expect(parsed.kind).toBeUndefined();
    expect(parsed.origin).toBeUndefined();
  });

  it('coerces string limit/offset from URL params and enforces the cap', () => {
    const parsed = LibraryListQuerySchema.parse({ limit: '50', offset: '24' });
    expect(parsed.limit).toBe(50);
    expect(parsed.offset).toBe(24);
    expect(
      LibraryListQuerySchema.safeParse({ limit: String(LIBRARY_MAX_PAGE_SIZE + 1) }).success,
    ).toBe(false);
    expect(LibraryListQuerySchema.safeParse({ offset: '-1' }).success).toBe(false);
  });

  it('rejects unknown filter values instead of silently ignoring them', () => {
    expect(LibraryListQuerySchema.safeParse({ kind: 'hologram' }).success).toBe(false);
    expect(LibraryListQuerySchema.safeParse({ origin: 'teleported' }).success).toBe(false);
    expect(LibraryListQuerySchema.safeParse({ surface: 'panel' }).success).toBe(false);
  });
});

describe('LibraryListResponseSchema', () => {
  it('accepts a page envelope with items', () => {
    const parsed = LibraryListResponseSchema.parse({
      items: [item],
      has_more: true,
      next_offset: 24,
    });
    expect(parsed.items).toHaveLength(1);
  });

  it('accepts the empty last page (next_offset null)', () => {
    expect(
      LibraryListResponseSchema.safeParse({ items: [], has_more: false, next_offset: null })
        .success,
    ).toBe(true);
  });
});
