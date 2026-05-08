import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  parseSlashCommand,
  registerSlashCommand,
  registerBuiltinSlashCommands,
  getSlashCommand,
  listSlashCommands,
  clearSlashCommands,
} from '../slashCommands';

describe('parseSlashCommand', () => {
  it('returns null for non-slash input', () => {
    expect(parseSlashCommand('hello')).toBeNull();
    expect(parseSlashCommand(' /rewind')).toBeNull();
  });

  it('returns null for bare slash', () => {
    expect(parseSlashCommand('/')).toBeNull();
    expect(parseSlashCommand('/   ')).toBeNull();
  });

  it('parses command without args', () => {
    expect(parseSlashCommand('/rewind')).toEqual({ name: 'rewind', args: '' });
    expect(parseSlashCommand('/REWIND')).toEqual({ name: 'rewind', args: '' });
  });

  it('parses command with args', () => {
    expect(parseSlashCommand('/rewind 12')).toEqual({ name: 'rewind', args: '12' });
    expect(parseSlashCommand('/plan write code now')).toEqual({
      name: 'plan',
      args: 'write code now',
    });
  });

  it('preserves slashes inside the args', () => {
    expect(parseSlashCommand('/say /hi')).toEqual({ name: 'say', args: '/hi' });
  });
});

describe('slash command registry', () => {
  beforeEach(() => clearSlashCommands());

  it('registers and looks up by lowercase name', () => {
    registerSlashCommand({ name: 'TestCmd', description: 'demo' });
    expect(getSlashCommand('testcmd')?.name).toBe('TestCmd');
    expect(getSlashCommand('TESTCMD')?.name).toBe('TestCmd');
  });

  it('listSlashCommands returns commands stable-sorted by category + name', () => {
    registerSlashCommand({ name: 'b', description: 'B', category: 'cat1' });
    registerSlashCommand({ name: 'a', description: 'A', category: 'cat1' });
    registerSlashCommand({ name: 'c', description: 'C', category: 'cat0' });
    const out = listSlashCommands({ conversationActive: true });
    expect(out.map((c) => c.name)).toEqual(['c', 'a', 'b']);
  });

  it('listSlashCommands filters out conversation-required when none active', () => {
    registerSlashCommand({ name: 'global', description: 'global' });
    registerSlashCommand({
      name: 'convo',
      description: 'needs conv',
      requiresConversation: true,
    });
    const out = listSlashCommands({ conversationActive: false });
    expect(out.map((c) => c.name)).toEqual(['global']);
  });

  it('listSlashCommands filters by query against name + description', () => {
    registerSlashCommand({ name: 'rewind', description: 'fork from a prior message' });
    registerSlashCommand({ name: 'forget', description: 'clear memory' });
    const matchByName = listSlashCommands({ conversationActive: true, query: 'rew' });
    expect(matchByName.map((c) => c.name)).toEqual(['rewind']);
    const matchByDesc = listSlashCommands({
      conversationActive: true,
      query: 'memory',
    });
    expect(matchByDesc.map((c) => c.name)).toEqual(['forget']);
  });
});

describe('registerBuiltinSlashCommands', () => {
  beforeEach(() => clearSlashCommands());

  it('registers /rewind /plan /clear /model /memory /help', () => {
    registerBuiltinSlashCommands();
    for (const name of ['rewind', 'plan', 'clear', 'model', 'memory', 'help']) {
      expect(getSlashCommand(name)).toBeDefined();
    }
  });

  it('/rewind handler invokes host.openRewindTimeline with messageId arg', () => {
    registerBuiltinSlashCommands();
    const openRewindTimeline = vi.fn();
    const cmd = getSlashCommand('rewind')!;
    cmd.handler!('msg-42', { conversationId: 'c1', host: { openRewindTimeline } });
    expect(openRewindTimeline).toHaveBeenCalledWith('msg-42');
  });

  it('/rewind with empty args calls openRewindTimeline with undefined', () => {
    registerBuiltinSlashCommands();
    const openRewindTimeline = vi.fn();
    getSlashCommand('rewind')!.handler!('', {
      conversationId: 'c1',
      host: { openRewindTimeline },
    });
    expect(openRewindTimeline).toHaveBeenCalledWith(undefined);
  });

  it('/plan handler invokes host.togglePlanMode', () => {
    registerBuiltinSlashCommands();
    const togglePlanMode = vi.fn();
    getSlashCommand('plan')!.handler!('', { conversationId: 'c1', host: { togglePlanMode } });
    expect(togglePlanMode).toHaveBeenCalled();
  });

  it('/clear handler invokes host.clearConversation with id', () => {
    registerBuiltinSlashCommands();
    const clearConversation = vi.fn();
    getSlashCommand('clear')!.handler!('', {
      conversationId: 'c1',
      host: { clearConversation },
    });
    expect(clearConversation).toHaveBeenCalledWith('c1');
  });

  it('/model handler invokes host.setModel only when arg is non-empty', () => {
    registerBuiltinSlashCommands();
    const setModel = vi.fn();
    getSlashCommand('model')!.handler!('', { conversationId: null, host: { setModel } });
    expect(setModel).not.toHaveBeenCalled();
    getSlashCommand('model')!.handler!('claude-opus-4-7', {
      conversationId: null,
      host: { setModel },
    });
    expect(setModel).toHaveBeenCalledWith('claude-opus-4-7');
  });
});
