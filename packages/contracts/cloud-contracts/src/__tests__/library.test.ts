import { describe, expect, it } from 'vitest';
import { DOCUMENT_CLASSES, documentClassById } from '@agiworkforce/types';
import {
  libraryResourceTypeFor,
  LibraryItemSchema,
  LibraryListQuerySchema,
  LibraryListResponseSchema,
  LIBRARY_DEFAULT_PAGE_SIZE,
  LIBRARY_KINDS,
  LIBRARY_MAX_PAGE_SIZE,
  LIBRARY_RESOURCE_TYPES,
} from '../library';

const mediaTypeOf = (id: string) => documentClassById(id)?.mediaTypes[0] ?? '';
const OFFICE_DOCX = mediaTypeOf('docx');
const OFFICE_XLSX = mediaTypeOf('xlsx');
const OFFICE_PPTX = mediaTypeOf('pptx');

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

describe('Library resource types', () => {
  it('gives every declared document class a resource type that is not the storage kind', () => {
    for (const documentClass of DOCUMENT_CLASSES) {
      const extension = documentClass.extensions[0] ?? documentClass.id;
      const resourceType = libraryResourceTypeFor({
        mime_type: documentClass.mediaTypes[0] ?? 'application/octet-stream',
        file_name: `sample.${extension}`,
      });
      expect(LIBRARY_RESOURCE_TYPES).toContain(resourceType);
      expect(resourceType).not.toBe('other');
      expect(LIBRARY_KINDS as readonly string[]).not.toContain(resourceType);
    }
  });

  it('separates documents, PDFs, spreadsheets and presentations', () => {
    const typeOf = (file_name: string, mime_type: string) =>
      libraryResourceTypeFor({ file_name, mime_type });
    expect(typeOf('brief.docx', OFFICE_DOCX)).toBe('document');
    expect(typeOf('brief.pdf', 'application/pdf')).toBe('pdf');
    expect(typeOf('numbers.xlsx', OFFICE_XLSX)).toBe('spreadsheet');
    expect(typeOf('numbers.csv', 'text/csv')).toBe('spreadsheet');
    expect(typeOf('deck.pptx', OFFICE_PPTX)).toBe('presentation');
  });

  it('keeps generated files and artifacts as their own types', () => {
    expect(
      libraryResourceTypeFor({
        file_name: 'chart',
        mime_type: 'application/octet-stream',
        origin: 'generated',
      }),
    ).toBe('generated_file');
    expect(
      libraryResourceTypeFor({
        file_name: 'dashboard.html',
        mime_type: 'text/html',
        surface: 'artifact',
      }),
    ).toBe('artifact');
  });

  it('reaches each of the six listable resource types the Library promises', () => {
    const promised = [
      'document',
      'pdf',
      'spreadsheet',
      'presentation',
      'generated_file',
      'artifact',
    ];
    for (const type of promised) expect(LIBRARY_RESOURCE_TYPES).toContain(type);
    expect(new Set(LIBRARY_RESOURCE_TYPES).size).toBe(LIBRARY_RESOURCE_TYPES.length);
  });

  it('accepts a resource-type filter on the list query and refuses an unknown one', () => {
    const parsed = LibraryListQuerySchema.parse({ resource_type: 'pdf,spreadsheet' });
    expect(parsed.resource_type).toEqual(['pdf', 'spreadsheet']);
    expect(LibraryListQuerySchema.safeParse({ resource_type: 'folder' }).success).toBe(false);
  });
});
