import { describe, expect, it } from 'vitest';
import { TOOL_APPROVAL_ACTION_LABELS } from '@agiworkforce/types';
import {
  CODE_COPY,
  DEFAULT_CODE_ENVIRONMENT,
  contextWindowLabel,
  DEFAULT_CODE_FILTERS,
  environmentChipLabel,
  filterAndSortSessions,
  filtersAreDefault,
  formatTokenCount,
  groupCodeSessions,
  sessionTitleMatches,
} from './code-surface';
import type { CloudCodeSession } from '@agiworkforce/types';

describe('formatTokenCount', () => {
  it('reads a small count exactly and a large one in place value', () => {
    expect(formatTokenCount(0)).toBe('0');
    expect(formatTokenCount(999)).toBe('999');
    expect(formatTokenCount(1000)).toBe('1k');
    expect(formatTokenCount(61234)).toBe('61.2k');
    expect(formatTokenCount(1000000)).toBe('1M');
    expect(formatTokenCount(1500000)).toBe('1.5M');
  });

  it('never reads below zero', () => {
    expect(formatTokenCount(-40)).toBe('0');
  });
});

describe('contextWindowLabel', () => {
  it('reads used against the window with a whole percentage', () => {
    expect(contextWindowLabel(61234, 1000000)).toBe('61.2k / 1M (6%)');
    expect(contextWindowLabel(0, 200000)).toBe('0 / 200k (0%)');
  });

  it('stops at a full window rather than reporting more', () => {
    expect(contextWindowLabel(300000, 200000)).toBe('300k / 200k (100%)');
  });
});

describe('code surface approval copy', () => {
  it('refuses an action with the shared verb, never a second spelling', () => {
    expect(CODE_COPY.reject).toBe(TOOL_APPROVAL_ACTION_LABELS.deny);
    expect(CODE_COPY.reject).not.toBe('Reject');
    expect(CODE_COPY.approve).toContain(TOOL_APPROVAL_ACTION_LABELS.approve);
  });
});

describe('environmentChipLabel', () => {
  it('names the environment, and the network level only under Cloud', () => {
    expect(environmentChipLabel('cloud', 'none')).toBe('Cloud · Isolated');
    expect(environmentChipLabel('cloud', 'trusted')).toBe('Cloud · Trusted hosts');
    expect(environmentChipLabel('cloud', 'full')).toBe('Cloud · Full internet');
  });

  it('reads Local alone, since the folder has its own chip', () => {
    expect(environmentChipLabel('local', 'none')).toBe('Local');
    expect(environmentChipLabel('local', 'full')).toBe('Local');
  });

  it('starts on Cloud, so a browser never claims a local environment', () => {
    expect(DEFAULT_CODE_ENVIRONMENT).toBe('cloud');
  });
});

describe('session search', () => {
  const session = (id: string, title: string): CloudCodeSession =>
    ({
      id,
      title,
      networkAccess: 'none',
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    }) as CloudCodeSession;

  it('matches a title case-insensitively and treats a blank query as no filter', () => {
    expect(sessionTitleMatches('Fix the Login flow', 'login')).toBe(true);
    expect(sessionTitleMatches('Fix the Login flow', '  ')).toBe(true);
    expect(sessionTitleMatches('Fix the Login flow', 'billing')).toBe(false);
  });

  it('keeps only the sessions whose title holds the query', () => {
    const sessions = [session('a', 'Refactor billing'), session('b', 'Fix login')];
    const matched = filterAndSortSessions(sessions, { ...DEFAULT_CODE_FILTERS, query: 'LOGIN' });
    expect(matched.map((item) => item.id)).toEqual(['b']);
  });

  it('leaves the filter menu at its default while only a search is typed', () => {
    expect(filtersAreDefault({ ...DEFAULT_CODE_FILTERS, query: 'login' })).toBe(true);
  });
});

describe('groupCodeSessions', () => {
  const session = (id: string, state: string, archivedAt: string | null = null): CloudCodeSession =>
    ({ id, state, archivedAt }) as CloudCodeSession;

  it('puts open sessions under Ready and failed, closed or archived ones under Idle, keeping order', () => {
    const groups = groupCodeSessions([
      session('a', 'closed'),
      session('b', 'ready'),
      session('c', 'running'),
      session('d', 'failed'),
      session('e', 'ready', '2026-10-01T00:00:00Z'),
      session('f', 'provisioning'),
    ]);
    expect(groups.map((group) => [group.label, group.sessions.map((item) => item.id)])).toEqual([
      ['Ready', ['b', 'c', 'f']],
      ['Idle', ['a', 'd', 'e']],
    ]);
  });

  it('leaves out a group with no sessions', () => {
    expect(groupCodeSessions([session('a', 'ready')]).map((group) => group.id)).toEqual(['ready']);
    expect(groupCodeSessions([])).toEqual([]);
  });
});
