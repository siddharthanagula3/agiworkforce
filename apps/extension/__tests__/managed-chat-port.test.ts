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
});
