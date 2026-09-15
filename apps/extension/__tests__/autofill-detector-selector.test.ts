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

if (typeof globalThis.CSS === 'undefined') {
  (globalThis as Record<string, unknown>).CSS = {};
}
if (typeof CSS.escape !== 'function') {
  CSS.escape = (value: string) => value.replace(/([^\w-])/g, '\\$1');
}
import { uniqueCssSelector, detectJobApplication } from '../src/features/content/autofill/detector';

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

describe('label inference, whole words only', () => {
  it('does not read velocity as city, paypal as pay, statement as state, subtitle as title', () => {
    Object.defineProperty(window, 'location', {
      value: { href: 'https://jobs.lever.co/acme/1234/apply' },
      writable: true,
    });
    document.body.innerHTML = `
      <div class="application-form">
        <label for="f1">Velocity</label><input id="f1" />
        <label for="f2">PayPal handle</label><input id="f2" />
        <label for="f3">Statement</label><input id="f3" />
        <label for="f4">Subtitle</label><input id="f4" />
        <label for="f5">City</label><input id="f5" />
        <label for="f6">Job title</label><input id="f6" />
        <label for="f7">Expected salary</label><input id="f7" />
        <label for="f8">State</label><input id="f8" />
      </div>
    `;

    const keyBySelector = new Map(
      detectJobApplication().fields.map((field) => [field.selector, field.key]),
    );

    expect(keyBySelector.get('#f1')).toBeUndefined();
    expect(keyBySelector.get('#f2')).toBeUndefined();
    expect(keyBySelector.get('#f3')).toBeUndefined();
    expect(keyBySelector.get('#f4')).toBeUndefined();
    expect(keyBySelector.get('#f5')).toBe('locationCity');
    expect(keyBySelector.get('#f6')).toBe('currentTitle');
    expect(keyBySelector.get('#f7')).toBe('salaryExpectation');
    expect(keyBySelector.get('#f8')).toBe('locationState');
  });
});
