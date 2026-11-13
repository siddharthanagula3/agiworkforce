// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildBubbleWithTools } from '../src/features/side-panel/bubbles';
import {
  hydrateStoredChatMessage,
  type SidePanelChatMessage,
} from '../src/features/side-panel/chat-state';
import {
  buildFollowUps,
  followUpTargetFor,
  followUpsPath,
  readFollowUpSuggestions,
} from '../src/features/side-panel/followUps';
import { renderMarkdownInto } from '../src/features/side-panel/markdown';
import { createScrollPin } from '../src/features/side-panel/scrollPin';
import type { ConversationEntry } from '../src/features/background/conversation-history';

const mermaidRender = vi.hoisted(() => vi.fn());

vi.mock('mermaid', () => ({
  default: { initialize: vi.fn(), render: mermaidRender },
}));

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const panelSource = readFileSync(join(APP_ROOT, 'src', 'side_panel.ts'), 'utf8');
const catalog = JSON.parse(
  readFileSync(join(APP_ROOT, '_locales', 'en', 'messages.json'), 'utf8'),
) as Record<string, { message: string; placeholders?: Record<string, { content: string }> }>;

function getMessage(key: string, substitutions: string[] = []): string {
  const entry = catalog[key];
  if (!entry) return '';
  return entry.message.replace(/\$([A-Za-z0-9_]+)\$/g, (_match, name: string) =>
    (entry.placeholders?.[name.toLowerCase()]?.content ?? '').replace(
      /\$(\d)/g,
      (_digit, index: string) => substitutions[Number(index) - 1] ?? '',
    ),
  );
}

function cssRule(selector: string): string | null {
  const start = panelSource.indexOf(`    ${selector} {`);
  return start === -1 ? null : panelSource.slice(start, panelSource.indexOf('}', start));
}

beforeEach(() => {
  (globalThis as { chrome?: unknown }).chrome = {
    i18n: { getMessage, getUILanguage: () => 'en' },
  };
});

afterEach(() => {
  mermaidRender.mockReset();
  document.body.replaceChildren();
});

describe('answers render like the web', () => {
  it('draws a finished mermaid block as a diagram image with its source one click away', async () => {
    mermaidRender.mockResolvedValue({
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40" width="100%"><text>A</text></svg>',
    });
    const root = document.createElement('div');
    document.body.append(root);

    await renderMarkdownInto(root, '```mermaid\nflowchart TD\n  A --> B\n```');

    const image = root.querySelector<HTMLImageElement>('.sp-mermaid img');
    expect(image?.getAttribute('src')).toMatch(/^data:image\/svg\+xml;charset=utf-8,/u);
    expect(decodeURIComponent(image?.getAttribute('src') ?? '')).toContain('width="120"');
    expect(image?.alt).toBe('Diagram');
    const block = root.querySelector<HTMLElement>('.sp-code-block');
    expect(block?.hidden).toBe(true);
    root.querySelector<HTMLButtonElement>('.sp-mermaid__toggle')?.click();
    expect(block?.hidden).toBe(false);
  });

  it('keeps a mermaid block that is still streaming as source', async () => {
    const root = document.createElement('div');
    await renderMarkdownInto(root, '```mermaid\nflowchart TD\n  A --> ');

    expect(mermaidRender).not.toHaveBeenCalled();
    expect(root.querySelector('.sp-mermaid')).toBeNull();
  });

  it('shows task list items as read-only checkboxes', async () => {
    const root = document.createElement('div');
    await renderMarkdownInto(root, '- [x] Write the draft\n- [ ] Send it\n- plain item');

    const boxes = [...root.querySelectorAll<HTMLInputElement>('li input[type="checkbox"]')];
    expect(boxes.map((box) => box.checked)).toEqual([true, false]);
    expect(boxes.every((box) => box.disabled)).toBe(true);
    expect(root.textContent).not.toContain('[x]');
    expect(root.textContent).not.toContain('[ ]');
    expect(root.querySelectorAll('li.sp-task-item')).toHaveLength(2);
  });
});

describe('a stopped answer', () => {
  const stopped = (overrides: Partial<SidePanelChatMessage> = {}): SidePanelChatMessage => ({
    id: 'a1',
    role: 'assistant',
    content: 'Partial answer',
    timestamp: 0,
    userStopped: true,
    ...overrides,
  });

  it('says it was stopped and offers to try again, as the web does', () => {
    const onRegenerate = vi.fn();
    const bubble = buildBubbleWithTools(stopped(), { onRegenerate });

    expect(bubble.textContent).toContain('Response stopped.');
    const retry = bubble.querySelector<HTMLButtonElement>('.sp-bubble-retry-btn');
    retry?.click();
    expect(onRegenerate).toHaveBeenCalledWith('a1');
  });

  it('keeps the notice after the chat is reopened', () => {
    const hydrated = hydrateStoredChatMessage(
      { role: 'assistant', content: 'Partial answer', timestamp: 0, userStopped: true },
      'a1',
    );
    expect(buildBubbleWithTools(hydrated).textContent).toContain('Response stopped.');
  });

  it('shows no notice on an answer that finished', () => {
    expect(buildBubbleWithTools(stopped({ userStopped: false })).textContent).not.toContain(
      'Response stopped.',
    );
  });
});

describe('the usage banner', () => {
  it('uses the amber warning tone for the critical state, never the danger tone', () => {
    const critical = cssRule("#sp-usage-warning[data-severity='critical']");
    expect(critical).toContain('var(--agi-ext-warning-bg)');
    expect(critical).toContain('var(--agi-ext-warning-text)');
    expect(panelSource).not.toMatch(/#sp-usage-warning[^{]*\{[^}]*--agi-ext-danger/u);
  });
});

describe('reopening a chat', () => {
  it('stays on the latest message while answers above it finish rendering', () => {
    const observers: Array<() => void> = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          observers.push(callback);
        }
        observe(): void {}
        disconnect(): void {}
      },
    );
    const container = document.createElement('div');
    container.append(document.createElement('div'));
    let height = 1000;
    let top = 0;
    Object.defineProperty(container, 'scrollHeight', { get: () => height });
    Object.defineProperty(container, 'clientHeight', { get: () => 400 });
    Object.defineProperty(container, 'scrollTop', {
      get: () => top,
      set: (value: number) => {
        top = Math.min(value, height - 400);
      },
    });

    createScrollPin(container).toEnd();
    expect(top).toBe(600);

    height = 1800;
    for (const notify of observers) notify();
    expect(top).toBe(1400);

    top = 200;
    container.dispatchEvent(new Event('scroll'));
    height = 2400;
    for (const notify of observers) notify();
    expect(top).toBe(200);
    vi.unstubAllGlobals();
  });
});

describe('follow-up suggestions', () => {
  const entry = (
    overrides: Partial<ConversationEntry['messages'][number]> = {},
  ): ConversationEntry =>
    ({
      id: 'local-1',
      owner: { accountId: 'u1', organizationId: null },
      title: 'Chat',
      savedAt: 0,
      routing: { selectedModel: 'auto' },
      cloudSync: { conversationId: '0b8b2f43-8b8a-4f7c-9a55-3a5d0e4b7c11' },
      messages: [
        { role: 'user', content: 'Plan a trip', timestamp: 0 },
        {
          role: 'assistant',
          content: 'Here is a plan.',
          timestamp: 1,
          cloudMessageId: '5f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f',
          cloudSyncedAt: 2,
          cloudSyncedChars: 15,
          ...overrides,
        },
      ],
    }) as unknown as ConversationEntry;

  it('asks the server about the stored answer by its cloud ids', () => {
    const target = followUpTargetFor(entry());
    expect(target?.mirrored).toBe(true);
    expect(followUpsPath(target!)).toBe(
      '/api/chat/conversations/0b8b2f43-8b8a-4f7c-9a55-3a5d0e4b7c11/messages/5f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f/follow-ups',
    );
  });

  it('reports a turn the mirror has not delivered yet, and skips stopped or failed answers', () => {
    expect(followUpTargetFor(entry({ cloudSyncedAt: undefined }))?.mirrored).toBe(false);
    expect(followUpTargetFor(entry({ cloudSyncedChars: 4 }))?.mirrored).toBe(false);
    expect(followUpTargetFor(entry({ cloudMessageId: undefined }))).toBeNull();
    expect(followUpTargetFor(entry({ userStopped: true }))).toBeNull();
    expect(followUpTargetFor(entry({ error: true }))).toBeNull();
  });

  it('shows at most three questions and sends the one chosen', () => {
    const suggestions = readFollowUpSuggestions({
      suggestions: ['One?', 'Two?', ' ', 'Three?', 'Four?', 5],
    });
    expect(suggestions).toEqual(['One?', 'Two?', 'Three?']);
    const onSelect = vi.fn();
    const group = buildFollowUps(suggestions, onSelect);
    expect(group.getAttribute('aria-label')).toBe('Suggested follow-ups');
    const buttons = group.querySelectorAll<HTMLButtonElement>('button');
    expect(buttons[1]?.getAttribute('aria-label')).toBe('Ask: Two?');
    buttons[1]?.click();
    expect(onSelect).toHaveBeenCalledWith('Two?');
  });
});
