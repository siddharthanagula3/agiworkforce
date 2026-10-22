/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getWebviewContent } from '../features/sidebar-webview/webviewContent';
import { vscodeApiStub } from './vscodeApiStub';

function boot(): ReturnType<typeof vi.fn> {
  const html = getWebviewContent(
    {
      cspSource: 'vscode-webview://mock',
      asWebviewUri: (uri: { toString(): string }) => ({ toString: () => uri.toString() }),
    } as never,
    { toString: () => 'file:///mock/extension', fsPath: '/mock/extension' } as never,
    'test-nonce-base64url-32-chars-abcdef',
    'auto',
    'medium',
    true,
    false,
    'pro',
    false,
    'queue',
  );
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  document.head.innerHTML = parsed.head.innerHTML;
  document.body.innerHTML = parsed.body.innerHTML;
  const postMessage = vi.fn();
  Object.defineProperty(globalThis, 'acquireVsCodeApi', {
    configurable: true,
    value: () => vscodeApiStub({ postMessage }),
  });
  const inline = Array.from(parsed.querySelectorAll('script')).find((script) =>
    script.textContent?.includes('acquireVsCodeApi()'),
  );
  // llm-guardrail-allow: executes repository-owned webview JavaScript in jsdom
  new Function(inline?.textContent ?? '')();
  postMessage.mockClear();
  return postMessage;
}

function deliver(data: unknown): void {
  window.dispatchEvent(new MessageEvent('message', { data }));
}

function openPanel(): void {
  (document.getElementById('slashBtn') as HTMLButtonElement).click();
}

function filter(): HTMLInputElement {
  return document.getElementById('slashFilter') as HTMLInputElement;
}

function typeFilter(value: string): void {
  filter().value = value;
  filter().dispatchEvent(new Event('input'));
}

function actionLabels(): string[] {
  return Array.from(document.querySelectorAll('.slash-menu-action-label')).map(
    (node) => node.textContent ?? '',
  );
}

function sectionLabels(title: string): string[] {
  const heading = Array.from(document.querySelectorAll('.slash-menu-heading')).find(
    (node) => node.textContent === title,
  );
  return Array.from(heading?.parentElement?.querySelectorAll('.slash-menu-action-label') ?? []).map(
    (node) => node.textContent ?? '',
  );
}

function clickAction(label: string): void {
  const row = Array.from(document.querySelectorAll<HTMLButtonElement>('.slash-menu-action')).find(
    (node) => node.querySelector('.slash-menu-action-label')?.textContent === label,
  );
  if (row === undefined) throw new Error(`no action row labelled ${label}`);
  row.click();
}

const messagesOfType = (post: ReturnType<typeof vi.fn>, type: string) =>
  post.mock.calls.map((call) => call[0]).filter((message) => message?.type === type);

describe('the slash popover opened from the composer button', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'acquireVsCodeApi');
    vi.restoreAllMocks();
  });

  it('shows a filter field and Context then Model sections in the reference order', () => {
    boot();
    openPanel();

    expect(filter().hidden).toBe(false);
    expect(filter().placeholder).toBe('Filter actions…');
    expect(
      Array.from(document.querySelectorAll('.slash-menu-heading')).map((node) => node.textContent),
    ).toEqual(['Context', 'Model', 'Commands']);
    expect(sectionLabels('Context')).toEqual([
      'Attach file…',
      'Mention file from this project…',
      'Clear conversation',
      'Rewind',
      'Developer session history',
    ]);
    expect(sectionLabels('Model')).toEqual(['Switch model…', 'Effort', 'Mode', 'Account & usage…']);
    expect(document.activeElement).toBe(filter());
  });

  it('shows the current model, effort and mode at the right of their rows', () => {
    boot();
    deliver({ type: 'model', payload: { model: 'Sonnet' } });
    deliver({ type: 'modeChanged', payload: { mode: 'plan' } });
    deliver({
      type: 'effortChanged',
      payload: { effort: 'high', supportsEffort: true, efforts: ['low', 'medium', 'high'] },
    });
    openPanel();

    const values = Array.from(document.querySelectorAll('.slash-menu-action')).map((row) => [
      row.querySelector('.slash-menu-action-label')?.textContent,
      row.querySelector('.slash-menu-action-value')?.textContent,
    ]);
    expect(values).toContainEqual(['Switch model…', 'Sonnet']);
    expect(values).toContainEqual(['Effort', 'High']);
    expect(values).toContainEqual(['Mode', 'Plan']);
  });

  it('leaves out the Effort row for a model that takes no effort', () => {
    boot();
    deliver({ type: 'effortChanged', payload: { effort: 'medium', supportsEffort: false } });
    openPanel();

    expect(sectionLabels('Model')).toEqual(['Switch model…', 'Mode', 'Account & usage…']);
  });

  it('has no Thinking or flagged-model control', () => {
    boot();
    openPanel();

    expect(document.getElementById('slashMenu')?.textContent).not.toMatch(/thinking|flagged/iu);
  });

  it('narrows the actions as the filter is typed and drops empty sections', () => {
    boot();
    deliver({
      type: 'slashCommands',
      payload: { items: [{ name: '/model', description: 'Choose the model' }] },
    });
    openPanel();
    typeFilter('Clear');

    expect(actionLabels()).toEqual(['Clear conversation']);
    expect(
      Array.from(document.querySelectorAll('.slash-menu-heading')).map((node) => node.textContent),
    ).toEqual(['Context']);
  });

  it('matches commands on their description as well as their name', () => {
    boot();
    deliver({
      type: 'slashCommands',
      payload: {
        items: [
          { name: '/model', description: 'Choose the model' },
          { name: '/status', description: 'Session, model, context and plan usage' },
        ],
      },
    });
    openPanel();
    typeFilter('plan usage');

    expect(actionLabels()).toEqual([]);
    expect(
      Array.from(document.querySelectorAll('.slash-menu-item-name')).map(
        (node) => node.textContent,
      ),
    ).toEqual(['/status']);
  });

  it('says so when nothing matches the filter', () => {
    boot();
    deliver({
      type: 'slashCommands',
      payload: { items: [{ name: '/model', description: 'Choose the model' }] },
    });
    openPanel();
    typeFilter('zzzz');

    expect(document.querySelector('.slash-menu-empty')?.textContent).toBe('No matching action');
  });

  it('runs the first match on Enter and closes', () => {
    const post = boot();
    openPanel();
    typeFilter('Clear');
    filter().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(messagesOfType(post, 'newChat')).toHaveLength(1);
    expect(document.getElementById('slashMenu')?.classList.contains('open')).toBe(false);
  });

  it('moves from the filter into the rows with the arrow keys and closes on Escape', () => {
    boot();
    openPanel();
    filter().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement?.textContent).toContain('Attach file…');

    filter().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.getElementById('slashMenu')?.classList.contains('open')).toBe(false);
  });

  it('posts the host message each Context row stands for', () => {
    const post = boot();

    openPanel();
    clickAction('Attach file…');
    expect(messagesOfType(post, 'openFilePicker')).toHaveLength(1);

    openPanel();
    clickAction('Clear conversation');
    expect(messagesOfType(post, 'newChat')).toHaveLength(1);

    openPanel();
    clickAction('Rewind');
    expect(messagesOfType(post, 'runSlashCommand')).toEqual([
      expect.objectContaining({ payload: { name: '/rewind' } }),
    ]);

    openPanel();
    clickAction('Account & usage…');
    expect(messagesOfType(post, 'openAccount')).toHaveLength(1);
  });

  it('opens the sessions sheet from Developer session history', () => {
    boot();
    openPanel();
    clickAction('Developer session history');

    expect((document.getElementById('sessionsSheet') as HTMLElement).hidden).toBe(false);
  });

  it('starts a file mention by putting an @ in the composer', () => {
    boot();
    const composer = document.getElementById('userInput') as HTMLTextAreaElement;
    composer.value = 'look at';
    openPanel();
    clickAction('Mention file from this project…');

    expect(composer.value).toBe('look at @');
    expect(document.activeElement).toBe(composer);
  });

  it('opens the model and controls popovers from their rows', () => {
    const post = boot();
    openPanel();
    clickAction('Switch model…');
    expect(messagesOfType(post, 'openModelPopover')).toHaveLength(1);
    expect(document.getElementById('modelPopover')?.classList.contains('open')).toBe(true);

    openPanel();
    expect(document.getElementById('modelPopover')?.classList.contains('open')).toBe(false);
    clickAction('Mode');
    expect(document.getElementById('controlsPopover')?.classList.contains('open')).toBe(true);
  });

  it('does not clear text the user typed when a command is picked from the panel', () => {
    const post = boot();
    deliver({
      type: 'slashCommands',
      payload: { items: [{ name: '/status', description: 'Session status' }] },
    });
    const composer = document.getElementById('userInput') as HTMLTextAreaElement;
    composer.value = '/draft notes';
    openPanel();
    (document.querySelector('.slash-menu-item') as HTMLButtonElement).click();

    expect(composer.value).toBe('/draft notes');
    expect(messagesOfType(post, 'runSlashCommand')).toEqual([
      expect.objectContaining({ payload: { name: '/status' } }),
    ]);
  });

  it('closes when another composer popover opens', () => {
    boot();
    openPanel();
    (document.getElementById('plusBtn') as HTMLButtonElement).click();

    expect(document.getElementById('slashMenu')?.classList.contains('open')).toBe(false);
  });

  it('keeps the typed list flat, without the filter or headings', () => {
    boot();
    deliver({
      type: 'slashCommands',
      payload: { items: [{ name: '/clear', description: 'Start a new chat' }] },
    });
    const composer = document.getElementById('userInput') as HTMLTextAreaElement;
    composer.value = '/cl';
    composer.dispatchEvent(new Event('input'));

    expect(filter().hidden).toBe(true);
    expect(document.querySelectorAll('.slash-menu-heading')).toHaveLength(0);
    expect(document.querySelectorAll('.slash-menu-action')).toHaveLength(0);
    expect(document.querySelectorAll('.slash-menu-item')).toHaveLength(1);
  });
});
