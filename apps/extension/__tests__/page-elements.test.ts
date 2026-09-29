import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fillPageFields,
  findPageElements,
  watchPasswordFields,
} from '../src/features/content/pageElements';

beforeEach(() => {
  if (typeof globalThis.CSS?.escape !== 'function') {
    vi.stubGlobal('CSS', {
      escape: (value: string) => value.replace(/[^a-zA-Z0-9_-]/gu, (char) => `\\${char}`),
    });
  }
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 100,
    height: 20,
    top: 0,
    left: 0,
    right: 100,
    bottom: 20,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('browser_find', () => {
  it('never names a field after the text a user typed into it', () => {
    document.body.innerHTML = `
      <textarea id="note">my private draft</textarea>
      <div contenteditable="true" id="editor">secret words</div>
      <div role="textbox" id="rich">typed text</div>
      <input id="email" placeholder="Email" value="me@example.com" />
      <button>Send</button>`;

    const found = findPageElements();
    const text = JSON.stringify(found);

    expect(text).not.toContain('my private draft');
    expect(text).not.toContain('secret words');
    expect(text).not.toContain('typed text');
    expect(text).not.toContain('me@example.com');
    expect(found.find((entry) => entry.selector === '#email')?.name).toBe('Email');
    expect(found.some((entry) => entry.name === 'Send')).toBe(true);
  });

  it('labels a field by its label element without the field inside it', () => {
    document.body.innerHTML = `<label>City <input name="city" value="Paris" /></label>`;
    const [field] = findPageElements();
    expect(field?.name).toBe('City');
    expect(JSON.stringify(field)).not.toContain('Paris');
  });
});

describe('browser_fill_form', () => {
  it.each([
    ['<input id="f" autocomplete="billing cc-number" />'],
    ['<input id="f" autocomplete="section-x cc-csc" />'],
    ['<input id="f" autocomplete="one-time-code" />'],
    ['<input id="f" autocomplete="username current-password" />'],
    ['<input id="f" name="cardNumber" />'],
    ['<input id="f" name="cvv" />'],
    ['<input id="f" aria-label="Enter your PIN" />'],
    ['<input id="f" placeholder="SSN" />'],
    ['<input id="f" type="password" />'],
  ])('refuses a sensitive field: %s', (markup) => {
    document.body.innerHTML = markup;
    const outcome = fillPageFields([{ selector: '#f', value: '1234' }]);
    expect(outcome.filled).toEqual([]);
    expect(outcome.failed[0]?.reason).toMatch(/fill it in themselves/);
  });

  it('refuses a field that was a password before the page revealed it', async () => {
    document.body.innerHTML = '<input id="f" type="password" />';
    watchPasswordFields();
    document.getElementById('f')?.setAttribute('type', 'text');
    await Promise.resolve();

    const outcome = fillPageFields([{ selector: '#f', value: 'hunter2' }]);
    expect(outcome.filled).toEqual([]);
  });

  it('refuses hidden, disabled and read-only fields', () => {
    document.body.innerHTML = `
      <input id="hidden" style="display:none" />
      <input id="disabled" disabled />
      <input id="readonly" readonly />
      <input id="ok" name="city" />`;

    const outcome = fillPageFields([
      { selector: '#hidden', value: 'x' },
      { selector: '#disabled', value: 'x' },
      { selector: '#readonly', value: 'x' },
      { selector: '#ok', value: 'Paris' },
    ]);

    expect(outcome.filled).toEqual(['#ok']);
    expect(outcome.failed.map((failure) => failure.selector)).toEqual([
      '#hidden',
      '#disabled',
      '#readonly',
    ]);
    expect((document.getElementById('ok') as HTMLInputElement).value).toBe('Paris');
  });
});
