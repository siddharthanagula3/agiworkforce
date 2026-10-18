import { describe, it, expect, vi } from 'vitest';
type ScanModule0 = typeof import('../detect');

vi.mock('../detect', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  isTauri: false,
  isTest: false,
}));

const fetchSpy = vi.spyOn(globalThis, 'fetch');

import { resolveCommandCapability } from '../registry';
import { command } from '../command';
import { DesktopRequiredError } from '../errors';

describe('resolveCommandCapability (tier classification)', () => {
  it('maps a Local file command to desktop-only', () => {
    const cap = resolveCommandCapability('file_read');
    expect(cap.tier).toBe('desktop-only');
    expect(cap.featureGroup).toBe('File System');
    expect(cap.commandName).toBe('file_read');
  });

  it('maps a chat command to cloud', () => {
    const cap = resolveCommandCapability('chat_send');
    expect(cap.tier).toBe('cloud');
    expect(cap.featureGroup).toBe('Chat');
  });

  it('maps an mcp command to desktop-preferred', () => {
    const cap = resolveCommandCapability('mcp_call');
    expect(cap.tier).toBe('desktop-preferred');
    expect(cap.featureGroup).toBe('MCP Tools');
  });

  it('defaults an UNKNOWN command to desktop-only (safe fallback, never silently cloud)', () => {
    const cap = resolveCommandCapability('totally_unknown_xyz_command');
    expect(cap.tier).toBe('desktop-only');
    expect(cap.featureGroup).toBe('Unknown');
  });

  it('honors a per-command override over prefix matching', () => {
    expect(resolveCommandCapability('get_app_version').tier).toBe('desktop-only');
    expect(resolveCommandCapability('cloud_chat_stream').tier).toBe('cloud');
  });

  it('LOCK REGRESSION: no Local-only prefix is ever classified cloud', () => {
    const localOnlyPrefixes = [
      'file_read',
      'terminal_exec',
      'git_commit',
      'browser_navigate',
      'voice_record',
      'ollama_generate',
      'code_edit',
      'computer_use_click',
      'capture_screen',
    ];
    for (const cmd of localOnlyPrefixes) {
      const cap = resolveCommandCapability(cmd);
      expect(cap.tier).not.toBe('cloud');
      expect(cap.tier).toBe('desktop-only');
    }
  });
});

describe('command() dispatch without a desktop host', () => {
  it.each(['file_read', 'chat_send', 'mcp_call'])(
    'rejects %s with DesktopRequiredError and sends nothing over the network',
    async (name) => {
      const failure = await command(name).catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(DesktopRequiredError);
      expect((failure as DesktopRequiredError).capability).toEqual(resolveCommandCapability(name));
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );
});
