/**
 * terminalShellIntegration.test.ts — SIX-15.
 *
 * "Explain Terminal Output" read `terminal.shellIntegration.executions`, a
 * property that does not exist on the VS Code API: `vscode.TerminalShellIntegration`
 * carries only `cwd` and `executeCommand`, and executions are delivered through
 * `window.onDidStartTerminalShellExecution` / `onDidEndTerminalShellExecution`.
 * The branch was permanently undefined, so every invocation fell through to the
 * manual-paste prompt claiming "Shell integration is not available" — false
 * whenever it was active.
 *
 * These tests drive the real events and assert the command captures output, and
 * that the fallback prompt states the real reason when it is genuinely reached.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { TerminalProvider } from '../providers/terminalProvider';
import { chatCompletion } from '../utils/api';

vi.mock('../utils/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/api')>();
  return { ...actual, chatCompletion: vi.fn().mockResolvedValue('explanation') };
});

type ShellExecutionListener = (event: {
  terminal: vscode.Terminal;
  execution: vscode.TerminalShellExecution;
  exitCode?: number;
}) => void;

function makeTerminal(shellIntegrationActive: boolean): vscode.Terminal {
  return {
    name: 'zsh',
    show: vi.fn(),
    sendText: vi.fn(),
    dispose: vi.fn(),
    shellIntegration: shellIntegrationActive
      ? { cwd: undefined, executeCommand: vi.fn() }
      : undefined,
  } as unknown as vscode.Terminal;
}

function makeExecution(
  commandLine: string,
  chunks: string[],
  confidence: number = vscode.TerminalShellExecutionCommandLineConfidence.High,
): vscode.TerminalShellExecution {
  return {
    commandLine: { value: commandLine, isTrusted: true, confidence },
    cwd: undefined,
    read: () =>
      (async function* () {
        for (const chunk of chunks) yield chunk;
      })(),
  } as unknown as vscode.TerminalShellExecution;
}

function listeners(): { start: ShellExecutionListener; end: ShellExecutionListener } {
  const start = vi.mocked(vscode.window.onDidStartTerminalShellExecution).mock
    .calls[0]?.[0] as unknown as ShellExecutionListener;
  const end = vi.mocked(vscode.window.onDidEndTerminalShellExecution).mock
    .calls[0]?.[0] as unknown as ShellExecutionListener;
  expect(start, 'provider never subscribed to onDidStartTerminalShellExecution').toBeTypeOf(
    'function',
  );
  expect(end, 'provider never subscribed to onDidEndTerminalShellExecution').toBeTypeOf('function');
  return { start, end };
}

/** Let the queued `read()` drain settle. */
async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

function token(): vscode.CancellationToken {
  return { isCancellationRequested: false, onCancellationRequested: vi.fn() } as never;
}

function lastPrompt(): string {
  const calls = vi.mocked(chatCompletion).mock.calls;
  const messages = calls[calls.length - 1]?.[1] ?? [];
  return messages.map((message) => message.content).join('\n');
}

describe('terminal shell-integration capture (SIX-15)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(chatCompletion).mockResolvedValue('explanation');
    vscode.window.activeTerminal = undefined;
    vscode.window.terminals = [];
  });

  it('does not read a property the VS Code API never had', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../providers/terminalProvider.ts'),
      'utf8',
    );
    // Comments stripped: the file documents the old shape on purpose.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    // The exact defect: a locally-declared shape with an `executions` array.
    expect(code).not.toMatch(/shellIntegration\.executions/);
    expect(code).not.toMatch(/interface TerminalShellIntegration/);
    expect(code).toContain('onDidStartTerminalShellExecution');
    expect(code).toContain('onDidEndTerminalShellExecution');
  });

  it('explains the captured execution instead of asking the user to paste it', async () => {
    const provider = new TerminalProvider({} as vscode.SecretStorage);
    const terminal = makeTerminal(true);
    vscode.window.activeTerminal = terminal;
    const { start, end } = listeners();

    const execution = makeExecution('pnpm test', ['3 passing\n', '1 failing\n']);
    start({ terminal, execution });
    await flush();
    end({ terminal, execution, exitCode: 1 });

    const explanation = await provider.captureAndExplain(token());

    expect(explanation).toBe('explanation');
    // The false claim this item is about.
    expect(vscode.window.showInputBox).not.toHaveBeenCalled();
    expect(lastPrompt()).toContain('3 passing');
    expect(lastPrompt()).toContain('1 failing');
    expect(lastPrompt()).toContain('$ pnpm test');
    expect(lastPrompt()).toContain('[exit code 1]');
  });

  it('strips terminal control sequences before the output reaches the model', async () => {
    const provider = new TerminalProvider({} as vscode.SecretStorage);
    const terminal = makeTerminal(true);
    vscode.window.activeTerminal = terminal;
    const { start, end } = listeners();

    const execution = makeExecution('git status', [
      '\u001B[31mmodified:\u001B[0m src/app.ts\r\n',
      '\u001B]0;title\u0007done\n',
    ]);
    start({ terminal, execution });
    await flush();
    end({ terminal, execution, exitCode: 0 });

    await provider.captureAndExplain(token());

    const prompt = lastPrompt();
    expect(prompt).toContain('modified: src/app.ts');
    expect(prompt).toContain('done');
    expect(prompt).not.toContain('\u001B');
    expect(prompt).not.toContain('title');
  });

  it('marks output as truncated rather than sending an unbounded transcript', async () => {
    const provider = new TerminalProvider({} as vscode.SecretStorage);
    const terminal = makeTerminal(true);
    vscode.window.activeTerminal = terminal;
    const { start, end } = listeners();

    const execution = makeExecution('cat huge.log', ['x'.repeat(20_000)]);
    start({ terminal, execution });
    await flush();
    end({ terminal, execution, exitCode: 0 });

    await provider.captureAndExplain(token());

    const prompt = lastPrompt();
    expect(prompt).toContain('... [output truncated]');
    expect(prompt.length).toBeLessThan(10_000);
  });

  it('omits a low-confidence command line rather than asserting a command that may be wrong', async () => {
    const provider = new TerminalProvider({} as vscode.SecretStorage);
    const terminal = makeTerminal(true);
    vscode.window.activeTerminal = terminal;
    const { start, end } = listeners();

    const execution = makeExecution(
      'probably-not-what-ran',
      ['some output\n'],
      vscode.TerminalShellExecutionCommandLineConfidence.Low,
    );
    start({ terminal, execution });
    await flush();
    end({ terminal, execution, exitCode: 0 });

    await provider.captureAndExplain(token());

    expect(lastPrompt()).toContain('some output');
    expect(lastPrompt()).not.toContain('probably-not-what-ran');
  });

  it('reports output while the command is still running', async () => {
    const provider = new TerminalProvider({} as vscode.SecretStorage);
    const terminal = makeTerminal(true);
    vscode.window.activeTerminal = terminal;
    const { start } = listeners();

    const execution = makeExecution('pnpm build', ['compiling…\n']);
    start({ terminal, execution });
    await flush();
    // No end event — the command has not finished.

    await provider.captureAndExplain(token());

    expect(lastPrompt()).toContain('compiling…');
    expect(lastPrompt()).toContain('[command is still running]');
  });

  it('says shell integration is inactive only when it really is', async () => {
    const provider = new TerminalProvider({} as vscode.SecretStorage);
    vscode.window.activeTerminal = makeTerminal(false);
    vi.mocked(vscode.window.showInputBox).mockResolvedValue('pasted output');

    await provider.captureAndExplain(token());

    const prompt = vi.mocked(vscode.window.showInputBox).mock.calls[0]?.[0]?.prompt ?? '';
    expect(prompt).toContain('Shell integration is not active in this terminal.');
    expect(lastPrompt()).toContain('pasted output');
  });

  it('distinguishes "no command captured yet" from "no shell integration"', async () => {
    const provider = new TerminalProvider({} as vscode.SecretStorage);
    vscode.window.activeTerminal = makeTerminal(true);
    vi.mocked(vscode.window.showInputBox).mockResolvedValue('pasted output');

    await provider.captureAndExplain(token());

    const prompt = vi.mocked(vscode.window.showInputBox).mock.calls[0]?.[0]?.prompt ?? '';
    expect(prompt).toContain('No command output has been captured in this terminal yet.');
    expect(prompt).not.toContain('Shell integration is not active');
  });

  it('captures per terminal and drops the buffer when the terminal closes', async () => {
    const provider = new TerminalProvider({} as vscode.SecretStorage);
    const terminal = makeTerminal(true);
    const other = makeTerminal(true);
    const { start, end } = listeners();

    const execution = makeExecution('pnpm test', ['captured for this terminal\n']);
    start({ terminal, execution });
    await flush();
    end({ terminal, execution, exitCode: 0 });

    // A different terminal must not inherit the capture.
    vscode.window.activeTerminal = other;
    vi.mocked(vscode.window.showInputBox).mockResolvedValue('pasted output');
    await provider.captureAndExplain(token());
    expect(vscode.window.showInputBox).toHaveBeenCalledTimes(1);

    // Closing the captured terminal releases its buffered output.
    const onClose = vi.mocked(vscode.window.onDidCloseTerminal).mock.calls[0]?.[0] as unknown as (
      t: vscode.Terminal,
    ) => void;
    onClose(terminal);
    vscode.window.activeTerminal = terminal;
    await provider.captureAndExplain(token());
    expect(vscode.window.showInputBox).toHaveBeenCalledTimes(2);
  });

  it('warns instead of calling the model when there is nothing to explain', async () => {
    const provider = new TerminalProvider({} as vscode.SecretStorage);
    vscode.window.activeTerminal = makeTerminal(true);
    vi.mocked(vscode.window.showInputBox).mockResolvedValue(undefined);

    await expect(provider.captureAndExplain(token())).resolves.toBe('');

    expect(chatCompletion).not.toHaveBeenCalled();
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      'AGI Workforce: No terminal output to explain.',
    );
  });
});
