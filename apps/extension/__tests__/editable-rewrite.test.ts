import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import catalog from '../_locales/en/messages.json';
import { EditableRewriteController } from '../src/features/side-panel/editableRewrite';
import type { EditableSelectionResponse } from '../src/types';

const OWNER = { accountId: 'account-a', authIncarnation: 'session-a' };
const TARGET = {
  id: '11111111-1111-4111-8111-111111111111',
  tabId: 7,
  url: 'https://example.com/editor',
  documentId: 'document-a',
  label: 'Message',
  selectedText: 'rough words',
  owner: OWNER,
};

function message(key: string, substitutions: string[] = []): string {
  const entry = (
    catalog as Record<
      string,
      { message: string; placeholders?: Record<string, { content: string }> }
    >
  )[key];
  if (!entry) return '';
  return entry.message.replace(/\$([A-Za-z0-9_]+)\$/g, (_match, name: string) =>
    (entry.placeholders?.[name.toLowerCase()]?.content ?? '').replace(
      /\$(\d)/g,
      (_digit, index: string) => substitutions[Number(index) - 1] ?? '',
    ),
  );
}

beforeEach(() => {
  vi.stubGlobal('chrome', { i18n: { getMessage: message, getUILanguage: () => 'en' } });
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    },
  });
});

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
});

function setup() {
  const context = { owner: { ...OWNER }, conversationId: 'conversation-a', streaming: false };
  const send = vi.fn(async (): Promise<EditableSelectionResponse> => ({
    success: true,
    verified: true,
    applied: true,
    undoAvailable: true,
  }));
  const changed = vi.fn();
  const controller = new EditableRewriteController({ context: () => context, send, changed });
  controller.stage(TARGET);
  controller.bind('answer-a', TARGET);
  const row = controller.renderAction('answer-a', 'clear wording')!;
  document.body.appendChild(row);
  const open = () =>
    Array.from(row.querySelectorAll('button'))
      .find((button) => button.textContent === 'Edit draft')!
      .click();
  return { controller, context, send, changed, row, open };
}

function button(dialog: HTMLDialogElement, label: string): HTMLButtonElement {
  const result = Array.from(dialog.querySelectorAll('button')).find(
    (entry) => entry.textContent === label,
  );
  if (!result) throw new Error(`Missing dialog action ${label}`);
  return result;
}

function historyRefresh(controller: EditableRewriteController) {
  const source = readFileSync(resolve(process.cwd(), 'src/side_panel.ts'), 'utf8');
  const program = ts.createSourceFile('side_panel.ts', source, ts.ScriptTarget.Latest, true);
  const refresh = program.statements.find(
    (node) =>
      ts.isFunctionDeclaration(node) && node.name?.text === 'refreshOpenAccountChatOnReturn',
  );
  if (!refresh) throw new Error('Production account history refresh was not found');
  const openStoredConversation = vi.fn();
  const dependencies = {
    managedCloudChatState: 'ready',
    _ctx: {
      isStreaming: false,
      temporaryChat: false,
      messages: [{ role: 'assistant', content: 'Draft' }],
      pendingPageContext: null,
      conversationId: 'conversation-a',
    },
    activePersistenceEntry: {
      id: 'conversation-a',
      cloudSync: { conversationId: 'cloud-conversation-a' },
    },
    editableRewrites: controller,
    OPEN_CHAT_REFRESH_ON_RETURN_MS: 10_000,
    openStoredConversation,
  };
  const compiled = ts.transpileModule(
    `let lastOpenChatRefreshOnReturn = 0;\nlet tabCleanupInProgress = false;\n${refresh.getText(program)}\nreturn { run: refreshOpenAccountChatOnReturn, setTabCleanupPending: (value) => { tabCleanupInProgress = value; } };`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
  );
  // llm-guardrail-allow: executes repository-owned refresh admission in this isolated fixture.
  const api = new Function(...Object.keys(dependencies), compiled.outputText)(
    ...Object.values(dependencies),
  ) as { run(): void; setTabCleanupPending(value: boolean): void };
  return { ...api, openStoredConversation };
}

describe('inline rewrite review controls', () => {
  it('defers history refresh while a native tab cleanup selection is pending', () => {
    const h = setup();
    h.controller.cancel();
    const refresh = historyRefresh(h.controller);
    refresh.setTabCleanupPending(true);
    refresh.run();
    expect(refresh.openStoredConversation).not.toHaveBeenCalled();
    refresh.setTabCleanupPending(false);
    refresh.run();
    expect(refresh.openStoredConversation).toHaveBeenCalledWith('conversation-a');
  });

  it('retains the live draft when returning to the panel and refreshes after cancellation', () => {
    const h = setup();
    const refresh = historyRefresh(h.controller);
    refresh.run();
    expect(refresh.openStoredConversation).not.toHaveBeenCalled();
    h.controller.cancel();
    refresh.run();
    expect(refresh.openStoredConversation).toHaveBeenCalledWith('conversation-a');
  });

  it('retains Undo across panel returns and allows history refresh after restoration', async () => {
    const h = setup();
    h.row.querySelector<HTMLButtonElement>('button')!.click();
    await vi.waitFor(() => expect(h.controller.current()).toBeNull());
    const refresh = historyRefresh(h.controller);
    refresh.run();
    expect(refresh.openStoredConversation).not.toHaveBeenCalled();
    h.send.mockResolvedValueOnce({ success: true, verified: true });
    h.controller
      .renderAction('answer-a', 'clear wording')!
      .querySelector<HTMLButtonElement>('button')!
      .click();
    await vi.waitFor(() => expect(h.controller.hasActiveEdits()).toBe(false));
    refresh.run();
    expect(refresh.openStoredConversation).toHaveBeenCalledOnce();
  });

  it('shows the original and editable proposal, and Cancel makes no write', () => {
    const h = setup();
    expect(h.controller.renderChip()?.textContent).toContain('Writing to Message');
    h.open();
    const dialog = document.querySelector('dialog')!;
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
    expect(dialog.querySelector('pre')?.textContent).toBe('rough words');
    expect(dialog.querySelector('textarea')?.value).toBe('clear wording');
    expect(document.activeElement).toBe(dialog.querySelector('textarea'));
    button(dialog, 'Cancel').click();
    expect(document.querySelector('dialog')).toBeNull();
    expect(h.send).not.toHaveBeenCalled();
  });

  it('inserts exactly the reviewed draft and offers Undo only after verified success', async () => {
    const h = setup();
    h.open();
    const dialog = document.querySelector('dialog')!;
    dialog.querySelector('textarea')!.value = 'My reviewed wording';
    button(dialog, 'Insert').click();
    await vi.waitFor(() => expect(dialog.textContent).toContain('Inserted and verified.'));
    expect(h.send).toHaveBeenCalledWith({
      type: 'APPLY_EDITABLE_SELECTION',
      tabId: 7,
      pageUrl: TARGET.url,
      documentId: TARGET.documentId,
      selectionId: TARGET.id,
      text: 'My reviewed wording',
      owner: OWNER,
    });
    expect(button(dialog, 'Insert').disabled).toBe(true);
    expect(button(dialog, 'Undo insertion').hidden).toBe(false);
    expect(h.controller.current()).toBeNull();
    h.send.mockResolvedValueOnce({ success: true, verified: true });
    button(dialog, 'Undo insertion').click();
    await vi.waitFor(() => expect(dialog.textContent).toContain('Original text restored.'));
    expect(h.send).toHaveBeenLastCalledWith({
      type: 'UNDO_EDITABLE_SELECTION',
      tabId: 7,
      pageUrl: TARGET.url,
      documentId: TARGET.documentId,
      selectionId: TARGET.id,
      owner: OWNER,
    });
    expect(button(dialog, 'Undo insertion').hidden).toBe(true);
  });

  it('reports stale-source refusal and does not show Inserted', async () => {
    const h = setup();
    h.send.mockResolvedValueOnce({ success: false, error: 'The field changed while drafting.' });
    h.open();
    const dialog = document.querySelector('dialog')!;
    button(dialog, 'Insert').click();
    await vi.waitFor(() => expect(dialog.textContent).toContain('field changed'));
    expect(dialog.textContent).not.toContain('Inserted and verified.');
    expect(h.controller.current()?.id).toBe(TARGET.id);
  });

  it('marks an altered insertion as applied and offers a guarded Undo', async () => {
    const h = setup();
    h.send.mockResolvedValueOnce({
      success: false,
      applied: true,
      verified: false,
      undoAvailable: true,
      error: 'The editor changed the inserted draft.',
    });
    h.open();
    const dialog = document.querySelector('dialog')!;
    button(dialog, 'Insert').click();
    await vi.waitFor(() => expect(dialog.textContent).toContain('editor changed'));
    expect(button(dialog, 'Insert').disabled).toBe(true);
    expect(button(dialog, 'Undo insertion').hidden).toBe(false);
  });

  it('inserts and undoes directly from the reply without a confirmation dialog', async () => {
    const h = setup();
    h.row.querySelector<HTMLButtonElement>('button')!.click();
    await vi.waitFor(() => expect(h.controller.current()).toBeNull());
    expect(document.querySelector('dialog')).toBeNull();
    expect(h.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'APPLY_EDITABLE_SELECTION', text: 'clear wording' }),
    );
    const row = h.controller.renderAction('answer-a', 'clear wording')!;
    document.body.appendChild(row);
    h.send.mockResolvedValueOnce({ success: true, verified: true });
    row.querySelector<HTMLButtonElement>('button')!.click();
    await vi.waitFor(() =>
      expect(h.send).toHaveBeenLastCalledWith(
        expect.objectContaining({ type: 'UNDO_EDITABLE_SELECTION' }),
      ),
    );
    expect(document.querySelector('dialog')).toBeNull();
  });

  it('hides writes during a running turn and after source or account changes', () => {
    const h = setup();
    h.context.streaming = true;
    expect(h.controller.renderAction('answer-a', 'draft')).toBeNull();
    h.context.streaming = false;
    h.context.owner = { ...OWNER, accountId: 'account-b' };
    expect(h.controller.renderAction('answer-a', 'draft')).toBeNull();
    expect(h.controller.current()).toBeNull();
    h.context.owner = OWNER;
    h.controller.invalidateTab(7);
    expect(h.controller.current()).toBeNull();
    expect(h.controller.renderAction('answer-a', 'draft')).toBeNull();
  });

  it('removes a pending preview when the account changes before its response', async () => {
    const h = setup();
    let resolve!: (value: EditableSelectionResponse) => void;
    h.send.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    h.open();
    const dialog = document.querySelector('dialog')!;
    button(dialog, 'Insert').click();
    h.context.owner = { ...OWNER, authIncarnation: 'new-session' };
    resolve({ success: true, verified: true, applied: true });
    await vi.waitFor(() => expect(document.querySelector('dialog')).toBeNull());
  });
});
