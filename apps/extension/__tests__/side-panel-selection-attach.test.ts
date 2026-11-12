// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareSelectionContext } from '../src/features/side-panel/tabContext';
import catalog from '../_locales/en/messages.json';

const source = readFileSync(resolve(process.cwd(), 'src/side_panel.ts'), 'utf8');
const program = ts.createSourceFile('side_panel.ts', source, ts.ScriptTarget.Latest, true);

function declaration(name: string): string {
  const node = program.statements.find(
    (statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  );
  if (!node) throw new Error(`Production function ${name} was not found`);
  return node.getText(program);
}

const TAB = { id: 7, url: 'https://example.com/guide' };

function text(key: string, substitutions: string[] = []): string {
  const message = (catalog as Record<string, { message: string }>)[key]?.message ?? key;
  return message.replace(/\$[A-Z]+\$/, substitutions[0] ?? '');
}

type ScriptResult = { text: string; truncated: boolean } | 'form-field' | null;

function setup(options: { streaming?: boolean; result?: ScriptResult } = {}) {
  const ctx = {
    isStreaming: options.streaming ?? false,
    conversationGeneration: 1,
    pendingPageContext: null as string | null,
    pendingPageContextSource: null as unknown,
  };
  const offer = { id: 'offer-a' };
  const editableRewrites = {
    current: vi.fn(() => offer as { id: string } | null),
    cancel: vi.fn(() => {
      offer.id = '';
    }),
  };
  const executeScript = vi.fn(async () => [{ result: options.result ?? null }]);
  vi.stubGlobal('chrome', {
    tabs: { query: vi.fn(async () => [TAB]) },
    scripting: { executeScript },
  });
  const dependencies = {
    managedCloudChatState: 'ready',
    _ctx: ctx,
    activePageQuery: async () => ({ active: true }),
    pageChipLabel: () => 'example.com',
    isUserBlockedSite: async () => false,
    evaluateSiteAccess: async () => ({ allowed: true }),
    t: text,
    readVisibleSelection: () => null,
    MAX_PAGE_TEXT_CHARACTERS: 1000,
    PAGE_CONTEXT_BLOCKED_REASON: 'blocked',
    prepareSelectionContext,
    editableRewrites,
    updateAttachmentPreview: vi.fn(),
    updateContextButton: vi.fn(),
  };
  const compiled = ts.transpileModule(
    `let pendingSelectionText = null;\nlet pendingBrowserContextTabs = [];\nlet composerContextNotice = null;\n${declaration('showSelectionNotice')}\n${declaration('attachPageSelection')}\nreturn { run: attachPageSelection, notice: () => composerContextNotice };`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
  );
  // llm-guardrail-allow: executes repository-owned attach code inside this isolated fixture.
  const api = new Function(...Object.keys(dependencies), compiled.outputText)(
    ...Object.values(dependencies),
  ) as { run(): Promise<void>; notice(): string | null };
  return { ...api, ctx, editableRewrites, executeScript };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('adding selected text to the composer', () => {
  it('keeps a pending rewrite offer when the page has no selection', async () => {
    const h = setup({ result: null });
    await h.run();
    expect(h.notice()).toBe('Select some text on the page first.');
    expect(h.editableRewrites.cancel).not.toHaveBeenCalled();
  });

  it('keeps a pending rewrite offer when the selection is inside a form field', async () => {
    const h = setup({ result: 'form-field' });
    await h.run();
    expect(h.notice()).toBe("Text in a form field can't be added. Select text on the page itself.");
    expect(h.editableRewrites.cancel).not.toHaveBeenCalled();
  });

  it('ends the rewrite offer only once the selection is attached', async () => {
    const h = setup({ result: { text: 'Quarterly revenue grew.', truncated: false } });
    await h.run();
    expect(h.ctx.pendingPageContext).toBe('Quarterly revenue grew.');
    expect(h.editableRewrites.cancel).toHaveBeenCalledOnce();
  });

  it('says why nothing happened while a reply is streaming, and keeps the offer', async () => {
    const h = setup({ streaming: true, result: { text: 'Late passage.', truncated: false } });
    await h.run();
    expect(h.notice()).toBe('Wait for the reply to finish, then add the selected text.');
    expect(h.executeScript).not.toHaveBeenCalled();
    expect(h.editableRewrites.cancel).not.toHaveBeenCalled();
    expect(h.ctx.pendingPageContext).toBeNull();
  });

  it('says so when a reply starts while the page is being read', async () => {
    const h = setup({ result: { text: 'Passage read in time.', truncated: false } });
    h.executeScript.mockImplementationOnce(async () => {
      h.ctx.isStreaming = true;
      return [{ result: { text: 'Passage read in time.', truncated: false } }];
    });
    await h.run();
    expect(h.notice()).toBe('Wait for the reply to finish, then add the selected text.');
    expect(h.ctx.pendingPageContext).toBeNull();
    expect(h.editableRewrites.cancel).not.toHaveBeenCalled();
  });
});
