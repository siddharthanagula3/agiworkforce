/**
 * autofill-detector-selector.test.ts
 *
 * Regression for CHR-LINKEDIN-SELECTOR-WRONG: detector.ts selectorFor() emitted
 * `input:nth-of-type(idx+1)` using an index into a MIXED input/textarea/select
 * array. `:nth-of-type` counts position among siblings of the same tag, so the
 * index pointed at the wrong element. The fix builds a `:nth-child` path
 * (uniqueCssSelector) that resolves uniquely from the document.
 *
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest';
import { uniqueCssSelector } from '../src/features/content/autofill/detector';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('uniqueCssSelector, mixed-tag container', () => {
  it('resolves to the intended field in a mixed input/textarea/select set', () => {
    const container = document.createElement('div');
    container.id = 'apply-form';
    const input1 = document.createElement('input');
    const textarea = document.createElement('textarea');
    const select = document.createElement('select');
    const input2 = document.createElement('input');
    container.append(input1, textarea, select, input2);
    document.body.appendChild(container);

    for (const el of [input1, textarea, select, input2]) {
      const sel = uniqueCssSelector(el);
      expect(document.querySelector(sel)).toBe(el);
    }

    const sel1 = uniqueCssSelector(input1);
    const sel2 = uniqueCssSelector(input2);
    expect(sel1).not.toBe(sel2);
    expect(document.querySelector(sel1)).toBe(input1);
    expect(document.querySelector(sel2)).toBe(input2);
    expect(sel2).toContain(':nth-child(4)');
  });

  it('prefers an ancestor id and still resolves uniquely', () => {
    const outer = document.createElement('section');
    outer.id = 'linkedin-easy-apply';
    const row = document.createElement('div');
    const field = document.createElement('input');
    row.appendChild(field);
    outer.appendChild(row);
    document.body.appendChild(outer);

    const sel = uniqueCssSelector(field);
    expect(sel).toContain('#linkedin-easy-apply');
    expect(document.querySelector(sel)).toBe(field);
  });
});
