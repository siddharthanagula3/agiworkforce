import { describe, it, expect } from 'vitest';
import {
  AGI_WORK_TURN_TOOL_CALL_CAP,
  CHAT_TURN_TOOL_CALL_CAP,
  createToolTurnGovernor,
  normaliseSearchQuery,
  resolveTurnToolCallCap,
  turnToolCapRowSummary,
} from '../tool-turn-governor';

const SEARCH = 'web_search';
const FETCH = 'url_fetch';

const nameOf = (tool: { name: string }) => tool.name;
const toolList = [{ name: SEARCH }, { name: FETCH }];

describe('normaliseSearchQuery', () => {
  it('treats case, punctuation and word order as the same query', () => {
    expect(normaliseSearchQuery('Best CRM, 2026?')).toBe(normaliseSearchQuery('2026 best crm'));
  });

  it('keeps genuinely different queries apart', () => {
    expect(normaliseSearchQuery('best crm 2026')).not.toBe(normaliseSearchQuery('best erp 2026'));
  });

  it('returns an empty key for a non-string or blank query', () => {
    expect(normaliseSearchQuery(undefined)).toBe('');
    expect(normaliseSearchQuery('   ')).toBe('');
  });
});

describe('resolveTurnToolCallCap', () => {
  it('gives an agent turn a larger cap than a chat turn', () => {
    expect(resolveTurnToolCallCap(false)).toBe(CHAT_TURN_TOOL_CALL_CAP);
    expect(resolveTurnToolCallCap(true)).toBe(AGI_WORK_TURN_TOOL_CALL_CAP);
    expect(AGI_WORK_TURN_TOOL_CALL_CAP).toBeGreaterThan(CHAT_TURN_TOOL_CALL_CAP);
  });
});

describe('createToolTurnGovernor · withdrawal', () => {
  it('removes a withdrawn tool from the offered set and leaves the rest', () => {
    const governor = createToolTurnGovernor(CHAT_TURN_TOOL_CALL_CAP);
    expect(governor.offered(toolList, nameOf)).toHaveLength(2);

    governor.withdraw(SEARCH, 'unavailable');

    expect(governor.offered(toolList, nameOf)).toEqual([{ name: FETCH }]);
    expect(governor.isWithdrawn(SEARCH)).toBe(true);
    expect(governor.withdrawalReason(SEARCH)).toBe('unavailable');
  });

  it('keeps the first reason when a tool is withdrawn twice', () => {
    const governor = createToolTurnGovernor(CHAT_TURN_TOOL_CALL_CAP);
    governor.withdraw(SEARCH, 'unavailable');
    governor.withdraw(SEARCH, 'budget');
    expect(governor.withdrawalReason(SEARCH)).toBe('unavailable');
  });

  it('ignores an empty tool name so provider-native tools stay on offer', () => {
    const governor = createToolTurnGovernor(CHAT_TURN_TOOL_CALL_CAP);
    governor.withdraw('', 'unavailable');
    expect(governor.offered([{ name: '' }], nameOf)).toHaveLength(1);
  });

  it('passes an undefined tool list straight through', () => {
    const governor = createToolTurnGovernor(CHAT_TURN_TOOL_CALL_CAP);
    expect(governor.offered(undefined, nameOf)).toBeUndefined();
  });
});

describe('createToolTurnGovernor · repeated query breaker', () => {
  it('reports the second run of a near-identical query as a repeat', () => {
    const governor = createToolTurnGovernor(CHAT_TURN_TOOL_CALL_CAP);
    expect(governor.noteQuery(SEARCH, 'best CRM 2026')).toBe('new');
    expect(governor.noteQuery(SEARCH, 'Best crm, 2026!')).toBe('repeat');
  });

  it('does not trip on a different query', () => {
    const governor = createToolTurnGovernor(CHAT_TURN_TOOL_CALL_CAP);
    expect(governor.noteQuery(SEARCH, 'best crm 2026')).toBe('new');
    expect(governor.noteQuery(SEARCH, 'best erp 2026')).toBe('new');
  });

  it('never trips on an unreadable query', () => {
    const governor = createToolTurnGovernor(CHAT_TURN_TOOL_CALL_CAP);
    expect(governor.noteQuery(SEARCH, null)).toBe('new');
    expect(governor.noteQuery(SEARCH, null)).toBe('new');
  });

  it('scopes the query history to one tool', () => {
    const governor = createToolTurnGovernor(CHAT_TURN_TOOL_CALL_CAP);
    expect(governor.noteQuery(SEARCH, 'same text')).toBe('new');
    expect(governor.noteQuery(FETCH, 'same text')).toBe('new');
  });
});

describe('createToolTurnGovernor · turn cap', () => {
  it('allows exactly the cap and refuses the call after it', () => {
    const cap = 3;
    const governor = createToolTurnGovernor(cap);
    for (let i = 0; i < cap; i += 1) {
      expect(governor.countCall().withinCap).toBe(true);
    }
    expect(governor.capReached()).toBe(true);
    const overflow = governor.countCall();
    expect(overflow.withinCap).toBe(false);
    expect(overflow.used).toBe(cap + 1);
  });

  it('announces the stopped row exactly once', () => {
    const governor = createToolTurnGovernor(1);
    governor.countCall();
    expect(governor.claimCapAnnouncement()).toBe(true);
    expect(governor.claimCapAnnouncement()).toBe(false);
  });

  it('names the number of calls in the stopped row', () => {
    expect(turnToolCapRowSummary(16)).toBe('Stopped after 16 tool calls');
  });
});
