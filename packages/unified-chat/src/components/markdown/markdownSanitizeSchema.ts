import { defaultSchema, type Options as SanitizeSchema } from 'rehype-sanitize';

/**
 * Shared rehype-sanitize schema for chat markdown renderers.
 *
 * AUDIT-FIX (CRITICAL #31 / HIGH #30): MarkdownContent and
 * EnhancedMarkdownRenderer ran rehype-raw with NO sanitizer, so raw HTML in
 * assistant/tool output (`<img onerror>`, `<script>`, …) became live DOM on
 * the chat render path. Every renderer that includes rehypeRaw MUST place
 * rehypeSanitize(MARKDOWN_SANITIZE_SCHEMA) immediately after it, BEFORE
 * rehype-highlight / rehype-katex, so those plugins' generated classNames
 * and markup are not stripped.
 *
 * The schema is GitHub's defaultSchema plus the `language-*` / `math-*`
 * classes the pipeline relies on.
 */
export const MARKDOWN_SANITIZE_SCHEMA: SanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
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
