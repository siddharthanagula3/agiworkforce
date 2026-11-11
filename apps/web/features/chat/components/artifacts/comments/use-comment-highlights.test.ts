import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { commentUiProps, findTextRange, readRangeContext } from './use-comment-highlights';

let host: HTMLDivElement;

function mount(html: string): HTMLDivElement {
  host.innerHTML = html;
  return host;
}

function paragraphs(): HTMLElement[] {
  return [...host.querySelectorAll<HTMLElement>('p')];
}

const POLICY = `
  <h2>Domestic policy</h2><p>Approval is required.</p>
  <h2>International policy</h2><p>Approval is required.</p>
`;

describe('findTextRange', () => {
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    host.remove();
  });

  it('resolves the later of two identical passages from its stored context', () => {
    mount(POLICY);
    const range = findTextRange(host, 'Approval is required.', {
      prefix: 'International policy',
      suffix: '',
    });
    expect(range?.startContainer.parentElement).toBe(paragraphs()[1]);
    expect(range?.toString()).toBe('Approval is required.');
  });

  it('still resolves the first of two identical passages', () => {
    mount(POLICY);
    const range = findTextRange(host, 'Approval is required.', {
      prefix: 'Domestic policy',
      suffix: 'International policy',
    });
    expect(range?.startContainer.parentElement).toBe(paragraphs()[0]);
  });

  it('matches a context saved from markdown source against the rendered text', () => {
    mount(POLICY);
    const range = findTextRange(host, 'Approval is required.', {
      prefix: '## Domestic policy\n\n',
      suffix: '\n\n## International policy\n\nApproval is required.',
    });
    expect(range?.startContainer.parentElement).toBe(paragraphs()[0]);
  });

  it('refuses to guess between identical passages when the context cannot tell them apart', () => {
    mount(POLICY);
    expect(findTextRange(host, 'Approval is required.')).toBeNull();
    expect(
      findTextRange(host, 'Approval is required.', { prefix: 'Unrelated heading', suffix: '' }),
    ).toBeNull();
  });

  it('keeps resolving a unique passage without any context', () => {
    mount('<p>Ship the beta in March.</p><p>Review the budget.</p>');
    expect(findTextRange(host, 'the   budget')?.toString()).toBe('the budget');
    expect(findTextRange(host, 'Review the budget.')?.toString()).toBe('Review the budget.');
  });

  it('ignores the comment panel text that sits inside the same container', () => {
    mount(
      `<p>Approval is required.</p><aside ${Object.keys(commentUiProps)[0]}=""><blockquote>"Approval is required."</blockquote></aside>`,
    );
    const range = findTextRange(host, 'Approval is required.');
    expect(range?.startContainer.parentElement).toBe(paragraphs()[0]);
  });
});

describe('readRangeContext', () => {
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    host.remove();
  });

  it('reads the rendered text around the selected occurrence, not the first match', () => {
    mount(POLICY);
    const second = paragraphs()[1]!.firstChild as Text;
    const range = document.createRange();
    range.setStart(second, 0);
    range.setEnd(second, second.data.length);

    const context = readRangeContext(host, range);

    expect(context.before.trimEnd().endsWith('International policy')).toBe(true);
    expect(context.before).toContain('Domestic policy');
    expect(context.after.trim()).toBe('');
  });

  it('leaves out text that belongs to the comment panel', () => {
    mount(`<p>Alpha beta</p><div ${Object.keys(commentUiProps)[0]}="">Panel words</div>`);
    const text = host.querySelector('p')!.firstChild as Text;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 5);

    expect(readRangeContext(host, range)).toEqual({ before: '', after: ' beta' });
  });
});
