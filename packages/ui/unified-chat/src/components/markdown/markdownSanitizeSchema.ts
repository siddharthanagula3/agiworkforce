import { defaultSchema, type Options as SanitizeSchema } from 'rehype-sanitize';

const RESPONSIVE_IMAGE_TAGS: ReadonlySet<string> = new Set(['picture', 'source']);

export const MARKDOWN_SANITIZE_SCHEMA: SanitizeSchema = {
  ...defaultSchema,
  tagNames: (defaultSchema.tagNames ?? []).filter((tag) => !RESPONSIVE_IMAGE_TAGS.has(tag)),
  protocols: {
    ...defaultSchema.protocols,
    src: [...(defaultSchema.protocols?.['src'] ?? []), 'data', 'blob'],
  },
  attributes: {
    ...defaultSchema.attributes,
    img: [...(defaultSchema.attributes?.['img'] ?? []), 'loading'],
    input: [...(defaultSchema.attributes?.['input'] ?? []), 'checked'],
    code: [
      ...(defaultSchema.attributes?.['code'] ?? []),
      ['className', /^language-./, 'math-inline', 'math-display'],
    ],
    span: [
      ...(defaultSchema.attributes?.['span'] ?? []),
      ['className', /^language-./, 'math-inline', 'math-display'],
    ],
    div: [
      ...(defaultSchema.attributes?.['div'] ?? []),
      ['className', /^language-./, 'math-inline', 'math-display'],
    ],
  },
};
