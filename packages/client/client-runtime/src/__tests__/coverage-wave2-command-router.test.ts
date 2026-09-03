import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../detect', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../detect')>()),
  isTauri: false,
  isTest: false,
}));

vi.mock('../http', () => ({
  routeToCloud: vi.fn().mockResolvedValue('CLOUD_OK'),
}));

import { resolveCommandCapability } from '../registry';
import { command, commandWithWarning } from '../command';
import { DesktopRequiredError } from '../errors';
import { routeToCloud } from '../http';

const mockedRouteToCloud = vi.mocked(routeToCloud);

beforeEach(() => {
  mockedRouteToCloud.mockClear();
});

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

describe('command() dispatch (web/cloud mode)', () => {
  it('LOCK ENFORCEMENT: rejects a desktop-only command with DesktopRequiredError AND never routes it to cloud', async () => {
    await expect(command('file_read')).rejects.toBeInstanceOf(DesktopRequiredError);
    expect(mockedRouteToCloud).not.toHaveBeenCalled();
  });

  it('routes a cloud command through routeToCloud', async () => {
    const result = await command('chat_send', { text: 'hi' });
    expect(result).toBe('CLOUD_OK');
    expect(mockedRouteToCloud).toHaveBeenCalledTimes(1);
    const [name, args, cap] = mockedRouteToCloud.mock.calls[0]!;
    expect(name).toBe('chat_send');
    expect(args).toEqual({ text: 'hi' });
    expect(cap.tier).toBe('cloud');
  });

  it('routes a desktop-preferred command through routeToCloud (cloud fallback)', async () => {
    const result = await command('mcp_call');
    expect(result).toBe('CLOUD_OK');
    expect(mockedRouteToCloud).toHaveBeenCalledTimes(1);
    expect(mockedRouteToCloud.mock.calls[0]![2].tier).toBe('desktop-preferred');
  });
});

describe('commandWithWarning() warning behavior', () => {
  it('attaches NO warning for a clean cloud command', async () => {
    const res = await commandWithWarning('chat_send');
    expect(res.data).toBe('CLOUD_OK');
    expect(res.warning).toBeUndefined();
  });

  it('attaches a desktop-preferred warning when a desktop-preferred command falls back to cloud', async () => {
    const res = await commandWithWarning('mcp_call');
    expect(res.data).toBe('CLOUD_OK');
    expect(res.warning).toBeDefined();
    expect(res.warning!.type).toBe('desktop-preferred');
    expect(res.warning!.commandName).toBe('mcp_call');
    expect(res.warning!.featureGroup).toBe('MCP Tools');
  });

  it('LOCK ENFORCEMENT: throws DesktopRequiredError for a desktop-only command without routing to cloud', async () => {
    await expect(commandWithWarning('terminal_exec')).rejects.toBeInstanceOf(DesktopRequiredError);
    expect(mockedRouteToCloud).not.toHaveBeenCalled();
  });
});
