import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderMarkdownInto } from '../src/features/side-panel/markdown';

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(APP_ROOT, 'src', 'side_panel.ts'), 'utf8');

const catalog = JSON.parse(
  readFileSync(join(APP_ROOT, '_locales', 'en', 'messages.json'), 'utf8'),
) as Record<string, { message: string }>;

function cssRule(selector: string): string {
  const start = source.indexOf(`    ${selector} {`);
  expect(start, `${selector} rule`).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf('}', start));
}

beforeEach(() => {
  (globalThis as { chrome?: unknown }).chrome = {
    i18n: {
      getMessage: (key: string) => catalog[key]?.message ?? '',
      getUILanguage: () => 'en',
    },
  };
});

describe('assistant answer layout at side-panel widths', () => {
  it('keeps table words whole and lets the table scroll instead', () => {
    const cells = cssRule('.sp-bubble-assistant td');
    expect(cells).toContain('overflow-wrap: normal;');
    expect(cells).toContain('word-break: normal;');
    expect(cssRule('.sp-bubble-assistant table')).toContain('overflow-x: auto;');
  });

  it('makes a scrollable code block reachable and named for keyboard and screen reader users', async () => {
    const root = document.createElement('div');
    await renderMarkdownInto(root, '```ts\nconst a = 1;\n```');
    const pre = root.querySelector<HTMLPreElement>('.sp-code-block > pre');
    expect(pre?.tabIndex).toBe(0);
    expect(pre?.getAttribute('role')).toBe('region');
    expect(pre?.getAttribute('aria-label')).toBe('Code block');
  });
});

describe('message action row', () => {
  it('never splits the timestamp or model label when the copy status needs room', () => {
    expect(cssRule('.sp-bubble-actions')).toContain('flex-wrap: wrap;');
    expect(cssRule('.sp-timestamp')).toContain('white-space: nowrap;');
    expect(cssRule('.sp-answer-meta')).toContain('white-space: nowrap;');
  });

  it('keeps the user timestamp on the bubble edge while the action buttons stay hidden', () => {
    expect(cssRule('.sp-msg-user .sp-timestamp')).toContain('order: 1;');
  });

  it('gives the copy and retry icons a pointer target of at least 24px without growing the row', () => {
    const rule = cssRule('.sp-copy-btn');
    expect(rule).toContain('min-width: 24px;');
    expect(rule).toContain('min-height: 24px;');
    expect(rule).toContain('margin-block: -4px;');
  });
});

describe('recent chats list', () => {
  it('keeps the row menu beside the title instead of wrapping under it', () => {
    const open = cssRule('.sp-drawer-history-open');
    expect(open).toContain('flex: 1 1 0;');
    expect(open).not.toContain('width: 100%;');
  });
});

describe('composer and header at narrow widths', () => {
  it('lets the model selector shrink so it cannot overlap the permission chip', () => {
    expect(source).toContain('.sp-composer-controls-start { flex: 0 0 auto; }');
    expect(source).toContain(
      '.sp-composer-controls-end { flex: 1 1 0; justify-content: flex-end; }',
    );
    expect(cssRule('#sp-model-effort-badge')).toContain('flex-shrink: 100;');
  });

  it('lists the matching models before the effort and mode toggles while the catalogue is open', () => {
    const start = source.indexOf('function renderModelDropdown(): void {');
    const end = source.indexOf('function renderModelTrigger(): void {');
    const body = source.slice(start, end);
    expect(body).toMatch(/if \(!modelCatalogueOpen\) \{\n\s+appendSettings\(\);\n\s+return;/);
    expect(body.lastIndexOf('appendSettings();')).toBeGreaterThan(
      body.indexOf('modelGroupHeading(providerKey)'),
    );
    expect(body.match(/appendEffortSection\(\);/g)).toHaveLength(1);
  });

  it('truncates the one-line model guidance instead of cutting it at the menu edge', () => {
    const rule = cssRule('.sp-model-option-sublabel');
    expect(rule).toContain('overflow: hidden;');
    expect(rule).toContain('text-overflow: ellipsis;');
  });

  it('gives the conversation title menu trigger and its row a pointer target of at least 24px', () => {
    expect(cssRule('.sp-drawer-history-more')).toContain('width: var(--control-sm);');
    expect(cssRule('.sp-drawer-history-more')).toContain('height: var(--control-sm);');
    expect(cssRule('#sp-title-row')).toContain('min-height: var(--control-md);');
  });
});

describe('onboarding disclosures', () => {
  it('puts each disclosure label on its own line above its body, as a summary of its details', () => {
    const welcome = readFileSync(
      join(APP_ROOT, 'src', 'features', 'onboarding', 'welcome-page.ts'),
      'utf8',
    );
    expect(welcome).toContain("el('summary', {}, disclosure.label)");
    expect(welcome).toContain("el('p', { class: 'wl-text' }, disclosure.body)");
  });
});
