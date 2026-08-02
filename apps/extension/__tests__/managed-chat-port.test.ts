import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  createManagedChatPortName,
  parseManagedChatPortName,
} from '../src/features/cloud-bridge/managedChatPort';

describe('Managed chat keepalive port protocol', () => {
  it('round-trips a validated client instance id', () => {
    const name = createManagedChatPortName('panel-123');
    expect(name).toBe('agi-managed-chat:panel-123');
    expect(parseManagedChatPortName(name)).toBe('panel-123');
  });

  it('rejects missing, oversized, and unrelated port names', () => {
    expect(() => createManagedChatPortName('')).toThrow('client instance');
    expect(() => createManagedChatPortName('x'.repeat(201))).toThrow('client instance');
    expect(parseManagedChatPortName('other:panel-123')).toBeNull();
    expect(parseManagedChatPortName('agi-managed-chat:bad client')).toBeNull();
  });

  it('authenticates tab-associated side panels by extension origin', () => {
    const source = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '../src/background.ts'),
      'utf8',
    );
    const handler = source.slice(
      source.indexOf('function handleManagedChatKeepalivePort'),
      source.indexOf('function connectToNativeHost'),
    );

    expect(handler).toContain('isTrustedExtensionPageSender');
    expect(handler).toContain('tabUrl: port.sender?.tab?.url');
    expect(handler).not.toContain('port.sender?.id !== chrome.runtime.id || port.sender.tab');
  });
});
