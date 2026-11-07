import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMessageQueue, LANE_CAP, QueueFullError } from '@agiworkforce/client-runtime';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/side_panel.ts'),
  'utf8',
);
const program = ts.createSourceFile('side_panel.ts', source, ts.ScriptTarget.Latest, true);
const functions = program.statements
  .filter(
    (node) =>
      ts.isFunctionDeclaration(node) &&
      ['submitComposerText', 'sendNextFollowUp'].includes(node.name?.text ?? ''),
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
  };
  const compiled = ts.transpileModule(
    `${queueState}\nlet composerContextNotice = null;\n${functions}\nreturn { submitComposerText, sendNextFollowUp };`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
  ).outputText;
  // llm-guardrail-allow: runs only repository-owned TypeScript functions in this isolated unit fixture.
  const api = new Function(...Object.keys(dependencies), compiled)(
    ...Object.values(dependencies),
  ) as {
    submitComposerText(text: string): boolean;
    sendNextFollowUp(): void;
  };
  return { ...dependencies, ...api, queue };
}

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
      'autoResizeInput',
      'updateSendButton',
      'cancelCurrentManagedStream',
      compiled,
    )(inputEl, sendBtn, send, send, vi.fn(), vi.fn(), vi.fn());
    const event = { key: 'Enter', preventDefault: vi.fn() };
    listener(event);
    expect(inputEl.value).toBe('draft');
    send.mockImplementation(() => {
      expect(inputEl.value).toBe('draft');
      return true;
    });
    listener(event);
    expect(inputEl.value).toBe('');
  });
});
