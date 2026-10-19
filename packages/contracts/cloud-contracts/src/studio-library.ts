import { z } from 'zod';

export const STUDIO_LIBRARY_PATH = '/api/artifacts/library';

export function studioLibraryItemPath(itemId: string): string {
  return `${STUDIO_LIBRARY_PATH}/${encodeURIComponent(itemId)}`;
}

export const STUDIO_LIBRARY_KINDS = ['document_template', 'deck_template', 'brand'] as const;
export const StudioLibraryKindSchema = z.enum(STUDIO_LIBRARY_KINDS);
export type StudioLibraryKind = z.infer<typeof StudioLibraryKindSchema>;

export const StudioLibraryItemIdSchema = z.string().uuid();

const MAX_TEMPLATE_CHARS = 200_000;
const HEX = /^#[0-9a-f]{6}$/i;
const StudioLibraryFontSchema = z.enum(['sans', 'serif', 'mono']);

export const StudioLibraryTemplatePayloadSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().min(1).max(MAX_TEMPLATE_CHARS),
});
export type StudioLibraryTemplatePayload = z.infer<typeof StudioLibraryTemplatePayloadSchema>;

export const StudioLibraryBrandPayloadSchema = z.object({
  background: z.string().regex(HEX),
  text: z.string().regex(HEX),
  accent: z.string().regex(HEX),
  headingFont: StudioLibraryFontSchema,
  bodyFont: StudioLibraryFontSchema,
  voice: z.string().trim().max(2_000).default(''),
});
export type StudioLibraryBrandPayload = z.infer<typeof StudioLibraryBrandPayloadSchema>;

const StudioLibraryNameSchema = z.string().trim().min(1).max(120);

export const StudioLibraryItemCreateRequestSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('document_template'),
    name: StudioLibraryNameSchema,
    payload: StudioLibraryTemplatePayloadSchema,
  }),
  z.object({
    kind: z.literal('deck_template'),
    name: StudioLibraryNameSchema,
    payload: StudioLibraryTemplatePayloadSchema,
  }),
  z.object({
    kind: z.literal('brand'),
    name: StudioLibraryNameSchema,
    payload: StudioLibraryBrandPayloadSchema,
  }),
]);
export type StudioLibraryItemCreateRequest = z.infer<typeof StudioLibraryItemCreateRequestSchema>;
