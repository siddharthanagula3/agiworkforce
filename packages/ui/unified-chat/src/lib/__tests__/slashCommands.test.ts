import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  parseSlashCommand,
  registerSlashCommand,
  registerBuiltinSlashCommands,
  resolveTypedSlashCommand,
  getSlashCommand,
  listSlashCommands,
  clearSlashCommands,
  BUILT_IN_SLASH_COMMANDS,
  filterSlashCommands,
  filterSlashCommandsByCapability,
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

describe('canonical slash menu catalog', () => {
  it('keeps prompt command metadata in the shared package', () => {
    expect(BUILT_IN_SLASH_COMMANDS.map((command) => command.id)).toEqual([
      'search',
      'think',
      'image',
      'code',
      'browser',
      'terminal',
      'database',
    ]);
  });

  it('filters desktop-only commands through the shared platform capability boundary', () => {
    const webCommands = filterSlashCommandsByCapability(BUILT_IN_SLASH_COMMANDS, () => false);
    expect(webCommands.map((command) => command.id)).toEqual(['search', 'think', 'image', 'code']);
  });

  it('filters by command name or description', () => {
    expect(filterSlashCommands('term').map((command) => command.id)).toEqual(['terminal']);
    expect(filterSlashCommands('reason').map((command) => command.id)).toEqual(['think']);
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

  it('/clear handler reports an error instead of doing nothing when the host cannot clear', () => {
    registerBuiltinSlashCommands();
    const run = () => getSlashCommand('clear')!.handler!('', { conversationId: 'c1', host: {} });
    expect(run).toThrow('cannot clear the conversation');
    expect(() => getSlashCommand('clear')!.handler!('', { conversationId: 'c1' })).toThrow();
  });

  it('/compact passes the conversation and optional focus to the host', async () => {
    registerBuiltinSlashCommands();
    const compactConversation = vi.fn(async () => undefined);
    const compact = getSlashCommand('compact')!;
    expect(compact.requiresConversation).toBe(true);

    await compact.handler!('', { conversationId: 'c1', host: { compactConversation } });
    expect(compactConversation).toHaveBeenLastCalledWith('c1', undefined);

    await compact.handler!('  code ', { conversationId: 'c1', host: { compactConversation } });
    expect(compactConversation).toHaveBeenLastCalledWith('c1', 'code');
  });

  it('/compact reports an error when the host cannot compact', () => {
    registerBuiltinSlashCommands();
    const compact = getSlashCommand('compact')!;
    expect(() => compact.handler!('', { conversationId: 'c1', host: {} })).toThrow(
      'cannot compact the conversation',
    );
    expect(() =>
      compact.handler!('', { conversationId: null, host: { compactConversation: vi.fn() } }),
    ).toThrow();
  });

  it('/model handler invokes host.setModel only when arg is non-empty', () => {
    registerBuiltinSlashCommands();
    const setModel = vi.fn();
    const fixtureModelId = 'fixture-command-model';
    getSlashCommand('model')!.handler!('', { conversationId: null, host: { setModel } });
    expect(setModel).not.toHaveBeenCalled();
    getSlashCommand('model')!.handler!(fixtureModelId, {
      conversationId: null,
      host: { setModel },
    });
    expect(setModel).toHaveBeenCalledWith(fixtureModelId);
  });
});

describe('resolveTypedSlashCommand', () => {
  beforeEach(() => {
    clearSlashCommands();
    registerBuiltinSlashCommands();
  });

  it('runs a typed command with its args when the host supports it', () => {
    const host = { compactConversation: vi.fn() };
    const typed = resolveTypedSlashCommand('/compact code', host, 'c1');
    expect(typed?.command.name).toBe('compact');
    expect(typed?.args).toBe('code');
  });

  it('leaves text alone when the host lacks the command or no chat exists', () => {
    expect(resolveTypedSlashCommand('/compact code', {}, 'c1')).toBeNull();
    expect(resolveTypedSlashCommand('/compact', { compactConversation: vi.fn() }, null)).toBeNull();
    expect(
      resolveTypedSlashCommand('/image a red fox', { toggleMediaMode: vi.fn() }, 'c1'),
    ).toBeNull();
    expect(
      resolveTypedSlashCommand('/unknown thing', { compactConversation: vi.fn() }, 'c1'),
    ).toBeNull();
    expect(
      resolveTypedSlashCommand('plain text', { compactConversation: vi.fn() }, 'c1'),
    ).toBeNull();
  });
});
