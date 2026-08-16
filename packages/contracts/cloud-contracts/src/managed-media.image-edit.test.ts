import { describe, expect, it } from 'vitest';

import { ManagedMediaImageGenerationRequestSchema } from './managed-media';

const SOURCE = { asset_id: '11111111-1111-4111-8111-111111111111' };
const MASK = { asset_id: '22222222-2222-4222-8222-222222222222' };

function parse(overrides: Record<string, unknown>) {
  return ManagedMediaImageGenerationRequestSchema.safeParse({
    prompt: 'a red bicycle',
    ...overrides,
  });
}

describe('managed image generation — operation validation', () => {
  it('defaults to plain text-to-image', () => {
    const result = parse({});
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.operation).toBe('generate');
  });

  it.each(['edit', 'inpaint', 'outpaint', 'variation'] as const)(
    'requires a source image for operation %s',
    (operation) => {
      const result = parse({ operation });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes('source_image'))).toBe(true);
      }
    },
  );

  it('rejects a source image sent with operation "generate"', () => {
    const result = parse({ operation: 'generate', source_image: SOURCE });
    expect(result.success).toBe(false);
  });

  it('requires a mask for inpaint', () => {
    const result = parse({ operation: 'inpaint', source_image: SOURCE });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('mask_image'))).toBe(true);
    }
  });

  it.each(['edit', 'variation'] as const)(
    'rejects a mask for operation %s rather than ignoring it',
    (operation) => {
      const result = parse({ operation, source_image: SOURCE, mask_image: MASK });
      expect(result.success).toBe(false);
    },
  );

  it('accepts a well-formed inpaint request', () => {
    const result = parse({ operation: 'inpaint', source_image: SOURCE, mask_image: MASK });
    expect(result.success).toBe(true);
  });

  it('accepts inline bytes as a source', () => {
    const result = parse({ operation: 'edit', source_image: { b64_json: 'aGVsbG8=' } });
    expect(result.success).toBe(true);
  });

  it('rejects a URL source, which would make the server fetch arbitrary hosts', () => {
    const result = parse({
      operation: 'edit',
      source_image: { url: 'https://attacker.example/image.png' },
    });
    expect(result.success).toBe(false);
  });

  it('carries the transparent-background flag', () => {
    const result = parse({ operation: 'edit', source_image: SOURCE, transparent_background: true });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.transparent_background).toBe(true);
  });
});
