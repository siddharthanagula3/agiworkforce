import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { TerminalProvider } from '../providers/terminalProvider';
import { buildExplainTerminalPrompt } from '../features/editor-utilities';
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

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
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
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

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

    const captured = await provider.captureOutput();

    expect(vscode.window.showInputBox).not.toHaveBeenCalled();
    expect(captured).toContain('3 passing');
    expect(captured).toContain('1 failing');
    expect(captured).toContain('$ pnpm test');
    expect(captured).toContain('[exit code 1]');
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

    const captured = await provider.captureOutput();

    expect(captured).toContain('modified: src/app.ts');
    expect(captured).toContain('done');
    expect(captured).not.toContain('\u001B');
    expect(captured).not.toContain('title');
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

    const captured = await provider.captureOutput();

    expect(captured).toContain('... [output truncated]');
    expect(captured.length).toBeLessThan(10_000);
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

    const captured = await provider.captureOutput();

    expect(captured).toContain('some output');
    expect(captured).not.toContain('probably-not-what-ran');
  });

  it('reports output while the command is still running', async () => {
    const provider = new TerminalProvider({} as vscode.SecretStorage);
    const terminal = makeTerminal(true);
    vscode.window.activeTerminal = terminal;
    const { start } = listeners();

    const execution = makeExecution('pnpm build', ['compiling…\n']);
    start({ terminal, execution });
    await flush();

    const captured = await provider.captureOutput();

    expect(captured).toContain('compiling…');
    expect(captured).toContain('[command is still running]');
  });

  it('says shell integration is inactive only when it really is', async () => {
    const provider = new TerminalProvider({} as vscode.SecretStorage);
    vscode.window.activeTerminal = makeTerminal(false);
    vi.mocked(vscode.window.showInputBox).mockResolvedValue('pasted output');

    const captured = await provider.captureOutput();

    const prompt = vi.mocked(vscode.window.showInputBox).mock.calls[0]?.[0]?.prompt ?? '';
    expect(prompt).toContain('Shell integration is not active in this terminal.');
    expect(captured).toContain('pasted output');
  });

  it('distinguishes "no command captured yet" from "no shell integration"', async () => {
    const provider = new TerminalProvider({} as vscode.SecretStorage);
    vscode.window.activeTerminal = makeTerminal(true);
    vi.mocked(vscode.window.showInputBox).mockResolvedValue('pasted output');

    await provider.captureOutput();

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

    vscode.window.activeTerminal = other;
    vi.mocked(vscode.window.showInputBox).mockResolvedValue('pasted output');
    await provider.captureOutput();
    expect(vscode.window.showInputBox).toHaveBeenCalledTimes(1);

    const onClose = vi.mocked(vscode.window.onDidCloseTerminal).mock.calls[0]?.[0] as unknown as (
      t: vscode.Terminal,
    ) => void;
    onClose(terminal);
    vscode.window.activeTerminal = terminal;
    await provider.captureOutput();
    expect(vscode.window.showInputBox).toHaveBeenCalledTimes(2);
  });

  it('refuses the turn instead of sending an empty transcript', async () => {
    const provider = new TerminalProvider({} as vscode.SecretStorage);
    vscode.window.activeTerminal = makeTerminal(true);
    vi.mocked(vscode.window.showInputBox).mockResolvedValue(undefined);

    await expect(provider.captureOutput()).resolves.toBe('');
    expect(chatCompletion).not.toHaveBeenCalled();
    expect(buildExplainTerminalPrompt('')).toEqual({
      ok: false,
      message: 'No terminal output to explain.',
    });
  });
});
