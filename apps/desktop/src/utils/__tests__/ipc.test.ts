
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

// @ts-expect-error -- guardrail script, JavaScript with no type declarations
import { extractRegisteredCommands } from '../../../scripts/check-wiring.mjs';

import { COMMAND_TIMEOUTS, assertRegisteredCommand } from '../ipc';
import { REGISTERED_COMMANDS } from '../registeredCommands';

const LIB_RS = path.resolve(__dirname, '../../../src-tauri/src/lib.rs');
const SRC_DIR = path.resolve(__dirname, '../..');

function registeredInRust(): Set<string> {
  const source = fs.readFileSync(LIB_RS, 'utf8');
  return new Set(extractRegisteredCommands(source) as string[]);
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name === 'test') {
        continue;
      }
      sourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function commandsInvokedThroughUtilsIpc(): Set<string> {
  const commands = new Set<string>();

  for (const file of sourceFiles(SRC_DIR)) {
    const source = fs.readFileSync(file, 'utf8');
    if (!/import\s*\{[^}]*\binvoke\b[^}]*\}\s*from\s*'[^']*utils\/ipc'/.test(source)) {
      continue;
    }
    for (const match of source.matchAll(/\binvoke(?:<[\s\S]*?>)?\(\s*'([a-z][a-z0-9_]*)'/g)) {
      commands.add(match[1] as string);
    }
  }

  return commands;
}

describe('REGISTERED_COMMANDS mirrors generate_handler!', () => {
  it('rejects nothing the Rust registry answers', () => {
    const rust = registeredInRust();
    expect(rust.size).toBeGreaterThan(1000);

    const missing = [...rust].filter((command) => !REGISTERED_COMMANDS.has(command));
    expect(missing).toEqual([]);
  });

  it('allows nothing the Rust registry does not answer', () => {
    const rust = registeredInRust();

    const extra = [...REGISTERED_COMMANDS].filter((command) => !rust.has(command));
    expect(extra).toEqual([]);
  });
});

describe('COMMAND_TIMEOUTS keys off real commands', () => {
  it('gives every override a registered command to apply to', () => {
    const unregistered = Object.keys(COMMAND_TIMEOUTS).filter(
      (command) => !REGISTERED_COMMANDS.has(command),
    );
    expect(unregistered).toEqual([]);
  });

  it('overrides only commands that can reach this module', () => {
    const reachable = commandsInvokedThroughUtilsIpc();
    expect(reachable.size).toBeGreaterThan(0);

    const unreachable = Object.keys(COMMAND_TIMEOUTS).filter((command) => !reachable.has(command));
    expect(unreachable).toEqual([]);
  });
});

describe('assertRegisteredCommand', () => {
  it('accepts a registered command', () => {
    expect(() => assertRegisteredCommand('artifact_create')).not.toThrow();
  });

  it('rejects a well-formed name the backend never registered', () => {
    expect(() => assertRegisteredCommand('artifact_delete_everything')).toThrow(
      /not registered in the frontend allowlist/,
    );
  });

  it('rejects a name that is not a Tauri command name', () => {
    expect(() => assertRegisteredCommand('plugin:dialog|open')).toThrow(/Invalid IPC command name/);
  });
});

describe('lib/tauri-mock enforces the allowlist on the native path', () => {
  async function loadNativeInvoke() {
    vi.resetModules();
    (window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'] = { invoke: vi.fn() };
    try {
      const core = await import('@tauri-apps/api/core');
      const tauriInvoke = vi.mocked(core.invoke);
      tauriInvoke.mockReset();
      tauriInvoke.mockResolvedValue(undefined);
      const mod =
        await vi.importActual<typeof import('../../lib/tauri-mock')>('../../lib/tauri-mock');
      expect(mod.isTauri).toBe(true);
      return { invoke: mod.invoke, tauriInvoke };
    } finally {
      delete (window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'];
    }
  }

  it('never reaches the Tauri API for an unregistered command', async () => {
    const { invoke, tauriInvoke } = await loadNativeInvoke();

    await expect(invoke('artifact_delete_everything')).rejects.toThrow(
      /not registered in the frontend allowlist/,
    );
    expect(tauriInvoke).not.toHaveBeenCalled();
  });

  it('passes a registered command through', async () => {
    const { invoke, tauriInvoke } = await loadNativeInvoke();

    await invoke('artifact_create', { title: 'x' });
    expect(tauriInvoke).toHaveBeenCalledWith('artifact_create', { title: 'x' });
  });
});
