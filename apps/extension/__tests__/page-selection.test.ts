// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { MAX_PAGE_TEXT_CHARACTERS } from '../src/features/content/in-page-panel/pageActions';
import {
  prepareSelectionContext,
  readVisibleSelection,
} from '../src/features/side-panel/tabContext';

function select(from: Node, fromOffset: number, to: Node, toOffset: number): void {
  const range = document.createRange();
  range.setStart(from, fromOffset);
  range.setEnd(to, toOffset);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
}

function selectContents(element: Element): void {
  const range = document.createRange();
  range.selectNodeContents(element);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
}

afterEach(() => {
  window.getSelection()?.removeAllRanges();
  document.body.replaceChildren();
  delete (Element.prototype as Partial<Element>).checkVisibility;
});

describe('reading the highlighted passage on a page', () => {
  it('returns only the highlighted part of the text', () => {
    document.body.innerHTML = '<p id="p">The quick brown fox jumps.</p>';
    const text = document.getElementById('p')!.firstChild!;
    select(text, 4, text, 15);
    expect(readVisibleSelection(1_000)).toEqual({ text: 'quick brown', truncated: false });
  });

  it('keeps paragraph breaks between blocks', () => {
    document.body.innerHTML = '<div id="root"><p>First line.</p><p>Second line.</p></div>';
    selectContents(document.getElementById('root')!);
    expect(readVisibleSelection(1_000)?.text).toBe('First line.\nSecond line.');
  });

  it('leaves out text the reader cannot see', () => {
    document.body.innerHTML =
      '<div id="root"><p>Shown.</p><p hidden>Hidden attribute.</p>' +
      '<p aria-hidden="true">Aria hidden.</p><p class="invisible">Styled away.</p>' +
      '<script>var secret = 1;</script><p>Also shown.</p></div>';
    (Element.prototype as Element & { checkVisibility: () => boolean }).checkVisibility = function (
      this: Element,
    ) {
      return !this.classList.contains('invisible');
    };
    selectContents(document.getElementById('root')!);
    expect(readVisibleSelection(1_000)?.text).toBe('Shown.\nAlso shown.');
  });

  it('reads nothing while focus is in a form field', () => {
    document.body.innerHTML =
      '<p id="p">Visible copy</p><input id="secret" type="password" value="hunter2" />';
    selectContents(document.getElementById('p')!);
    document.getElementById('secret')!.focus();
    expect(readVisibleSelection(1_000)).toBeNull();
  });

  it('reports text highlighted inside a form field without reading it', () => {
    document.body.innerHTML = '<textarea id="draft">Dear team, rough words here</textarea>';
    const field = document.getElementById('draft') as HTMLTextAreaElement;
    field.focus();
    field.setSelectionRange(11, 22);
    expect(readVisibleSelection(1_000)).toBe('form-field');
  });

  it('reports a highlight inside a password field the same way', () => {
    document.body.innerHTML = '<input id="secret" type="password" value="hunter2" />';
    const field = document.getElementById('secret') as HTMLInputElement;
    field.focus();
    field.setSelectionRange(0, 4);
    expect(readVisibleSelection(1_000)).toBe('form-field');
  });

  it('reads nothing from a focused form field that holds no highlight', () => {
    document.body.innerHTML = '<textarea id="draft">Dear team</textarea>';
    const field = document.getElementById('draft') as HTMLTextAreaElement;
    field.focus();
    field.setSelectionRange(3, 3);
    expect(readVisibleSelection(1_000)).toBeNull();
  });

  it('reads nothing when nothing is highlighted', () => {
    document.body.innerHTML = '<p id="p">Copy</p>';
    expect(readVisibleSelection(1_000)).toBeNull();
  });

  it('caps a long passage and says so', () => {
    document.body.innerHTML = `<p id="p">${'a'.repeat(50)}</p>`;
    selectContents(document.getElementById('p')!);
    expect(readVisibleSelection(10)).toEqual({ text: 'a'.repeat(10), truncated: true });
  });
});

describe('preparing a passage to send', () => {
  it('redacts secrets and strips invisible characters', () => {
    const prepared = prepareSelectionContext(
      { text: 'Deploy with AKIAIOSFODNN7EXAMPLE now​', truncated: false },
      'https://example.com/docs',
    );
    expect(prepared?.text).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(prepared?.text).not.toContain('​');
    expect(prepared?.text.startsWith('Deploy with')).toBe(true);
  });

  it('bounds the passage to the page context budget', () => {
    const prepared = prepareSelectionContext(
      { text: 'b'.repeat(MAX_PAGE_TEXT_CHARACTERS + 50), truncated: false },
      'https://example.com/',
    );
    expect(prepared!.text.length).toBeLessThanOrEqual(MAX_PAGE_TEXT_CHARACTERS);
    expect(prepared!.truncated).toBe(true);
  });

  it('refuses a passage from a page that is not an ordinary website', () => {
    expect(
      prepareSelectionContext({ text: 'x', truncated: false }, 'chrome://settings'),
    ).toBeNull();
    expect(
      prepareSelectionContext({ text: 'x', truncated: false }, 'https://user:pw@example.com/'),
    ).toBeNull();
    expect(prepareSelectionContext({ text: '   ', truncated: false }, 'https://a.com/')).toBeNull();
  });
});
