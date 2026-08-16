
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';

import { activate } from '../extension';
import { __resetSubsystemHealthForTests, getFailureCount } from '../core/subsystemHealth';

const { providerFailure, chatFailure } = vi.hoisted(() => ({
  providerFailure: { error: undefined as Error | undefined },
  chatFailure: { error: undefined as Error | undefined },
}));

vi.mock('../core/providerSetup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../core/providerSetup')>();
  return {
    ...actual,
    setupProviders: (context: vscode.ExtensionContext) => {
      if (providerFailure.error !== undefined) throw providerFailure.error;
      return actual.setupProviders(context);
    },
  };
});

vi.mock('../core/chatSetup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../core/chatSetup')>();
  return {
    ...actual,
    setupChat: (...args: Parameters<typeof actual.setupChat>) => {
      if (chatFailure.error !== undefined) throw chatFailure.error;
      return actual.setupChat(...args);
    },
  };
});

function errorToasts(): string[] {
  return vi
    .mocked(vscode.window.showErrorMessage)
    .mock.calls.map(([message]) => String(message ?? ''));
}

function registeredViewIds(): string[] {
  return vi.mocked(vscode.window.registerWebviewViewProvider).mock.calls.map(([id]) => String(id));
}

describe('activation resilience', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    providerFailure.error = undefined;
    chatFailure.error = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    __resetSubsystemHealthForTests();
  });

  it('still registers the chat view when provider setup throws', () => {
    providerFailure.error = new Error('hover provider registration exploded');

    expect(() => activate(new vscode.ExtensionContext())).not.toThrow();

    expect(registeredViewIds()).toContain('agi-workforce.sidebar');
    expect(errorToasts().join('\n')).toContain('hover provider registration exploded');
    expect(getFailureCount()).toBeGreaterThan(0);
  });

  it('surfaces a visible error when chat setup throws instead of failing silently', () => {
    chatFailure.error = new Error('webview view provider registration exploded');

    expect(() => activate(new vscode.ExtensionContext())).not.toThrow();

    const toasts = errorToasts().join('\n');
    expect(toasts).toContain('chat view failed to register');
    expect(toasts).toContain('webview view provider registration exploded');
    expect(getFailureCount()).toBeGreaterThan(0);
  });

  it('activates cleanly with no error toast when nothing throws', () => {
    expect(() => activate(new vscode.ExtensionContext())).not.toThrow();

    expect(registeredViewIds()).toContain('agi-workforce.sidebar');
    expect(errorToasts()).toEqual([]);
    expect(getFailureCount()).toBe(0);
  });
});
