import { describe, expect, it } from 'vitest';
import {
  evalCheckPasses,
  promptTemplateVariables,
  renderPromptTemplate,
} from '@agiworkforce/cloud-contracts';

import { parseCasesCsv } from '../lib/cases-csv';
import { diffLines } from '../lib/text-diff';

describe('prompt templates', () => {
  it('finds each variable once and fills only the ones given', () => {
    const template = 'Classify {{ ticket }} for {{team}}. Again: {{ticket}} {{unknown}}';
    expect(promptTemplateVariables(template)).toEqual(['ticket', 'team', 'unknown']);
    expect(renderPromptTemplate(template, { ticket: 'Refund', team: 'Billing' })).toBe(
      'Classify Refund for Billing. Again: Refund {{unknown}}',
    );
  });

  it('checks exact and contains matches and skips cases with nothing expected', () => {
    expect(evalCheckPasses('exact', ' Billing \n', 'Billing')).toBe(true);
    expect(evalCheckPasses('exact', 'Billing team', 'Billing')).toBe(false);
    expect(evalCheckPasses('contains', 'Route to BILLING now', 'billing')).toBe(true);
    expect(evalCheckPasses('contains', 'Support', 'billing')).toBe(false);
    expect(evalCheckPasses('none', 'x', 'x')).toBeNull();
    expect(evalCheckPasses('exact', 'x', null)).toBeNull();
    expect(evalCheckPasses('exact', null, 'x')).toBeNull();
  });
});

describe('cases CSV', () => {
  it('reads quoted cells, commas and newlines, and the expected column', () => {
    const parsed = parseCasesCsv(
      '﻿ticket,expected\r\n"Refund, please","Billing"\n"Line one\nline two",\n',
    );
    expect(parsed).toEqual({
      ok: true,
      cases: [
        { variables: { ticket: 'Refund, please' }, expectedOutput: 'Billing' },
        { variables: { ticket: 'Line one\nline two' }, expectedOutput: null },
      ],
    });
  });

  it('refuses a file without cases or with a column a template cannot use', () => {
    expect(parseCasesCsv('ticket\n')).toMatchObject({ ok: false });
    expect(parseCasesCsv('my ticket\nx')).toMatchObject({ ok: false });
  });
});

describe('line diff', () => {
  it('marks added and removed lines around the shared ones', () => {
    expect(diffLines('a\nb\nc', 'a\nc\nd')).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'removed', text: 'b' },
      { kind: 'same', text: 'c' },
      { kind: 'added', text: 'd' },
    ]);
  });
});
