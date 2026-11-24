import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMessageQueue, LANE_CAP, QueueFullError } from '@agiworkforce/client-runtime';
import { isImeComposingKey } from '@agiworkforce/unified-chat/ime-composition';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/side_panel.ts'),
  'utf8',
);
const program = ts.createSourceFile('side_panel.ts', source, ts.ScriptTarget.Latest, true);
const functions = program.statements
  .filter(
    (node) =>
      ts.isFunctionDeclaration(node) &&
      [
        'submitComposerText',
        'sendNextFollowUp',
        'restoreTurnToComposer',
        'composerAvailableForContext',
      ].includes(node.name?.text ?? ''),
  )
  .map((node) => node.getText(program))
  .join('\n');
const queueState = source.slice(
  source.indexOf('const followUpQueue = createMessageQueue();'),
  source.indexOf('function canQueueFollowUp('),
);

function harness() {
  const queue = createMessageQueue();
  const dependencies = {
    createMessageQueue: () => queue,
    canAdmitComposerMessage: vi.fn(() => true),
    canQueueFollowUp: vi.fn(() => false),
    sendMessage: vi.fn<(text: string) => boolean>(() => true),
    QueueFullError,
    LANE_CAP,
    t: vi.fn((key: string) => key),
    updateAttachmentPreview: vi.fn(),
    replaceComposerText: (input: HTMLTextAreaElement, text: string) => {
      input.value = text;
    },
    _ctx: { pendingPageContext: null },
    pendingBrowserContextTabs: [],
    pendingAttachmentCount: vi.fn(() => 0),
    composerAttachmentIntakes: new Set(),
    composerVideoMode: false,
    composerSkill: null,
  };
  const compiled = ts.transpileModule(
    `${queueState}\nlet composerContextNotice = null;\n${functions}\nreturn { submitComposerText, sendNextFollowUp, restoreTurnToComposer, notice: () => composerContextNotice };`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
  ).outputText;
  // llm-guardrail-allow: runs only repository-owned TypeScript functions in this isolated unit fixture.
  const api = new Function(...Object.keys(dependencies), compiled)(
    ...Object.values(dependencies),
  ) as {
    submitComposerText(text: string): boolean;
    sendNextFollowUp(): void;
    restoreTurnToComposer(message: { content: string }): void;
    notice(): string | null;
  };
  return { ...dependencies, ...api, queue };
}

describe('retry when the earlier message needs attachments again', () => {
  afterEach(() => document.body.replaceChildren());

  it('keeps a new draft instead of overwriting it with the previous prompt', () => {
    document.body.innerHTML = '<textarea id="sp-input">New draft</textarea>';
    const h = harness();

    h.restoreTurnToComposer({ content: 'Earlier prompt' });

    expect(document.querySelector('textarea')?.value).toBe('New draft');
    expect(h.notice()).toBe('spRetryKeepDraft');
  });

  it('keeps attachments staged for another turn even when its draft text is empty', () => {
    document.body.innerHTML = '<textarea id="sp-input"></textarea>';
    const h = harness();
    h.pendingAttachmentCount.mockReturnValue(1);

    h.restoreTurnToComposer({ content: 'Earlier prompt' });

    expect(document.querySelector('textarea')?.value).toBe('');
    expect(h.notice()).toBe('spRetryKeepDraft');
  });

  it('restores the earlier prompt into an empty composer', () => {
    document.body.innerHTML = '<textarea id="sp-input"></textarea>';
    const h = harness();

    h.restoreTurnToComposer({ content: 'Earlier prompt' });

    expect(document.querySelector('textarea')?.value).toBe('Earlier prompt');
    expect(h.notice()).toBe('spRetryNeedsAttachments');
  });
});

describe('composer synchronous admission retention', () => {
  it.each([false, true])('propagates the send result %s without modifying raw text', (admitted) => {
    const h = harness();
    h.sendMessage.mockReturnValue(admitted);
    expect(h.submitComposerText('  draft  ')).toBe(admitted);
    expect(h.sendMessage).toHaveBeenCalledWith('  draft  ');
    expect(h.queue.size()).toBe(0);
  });

  it('does not turn unknown send failures into known refusals', () => {
    const h = harness();
    const error = new Error('unknown outcome');
    h.sendMessage.mockImplementation(() => {
      throw error;
    });
    expect(() => h.submitComposerText('draft')).toThrow(error);
  });

  it('accepts queued text only when enqueue succeeds', () => {
    const h = harness();
    h.canAdmitComposerMessage.mockReturnValue(false);
    h.canQueueFollowUp.mockReturnValue(true);
    expect(h.submitComposerText('  next  ')).toBe(true);
    expect(h.queue.peek()?.value).toBe('next');
    expect(h.sendMessage).not.toHaveBeenCalled();
    for (let index = 1; index < LANE_CAP; index++) {
      h.queue.enqueue({ value: `queued ${index}`, mode: 'prompt' });
    }
    expect(h.submitComposerText('overflow')).toBe(false);
    expect(h.queue.size()).toBe(LANE_CAP);
    expect(h.updateAttachmentPreview).toHaveBeenCalledOnce();
  });

  it('refuses without enqueue when neither admission nor queueing is available', () => {
    const h = harness();
    h.canAdmitComposerMessage.mockReturnValue(false);
    expect(h.submitComposerText('draft')).toBe(false);
    expect(h.queue.size()).toBe(0);
    expect(h.sendMessage).not.toHaveBeenCalled();
  });
});

describe('queued follow-up synchronous admission retention', () => {
  it('preserves the exact refused item and FIFO order', () => {
    const h = harness();
    const first = h.queue.enqueue({ value: 'first', mode: 'prompt' });
    const second = h.queue.enqueue({ value: 'second', mode: 'prompt' });
    h.sendMessage.mockReturnValue(false);
    h.sendNextFollowUp();
    expect(h.queue.getSnapshot()).toEqual([first, second]);
    expect(h.queue.peek()).toBe(first);
    h.sendMessage.mockReturnValue(true);
    h.sendNextFollowUp();
    expect(h.queue.peek()).toBe(second);
    expect(h.sendMessage.mock.calls).toEqual([['first'], ['first']]);
  });

  it('does not remove a blocked head or send a later item', () => {
    const h = harness();
    const first = h.queue.enqueue({ value: 'first', mode: 'prompt' });
    h.queue.enqueue({ value: 'second', mode: 'prompt' });
    h.canAdmitComposerMessage.mockReturnValue(false);
    h.sendNextFollowUp();
    expect(h.queue.peek()).toBe(first);
    expect(h.sendMessage).not.toHaveBeenCalled();
  });

  it('does not automatically replay an unknown thrown outcome and unlocks the next send', () => {
    const h = harness();
    h.queue.enqueue({ value: 'unknown', mode: 'prompt' });
    const second = h.queue.enqueue({ value: 'second', mode: 'prompt' });
    const error = new Error('unknown outcome');
    h.sendMessage.mockImplementationOnce(() => {
      throw error;
    });
    expect(() => h.sendNextFollowUp()).toThrow(error);
    expect(h.queue.peek()).toBe(second);
    h.sendNextFollowUp();
    expect(h.sendMessage.mock.calls).toEqual([['unknown'], ['second']]);
    expect(h.queue.size()).toBe(0);
  });

  it('suppresses recursive dispatch while the original item remains queued', () => {
    const h = harness();
    const first = h.queue.enqueue({ value: 'first', mode: 'prompt' });
    const second = h.queue.enqueue({ value: 'second', mode: 'prompt' });
    h.sendMessage.mockImplementation(() => {
      expect(h.queue.peek()).toBe(first);
      h.sendNextFollowUp();
      return true;
    });
    h.sendNextFollowUp();
    expect(h.sendMessage).toHaveBeenCalledOnce();
    expect(h.queue.peek()).toBe(second);
  });

  it.each([false, true])(
    'does not resurrect cleared items or consume replacement on %s',
    (admitted) => {
      const h = harness();
      h.queue.enqueue({ value: 'old', mode: 'prompt' });
      h.sendMessage.mockImplementation(() => {
        h.queue.clear();
        h.queue.enqueue({ value: 'replacement', mode: 'prompt' });
        return admitted;
      });
      h.sendNextFollowUp();
      expect(h.queue.getSnapshot().map((item) => item.value)).toEqual(['replacement']);
    },
  );

  it('unlocks after a queue subscriber throws during settlement', () => {
    const h = harness();
    h.queue.enqueue({ value: 'first', mode: 'prompt' });
    const second = h.queue.enqueue({ value: 'second', mode: 'prompt' });
    const error = new Error('render failed');
    const unsubscribe = h.queue.subscribe(() => {
      throw error;
    });
    expect(() => h.sendNextFollowUp()).toThrow(error);
    unsubscribe();
    expect(h.queue.peek()).toBe(second);
    h.sendNextFollowUp();
    expect(h.sendMessage.mock.calls).toEqual([['first'], ['second']]);
    expect(h.queue.size()).toBe(0);
  });
});

describe('composer input clearing', () => {
  it.each(['button', 'enter'] as const)('clears %s input only after admission', (kind) => {
    const marker =
      kind === 'button'
        ? "sendBtn.addEventListener('click', () => {"
        : "inputEl.addEventListener('keydown', (e: KeyboardEvent) => {\n    if (e.key === 'Enter' && !e.shiftKey";
    const start = source.indexOf(marker);
    expect(start).toBeGreaterThan(-1);
    const listenerSource = source.slice(start, source.indexOf('\n  });', start) + 6);
    let listener!: (event: Record<string, unknown>) => void;
    const inputEl = {
      value: 'draft',
      dispatchEvent: vi.fn(),
      addEventListener: (_type: string, callback: typeof listener) => {
        listener = callback;
      },
    };
    const sendBtn = {
      getAttribute: () => 'send',
      addEventListener: inputEl.addEventListener,
    };
    const send = vi.fn(() => false);
    const compiled = ts.transpileModule(listenerSource, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
    }).outputText;
    // llm-guardrail-allow: runs the repository-owned composer listener; draft data is passed as arguments.
    new Function(
      'inputEl',
      'sendBtn',
      'sendMessage',
      'submitComposerText',
      'updateSendButton',
      'cancelCurrentManagedStream',
      'handleUnattendedCommand',
      'isImeComposingKey',
      compiled,
    )(inputEl, sendBtn, send, send, vi.fn(), vi.fn(), () => false, isImeComposingKey);
    const event = { key: 'Enter', preventDefault: vi.fn() };
    listener(event);
    expect(inputEl.value).toBe('draft');
    expect(inputEl.dispatchEvent).not.toHaveBeenCalled();
    send.mockImplementation(() => {
      expect(inputEl.value).toBe('draft');
      return true;
    });
    listener(event);
    expect(inputEl.value).toBe('');
    expect(inputEl.dispatchEvent).toHaveBeenCalledOnce();
  });
});

it('ignores a delayed draft read after the user edits and clears the composer', async () => {
  const input = document.createElement('textarea');
  const context = {
    managedCloudOwner: { accountId: 'owner', authIncarnation: 'session' },
    conversationId: 'chat',
    temporaryChat: false,
  };
  let resolveRead!: (value: Record<string, string>) => void;
  const read = new Promise<Record<string, string>>((resolve) => {
    resolveRead = resolve;
  });
  const storage = { get: vi.fn(() => read), remove: vi.fn(async () => {}) };
  const draftFunctions = program.statements
    .filter(
      (node) =>
        ts.isFunctionDeclaration(node) &&
        ['saveComposerDraft', 'bindComposerDraft'].includes(node.name?.text ?? ''),
    )
    .map((node) => node.getText(program))
    .join('\n');
  const compiled = ts.transpileModule(
    `let composerDraftRevision = 0;
     let composerDraftKey = null;
     let composerContextNotice = null;
     let composerGeneratedSelectionPrompt = null;
     ${draftFunctions}
     bindComposerDraft();
     composerDraftRevision += 1;
     saveComposerDraft('');`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
  ).outputText;
  // llm-guardrail-allow: executes the repository-owned draft functions with an isolated storage fixture.
  new Function('_ctx', 'document', 'chrome', 'updateSendButton', compiled)(
    context,
    { getElementById: () => input },
    { storage: { session: storage } },
    vi.fn(),
  );
  const key = JSON.stringify(['composer-draft', 'owner', 'session', 'chat']);
  expect(storage.get).toHaveBeenCalledWith(key);
  expect(storage.remove).toHaveBeenCalledWith(key);
  resolveRead({ [key]: 'Earlier text' });
  await read;
  expect(input.value).toBe('');
});
