/**
 * Tests for invisible-Unicode stripping + secret redaction in page-context
 * extraction (H-06 audit 2026-05-19).
 *
 * Self-review #1 audit 2026-05-19: stop mirroring. Import the production
 * `sanitizePageText` + `INVISIBLE_UNICODE_RE` from policy.ts so this test
 * uses the exact same regex and redactor chain as content.ts. The previous
 * mirror would silently pass against the wrong regex (the H-02 lesson).
 */

import { describe, expect, it } from 'vitest';
// Production functions — sanitizePageText runs the same Unicode strip +
// secret redaction the live extractor uses. INVISIBLE_UNICODE_RE is exposed
// for low-level assertions.
import { sanitizePageText, INVISIBLE_UNICODE_RE } from '../src/background/policy';

describe('INVISIBLE_UNICODE_RE — character class matches expected vectors', () => {
  it('matches a zero-width space', () => {
    expect('a​b'.match(INVISIBLE_UNICODE_RE)?.length).toBe(1);
  });

  it('does not match plain ASCII', () => {
    expect('hello'.match(INVISIBLE_UNICODE_RE)).toBeNull();
  });
});

describe('H-06 invisible-Unicode stripping in page text', () => {
  it('strips zero-width space (U+200B)', () => {
    expect(sanitizePageText('hello​world')).toBe('helloworld');
  });

  it('strips zero-width joiner (U+200D)', () => {
    expect(sanitizePageText('hello‍world')).toBe('helloworld');
  });

  it('strips zero-width no-break space / BOM (U+FEFF)', () => {
    expect(sanitizePageText('hello﻿world')).toBe('helloworld');
  });

  it('strips bidi override controls (U+202E)', () => {
    expect(sanitizePageText('user‮noLatin')).toBe('usernoLatin');
  });

  it('strips bidi isolation controls (U+2066-U+2069)', () => {
    expect(sanitizePageText('text⁦hidden⁩tail')).toBe('texthiddentail');
  });

  it('strips variation selectors (U+FE0F)', () => {
    expect(sanitizePageText('plain️')).toBe('plain');
  });

  it('strips Tag characters (U+E0001 — the ASCII-smuggling range)', () => {
    // U+E0001 LANGUAGE TAG, U+E0048 = "tag H"
    expect(sanitizePageText('hi\u{E0001}\u{E0048}there')).toBe('hithere');
  });

  it('strips a smuggled SYSTEM-prompt payload (Embrace The Red vector)', () => {
    // Visible: "Read the page". Hidden tag chars after spell out "SYSTEM".
    const visible = 'Read the page';
    const hidden = '\u{E0053}\u{E0059}\u{E0053}\u{E0054}\u{E0045}\u{E004D}';
    const result = sanitizePageText(visible + hidden);
    expect(result).toBe(visible);
    // No tag characters survive.
    for (const cp of [0xe0053, 0xe0059, 0xe0054, 0xe0045, 0xe004d]) {
      expect(result).not.toContain(String.fromCodePoint(cp));
    }
  });

  it('preserves normal ASCII and unicode text', () => {
    expect(sanitizePageText('Hello, 世界! 🌍')).toBe('Hello, 世界! 🌍');
  });
});

describe('H-06 secret redaction in page text', () => {
  it('redacts an Anthropic API key from page innerText', () => {
    const raw = 'API key:\nsk-ant-abcdefghijklmnopqrstuv\nmore text';
    expect(sanitizePageText(raw)).toContain('[REDACTED_ANTHROPIC_KEY]');
  });

  it('redacts a JWT in a copied curl example', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.aaaaaaaaaaaaa';
    const raw = `curl -H "Authorization: Bearer ${jwt}" https://api`;
    const out = sanitizePageText(raw);
    expect(out).toContain('[REDACTED_JWT]');
    expect(out).not.toContain(jwt);
  });

  it('redacts AWS keys', () => {
    const raw = 'AKIAIOSFODNN7EXAMPLE leaked in a Slack message';
    expect(sanitizePageText(raw)).toContain('[REDACTED_AWS_KEY]');
  });

  it('redacts a credit-card-shaped sequence', () => {
    const raw = 'Card 4111-1111-1111-1111 expires 12/27';
    const out = sanitizePageText(raw);
    expect(out).toContain('[REDACTED]');
    expect(out).not.toContain('4111-1111-1111-1111');
  });

  it('redacts a postgres connection string', () => {
    const raw = 'DATABASE_URL=postgres://user:secret@host:5432/db';
    expect(sanitizePageText(raw)).toContain('[CREDENTIALS_REDACTED]');
  });

  it('leaves benign text unchanged', () => {
    const raw = 'This is just an article about something innocuous.';
    expect(sanitizePageText(raw)).toBe(raw);
  });
});
