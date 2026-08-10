import { describe, expect, it } from 'vitest';

import { FindingSchema, SCHEMA_VERSION, safeParseFinding } from '../schema.js';
import { makeFinding } from './helpers.js';

describe('FindingSchema v1', () => {
  it('accepts a fully-populated finding and applies defaults', () => {
    const finding = makeFinding();
    expect(finding.schema_version).toBe(SCHEMA_VERSION);
    expect(finding.deterministic_evidence).toEqual([]);
    expect(finding.suppression).toBeNull();
    expect(finding.autofixability).toBe('review-required');
    expect(finding.input_tokens).toBe(0);
  });

  it('rejects a wrong schema_version', () => {
    const finding = makeFinding();
    const result = FindingSchema.safeParse({ ...finding, schema_version: 2 });
    expect(result.success).toBe(false);
  });

  it('rejects out-of-range confidence', () => {
    const finding = makeFinding();
    expect(FindingSchema.safeParse({ ...finding, confidence: 1.5 }).success).toBe(false);
    expect(FindingSchema.safeParse({ ...finding, confidence: -0.1 }).success).toBe(false);
  });

  it('rejects an unknown severity and category', () => {
    const finding = makeFinding();
    expect(FindingSchema.safeParse({ ...finding, severity: 'urgent' }).success).toBe(false);
    expect(FindingSchema.safeParse({ ...finding, category: 'vibes' }).success).toBe(false);
  });

  it('rejects a malformed fingerprint', () => {
    const finding = makeFinding();
    expect(FindingSchema.safeParse({ ...finding, fingerprint: 'not-a-hash' }).success).toBe(false);
  });

  it('safeParseFinding reports readable errors instead of throwing', () => {
    const result = safeParseFinding({ title: 'missing everything' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('finding_id');
  });
});
