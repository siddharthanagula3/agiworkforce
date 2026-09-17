import { describe, expect, it } from 'vitest';

import { PROMPT_IDS, PROMPT_MANIFEST, isPromptId } from '../prompt-manifest';
import {
  parsePromptStamp,
  promptStamp,
  promptStampsFor,
  promptVersions,
  resolvePrompt,
  resolvePromptText,
} from '../prompt-registry';
import { isPromptStamp, normalizePromptStamps } from '../prompt-stamp';

describe('prompt manifest', () => {
  it('gives every prompt a pinned version it actually holds, and non-empty text', () => {
    for (const id of PROMPT_IDS) {
      const entry = PROMPT_MANIFEST[id];
      expect(entry.versions.length).toBeGreaterThan(0);
      expect(promptVersions(id)).toContain(entry.pinnedVersion);
      for (const version of entry.versions) {
        expect(version.version).toBeGreaterThanOrEqual(1);
        expect(version.text.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('numbers each prompt version once', () => {
    for (const id of PROMPT_IDS) {
      const numbers = promptVersions(id);
      expect(new Set(numbers).size).toBe(numbers.length);
    }
  });

  it('uses ids that are legal feature-flag keys, so an A/B needs no second namespace', () => {
    for (const id of PROMPT_IDS) {
      expect(`prompt.${id}`).toMatch(/^[a-z][a-z0-9_]*([.:-][a-z0-9_]+)*$/);
      expect(`prompt.${id}`.length).toBeLessThanOrEqual(120);
    }
  });

  it('recognises its own ids and nothing else', () => {
    expect(isPromptId('support.system')).toBe(true);
    expect(isPromptId('support.does_not_exist')).toBe(false);
    expect(isPromptId('toString')).toBe(false);
  });
});

describe('resolvePrompt', () => {
  it('serves the pinned version when no variant selects another', () => {
    const resolved = resolvePrompt('support.system');
    expect(resolved.version).toBe(PROMPT_MANIFEST['support.system'].pinnedVersion);
    expect(resolved.selectedBy).toBe('pinned');
    expect(resolved.stamp).toBe(promptStamp('support.system', resolved.version));
    expect(resolved.text).toBe(resolvePromptText('support.system'));
  });

  it('serves the variant version when one is selected', () => {
    const resolved = resolvePrompt('support.system', { variants: { 'support.system': 1 } });
    expect(resolved.version).toBe(1);
    expect(resolved.selectedBy).toBe('variant');
  });

  it('falls back to the pin rather than failing when a variant names a withdrawn version', () => {
    const resolved = resolvePrompt('research.system', { variants: { 'research.system': 99 } });
    expect(resolved.version).toBe(PROMPT_MANIFEST['research.system'].pinnedVersion);
    expect(resolved.selectedBy).toBe('pinned');
  });

  it('stamps every prompt a turn used', () => {
    const stamps = promptStampsFor(['support.system', 'research.system']);
    expect(stamps).toHaveLength(2);
    for (const stamp of stamps) expect(isPromptStamp(stamp)).toBe(true);
  });
});

describe('prompt stamps', () => {
  it('round-trips a stamp', () => {
    expect(parsePromptStamp('support.system@1')).toEqual({ id: 'support.system', version: 1 });
  });

  it('refuses a stamp that names no manifest prompt', () => {
    expect(parsePromptStamp('support.invented@1')).toBeNull();
    expect(parsePromptStamp('support.system')).toBeNull();
    expect(parsePromptStamp('support.system@0')).toBeNull();
  });

  it('drops anything that is not a stamp before it reaches a ledger column', () => {
    expect(normalizePromptStamps(['support.system@2', 'nonsense', '', 'support.system@2'])).toEqual(
      ['support.system@2'],
    );
    expect(normalizePromptStamps(null)).toEqual([]);
  });

  it('bounds how many stamps one row can carry', () => {
    const many = Array.from({ length: 40 }, (_, index) => `support.system@${index + 1}`);
    expect(normalizePromptStamps(many)).toHaveLength(16);
  });
});
