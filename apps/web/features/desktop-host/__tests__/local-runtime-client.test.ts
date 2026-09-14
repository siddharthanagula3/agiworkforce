import { afterEach, describe, expect, it } from 'vitest';
import {
  DesktopRuntimeError,
  type DesktopRuntimeEvent,
  type HostBridge,
} from '@agiworkforce/local-runtime-contract';
import {
  DesktopHostUnavailable,
  cancelLocalCommand,
  clipboardAttachments,
  openWorkspacePath,
  readHostClipboard,
  readLocalCommandPolicy,
  revealWorkspacePath,
  startLocalChat,
  startLocalCommand,
  writeLocalCommandPolicy,
} from '../lib/runtime-client';

type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

function installHost(invoke: Invoke) {
  const listeners = new Set<(event: DesktopRuntimeEvent) => void>();
  const host = {
    platform: 'electron-darwin',
    appVersion: '1.2.0',
    invokeRuntime: invoke as HostBridge['invokeRuntime'],
    onDeepLink: () => () => undefined,
    onVoiceHotkey: () => () => undefined,
    onRuntimeEvent: (callback: (event: DesktopRuntimeEvent) => void) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    openExternal: async () => undefined,
    notify: async () => undefined,
    checkForUpdate: async () => ({
      available: false,
      currentVersion: '1.2.0',
      version: '1.2.0',
      downloadUrl: '',
    }),
    openUpdateInstaller: async () => undefined,
  } satisfies HostBridge;
  window.agiHost = host;
  return {
    listeners,
    emit: (event: DesktopRuntimeEvent) => listeners.forEach((listener) => listener(event)),
  };
}

const ok = (value: unknown) => ({ ok: true as const, value });

afterEach(() => {
  delete window.agiHost;
});

describe('local command client', () => {
  it('refuses to start without a desktop host', () => {
    expect(() =>
      startLocalCommand({ rootId: 'r', command: 'git status' }, () => undefined),
    ).toThrow(DesktopHostUnavailable);
  });

  it('sends a run id the caller can cancel with', async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    installHost(async (command, args) => {
      calls.push({ command, args });
      return ok({ runId: String(args?.['runId']), exitCode: 0 });
    });

    const run = startLocalCommand({ rootId: 'root-1', command: 'git status' }, () => undefined);
    const result = await run.result;

    expect(run.runId).toHaveLength(36);
    expect(calls[0]?.command).toBe('shell_run');
    expect(calls[0]?.args).toMatchObject({ runId: run.runId, rootId: 'root-1' });
    expect(result.runId).toBe(run.runId);
  });

  it('passes a subfolder and a timeout only when given', async () => {
    const calls: Array<Record<string, unknown> | undefined> = [];
    installHost(async (_command, args) => {
      calls.push(args);
      return ok({ exitCode: 0 });
    });

    await startLocalCommand({ rootId: 'r', command: 'ls' }, () => undefined).result;
    await startLocalCommand(
      { rootId: 'r', command: 'ls', path: 'apps/web', timeoutMs: 1000 },
      () => undefined,
    ).result;

    expect(calls[0]).not.toHaveProperty('path');
    expect(calls[0]).not.toHaveProperty('timeoutMs');
    expect(calls[1]).toMatchObject({ path: 'apps/web', timeoutMs: 1000 });
  });

  it('reports only the output of its own run', async () => {
    let emit: ((event: DesktopRuntimeEvent) => void) | null = null;
    const host = installHost(async (_command, args) => {
      emit?.({
        kind: 'shell-output',
        runId: 'someone-else',
        stream: 'stdout',
        chunk: 'not mine',
      });
      emit?.({
        kind: 'shell-output',
        runId: String(args?.['runId']),
        stream: 'stderr',
        chunk: 'mine',
      });
      return ok({ exitCode: 0 });
    });
    emit = host.emit;

    const seen: string[] = [];
    await startLocalCommand({ rootId: 'r', command: 'ls' }, (output) =>
      seen.push(`${output.stream}:${output.text}`),
    ).result;

    expect(seen).toEqual(['stderr:mine']);
  });

  it('stops listening once the run settles, and after a failure too', async () => {
    const host = installHost(async () => ok({ exitCode: 0 }));
    await startLocalCommand({ rootId: 'r', command: 'ls' }, () => undefined).result;
    expect(host.listeners.size).toBe(0);

    installHost(async () => ({
      ok: false as const,
      error: { code: 'permission-denied' as const, message: 'no' },
    }));
    const failing = startLocalCommand({ rootId: 'r', command: 'ls' }, () => undefined);
    await expect(failing.result).rejects.toBeInstanceOf(DesktopRuntimeError);
  });

  it('cancels by run id', async () => {
    const calls: Array<Record<string, unknown> | undefined> = [];
    installHost(async (_command, args) => {
      calls.push(args);
      return ok(true);
    });
    await expect(cancelLocalCommand('run-9')).resolves.toBe(true);
    expect(calls[0]).toEqual({ runId: 'run-9' });
  });

  it('reads and writes the command policy', async () => {
    const policy = { allow: ['git'], deny: ['rm'] };
    installHost(async (command, args) =>
      ok(command === 'shell_policy_read' ? policy : args?.['policy']),
    );
    await expect(readLocalCommandPolicy()).resolves.toEqual(policy);
    await expect(writeLocalCommandPolicy({ allow: ['ls'], deny: [] })).resolves.toEqual({
      allow: ['ls'],
      deny: [],
    });
  });
});

describe('opening and revealing', () => {
  it('names the command and its arguments', async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    installHost(async (command, args) => {
      calls.push({ command, args });
      return ok({ path: 'a.md', opened: true });
    });

    await openWorkspacePath('root-1', 'a.md');
    await revealWorkspacePath('root-1', 'a.md');

    expect(calls.map((call) => call.command)).toEqual(['app_open_path', 'app_reveal_path']);
    expect(calls[0]?.args).toEqual({ rootId: 'root-1', path: 'a.md' });
  });

  it('raises the refusal the runtime returned', async () => {
    installHost(async () => ({
      ok: false as const,
      error: { code: 'permission-denied' as const, message: 'install.sh is a program.' },
    }));
    await expect(openWorkspacePath('r', 'install.sh')).rejects.toMatchObject({
      message: 'install.sh is a program.',
    });
  });
});

describe('clipboard', () => {
  it('asks the host for the clipboard', async () => {
    installHost(async (command) =>
      command === 'clipboard_read' ? ok({ text: 'hi', textTruncated: false }) : ok(null),
    );
    await expect(readHostClipboard()).resolves.toEqual({ text: 'hi', textTruncated: false });
  });

  it('turns text into a text attachment', () => {
    const files = clipboardAttachments({ text: 'hello', textTruncated: false }, 5);
    expect(files).toHaveLength(1);
    expect(files[0]?.name).toBe('clipboard-5.txt');
    expect(files[0]?.type).toBe('text/plain');
  });

  it('turns an image into a png attachment', () => {
    const files = clipboardAttachments(
      { image: { base64: btoa('png'), width: 2, height: 2 }, textTruncated: false },
      7,
    );
    expect(files).toHaveLength(1);
    expect(files[0]?.name).toBe('clipboard-7.png');
    expect(files[0]?.type).toBe('image/png');
  });

  it('returns the image first when a copy carries both', () => {
    const files = clipboardAttachments(
      { text: 'cell', image: { base64: btoa('png'), width: 1, height: 1 }, textTruncated: false },
      9,
    );
    expect(files.map((file) => file.type)).toEqual(['image/png', 'text/plain']);
  });

  it('attaches nothing for an empty clipboard', () => {
    expect(clipboardAttachments({ textTruncated: false }, 1)).toEqual([]);
  });
});

describe('local chat client', () => {
  it('refuses attachment bytes before anything reaches the host', () => {
    const calls: string[] = [];
    installHost(async (command) => {
      calls.push(command);
      return { ok: true, value: undefined };
    });

    expect(() =>
      startLocalChat(
        {
          modelId: 'local:ollama/qwen2.5:1.5b',
          messages: [{ role: 'user', content: 'data:image/png;base64,iVBORw0KGgo=' }],
        },
        () => undefined,
      ),
    ).toThrow('cannot read attachments');
    expect(calls).toEqual([]);
  });

  it('refuses a message carrying an attachment field', () => {
    const calls: string[] = [];
    installHost(async (command) => {
      calls.push(command);
      return { ok: true, value: undefined };
    });

    expect(() =>
      startLocalChat(
        {
          modelId: 'local:ollama/qwen2.5:1.5b',
          messages: [
            { role: 'user', content: 'read this', attachments: [{ name: 'a.pdf' }] },
          ] as never,
        },
        () => undefined,
      ),
    ).toThrow('cannot read attachments');
    expect(calls).toEqual([]);
  });

  it('starts a plain text turn', async () => {
    installHost(async (command, args) => {
      if (command !== 'local_chat_start') throw new Error(`unexpected ${command}`);
      return {
        ok: true,
        value: {
          runId: args?.['runId'],
          modelId: args?.['modelId'],
          serverId: 'ollama',
          text: 'hi',
          thinking: '',
          stopReason: 'end_turn',
          durationMs: 1,
        },
      };
    });

    const run = startLocalChat(
      {
        modelId: 'local:ollama/qwen2.5:1.5b',
        messages: [{ role: 'user', content: 'hello' }],
      },
      () => undefined,
    );
    await expect(run.result).resolves.toMatchObject({ text: 'hi' });
  });
});
