import { describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import {
  RETRY_LAST_MESSAGE_COMMAND,
  registerChatRetryCommand,
  resolveRetryTarget,
  type ChatRetrySource,
  type ChatTurn,
} from '../features/chat/retry';
import { citationChipKey, citationChips, webCitationChips } from '../features/chat/citations';

function transcript(...turns: ChatTurn[]): ChatTurn[] {
  return turns;
}

describe('retry the last message', () => {
  it('resends the last thing the person asked, not the assistant turn after it', () => {
    const decision = resolveRetryTarget({
      transcript: transcript(
        { role: 'user', text: 'first' },
        { role: 'user', text: 'rename the module', references: [] },
        { role: 'assistant', text: 'partial answer' },
      ),
      streaming: false,
    });

    expect(decision).toEqual({ ok: true, target: { text: 'rename the module', references: [] } });
  });

  it('refuses while an answer is still streaming, and says what to do', () => {
    const decision = resolveRetryTarget({
      transcript: transcript({ role: 'user', text: 'go' }),
      streaming: true,
    });

    expect(decision.ok).toBe(false);
    expect(decision.ok === false && decision.refusal).toBe('streaming');
    expect(decision.ok === false && decision.message).toContain('stop it');
  });

  it('refuses an empty transcript and one whose only user turn is blank', () => {
    expect(resolveRetryTarget({ transcript: [], streaming: false }).ok).toBe(false);
    expect(
      resolveRetryTarget({
        transcript: transcript({ role: 'user', text: '   ' }),
        streaming: false,
      }).ok,
    ).toBe(false);
  });

  it('registers a command that resends through the chat source', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    vi.spyOn(vscode.commands, 'registerCommand').mockImplementation(((
      id: string,
      handler: (...args: unknown[]) => unknown,
    ) => {
      handlers.set(id, handler);
      return { dispose: vi.fn() };
    }) as typeof vscode.commands.registerCommand);
    const info = vi.spyOn(vscode.window, 'showInformationMessage').mockResolvedValue(undefined);

    const resend = vi.fn();
    const source: ChatRetrySource = {
      transcript: () => transcript({ role: 'user', text: 'rename the module' }),
      isStreaming: () => false,
      resend,
    };
    const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;

    registerChatRetryCommand(context, source);
    expect(handlers.has(RETRY_LAST_MESSAGE_COMMAND)).toBe(true);
    expect(context.subscriptions).toHaveLength(1);

    await handlers.get(RETRY_LAST_MESSAGE_COMMAND)?.();
    expect(resend).toHaveBeenCalledWith('rename the module', []);
    expect(info).not.toHaveBeenCalled();
  });

  it('tells the person why instead of resending when there is nothing to retry', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    vi.spyOn(vscode.commands, 'registerCommand').mockImplementation(((
      id: string,
      handler: (...args: unknown[]) => unknown,
    ) => {
      handlers.set(id, handler);
      return { dispose: vi.fn() };
    }) as typeof vscode.commands.registerCommand);
    const info = vi.spyOn(vscode.window, 'showInformationMessage').mockResolvedValue(undefined);

    const resend = vi.fn();
    registerChatRetryCommand({ subscriptions: [] } as unknown as vscode.ExtensionContext, {
      transcript: () => [],
      isStreaming: () => false,
      resend,
    });

    await handlers.get(RETRY_LAST_MESSAGE_COMMAND)?.();
    expect(resend).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith('There is no message to retry yet.');
  });
});

describe('citations under an answer', () => {
  it('renders project sources before web pages, each with where it came from', () => {
    const chips = citationChips({
      projectSources: [{ fileName: 'pricing.pdf', anchor: { page: 12 } }],
      x_citation: [{ url: 'https://www.example.com/a?b=1', title: 'Example page' }],
    });

    expect(chips.map((chip) => [chip.kind, chip.label, chip.detail])).toEqual([
      ['project', 'pricing.pdf', 'p. 12'],
      ['web', 'example.com', null],
    ]);
  });

  it('drops a citation whose URL is not something a click may follow', () => {
    expect(
      webCitationChips([
        { url: 'javascript:alert(1)', title: 'x' },
        { url: 'vscode://file/etc/passwd', title: 'x' },
        { url: 'not a url', title: 'x' },
        { url: 'https://ok.example.com/', title: 'fine' },
      ]).map((chip) => chip.label),
    ).toEqual(['ok.example.com']);
  });

  it('shows one chip per source, not one per passage', () => {
    const chips = citationChips({
      projectSources: [
        { fileName: 'handbook.md', anchor: { headingPath: ['Refunds'] } },
        { fileName: 'handbook.md', anchor: { headingPath: ['Refunds'] } },
      ],
      x_citation: [
        { url: 'https://example.com/a', title: 'one' },
        { url: 'https://example.com/a', title: 'again' },
      ],
    });

    expect(chips).toHaveLength(2);
    expect(new Set(chips.map(citationChipKey)).size).toBe(2);
  });

  it('renders nothing for an answer that cited nothing', () => {
    expect(citationChips(null)).toEqual([]);
    expect(citationChips({})).toEqual([]);
  });
});
