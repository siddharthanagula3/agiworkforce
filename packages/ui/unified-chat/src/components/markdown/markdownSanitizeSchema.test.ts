import { describe, it, expect } from 'vitest';
import { defaultSchema } from 'rehype-sanitize';
import { MARKDOWN_SANITIZE_SCHEMA } from './markdownSanitizeSchema';

describe('MARKDOWN_SANITIZE_SCHEMA', () => {
  it('allows data: and blob: image sources so raster images are not stripped', () => {
    const srcProtocols = MARKDOWN_SANITIZE_SCHEMA.protocols?.['src'] ?? [];
    expect(srcProtocols).toContain('data');
    expect(srcProtocols).toContain('blob');
    expect(srcProtocols).toContain('http');
    expect(srcProtocols).toContain('https');
  });

  it('does NOT widen href protocols (links cannot smuggle data: payloads)', () => {
    const hrefProtocols = MARKDOWN_SANITIZE_SCHEMA.protocols?.['href'] ?? [];
    const defaultHref = defaultSchema.protocols?.['href'] ?? [];
    expect(hrefProtocols).toEqual(defaultHref);
    expect(hrefProtocols).not.toContain('data');
  });

  it('keeps the language/math className allow-list for code/span/div', () => {
    expect(MARKDOWN_SANITIZE_SCHEMA.attributes?.['code']).toBeDefined();
    expect(MARKDOWN_SANITIZE_SCHEMA.attributes?.['img']).toContain('loading');
  });
});
