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
  // Allow inline images to carry `data:` / `blob:` sources in addition to the
  // default http(s). Tool-returned and model-generated images frequently arrive
  // as base64 `data:` URIs or same-origin `blob:` object URLs; the default
  // rehype-sanitize protocol list (http/https/mailto/tel) silently strips those,
  // so the `<img>` vanished entirely. `data:`/`blob:` image sources cannot
  // execute script, so widening the `src` protocol list here is safe and is the
  // enabler for the raster-image render path. `href` is deliberately left on the
  // stricter default list so links can't smuggle `data:` payloads.
  protocols: {
    ...defaultSchema.protocols,
    src: [...(defaultSchema.protocols?.['src'] ?? []), 'data', 'blob'],
  },
  attributes: {
    ...defaultSchema.attributes,
    img: [
      ...(defaultSchema.attributes?.['img'] ?? []),
      // `loading` enables native lazy-loading; `alt`/`title`/`src` are already
      // in the default allow-list. No event-handler attributes are permitted.
      'loading',
    ],
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
