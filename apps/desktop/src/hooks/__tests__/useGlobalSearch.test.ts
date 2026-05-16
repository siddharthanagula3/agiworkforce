import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';

// ── Store mocks ───────────────────────────────────────────────────────────────

vi.mock('../../stores/chat/chatStore', () => ({
  useChatStore: vi.fn((selector) =>
    selector({
      conversations: [
        {
          id: 'c1',
          title: 'Multi-provider routing',
          lastMessage: '',
          pinned: false,
          updatedAt: new Date('2026-01-01'),
        },
        {
          id: 'c2',
          title: 'Quarterly KPIs',
          lastMessage: '',
          pinned: false,
          updatedAt: new Date('2026-01-02'),
        },
        {
          id: 'c3',
          title: 'Legal contract review',
          lastMessage: '',
          pinned: false,
          updatedAt: new Date('2026-01-03'),
        },
      ],
    }),
  ),
}));

vi.mock('../../stores/projectStore', () => ({
  useProjectStore: vi.fn((selector) =>
    selector({
      projects: [
        {
          id: 'p1',
          name: 'Sales pipeline',
          description: 'Track deals',
          isArchived: false,
          createdAt: '',
          updatedAt: '',
          customInstructions: '',
          files: [],
          conversationIds: [],
        },
        {
          id: 'p2',
          name: 'Hiring loop',
          description: 'Recruiting workflow',
          isArchived: false,
          createdAt: '',
          updatedAt: '',
          customInstructions: '',
          files: [],
          conversationIds: [],
        },
        {
          id: 'p3',
          name: 'Archived project',
          description: 'Old stuff',
          isArchived: true,
          createdAt: '',
          updatedAt: '',
          customInstructions: '',
          files: [],
          conversationIds: [],
        },
      ],
    }),
  ),
}));

vi.mock('../../stores/skillMarketplaceStore', () => ({
  useSkillMarketplaceStore: vi.fn((selector) =>
    selector({
      skills: [
        {
          name: 'Humanizer',
          description: 'Improve writing tone',
          category: 'writing',
          isActive: false,
          sourceType: 'builtin',
          requiresBins: [],
          requiresEnv: [],
          supportedOs: [],
          allowedTools: [],
          contextMode: 'inject',
        },
        {
          name: 'Brand guidelines',
          description: 'Apply brand voice',
          category: 'writing',
          isActive: true,
          sourceType: 'builtin',
          requiresBins: [],
          requiresEnv: [],
          supportedOs: [],
          allowedTools: [],
          contextMode: 'inject',
        },
      ],
    }),
  ),
}));

vi.mock('../../stores/connectorsStore', () => ({
  useConnectorsStore: vi.fn((selector) => selector({ connectedIds: ['gmail'] })),
}));

vi.mock('../../components/Connectors/connectorDefinitions', () => ({
  CONNECTORS: [
    { id: 'gmail', name: 'Gmail', description: 'Email integration', provider: 'google' },
    { id: 'notion', name: 'Notion', description: 'Workspace integration', provider: 'notion' },
    { id: 'slack', name: 'Slack', description: 'Messaging integration', provider: 'slack' },
  ],
}));

vi.mock('fuse.js', async () => {
  const actual = await vi.importActual<typeof import('fuse.js')>('fuse.js');
  return actual;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

import { useGlobalSearch } from '../useGlobalSearch';

describe('useGlobalSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('returns all groups with empty query after debounce', async () => {
    const { result } = renderHook(() => useGlobalSearch(''));
    act(() => {
      vi.runAllTimers();
    });

    const groups = result.current;
    const groupNames = groups.map((g) => g.group);
    expect(groupNames).toContain('Chats');
    expect(groupNames).toContain('Projects');
    expect(groupNames).toContain('Skills');
    expect(groupNames).toContain('Settings');
  });

  it('shows only connected connectors when query is empty', async () => {
    const { result } = renderHook(() => useGlobalSearch(''));
    act(() => {
      vi.runAllTimers();
    });

    const connGroup = result.current.find((g) => g.group === 'Connectors');
    expect(connGroup).toBeDefined();
    // Only gmail is connected
    expect(connGroup!.items.every((i) => i.id === 'connector-gmail')).toBe(true);
  });

  it('shows all connectors when query matches non-connected connector', async () => {
    const { result } = renderHook(() => useGlobalSearch('notion'));
    act(() => {
      vi.runAllTimers();
    });

    const connGroup = result.current.find((g) => g.group === 'Connectors');
    expect(connGroup).toBeDefined();
    expect(connGroup!.items.some((i) => i.id === 'connector-notion')).toBe(true);
  });

  it('filters chats by query using fuzzy search', async () => {
    const { result } = renderHook(() => useGlobalSearch('routing'));
    act(() => {
      vi.runAllTimers();
    });

    const chatGroup = result.current.find((g) => g.group === 'Chats');
    expect(chatGroup).toBeDefined();
    expect(chatGroup!.items.some((i) => i.title.toLowerCase().includes('routing'))).toBe(true);
  });

  it('excludes archived projects', async () => {
    const { result } = renderHook(() => useGlobalSearch(''));
    act(() => {
      vi.runAllTimers();
    });

    const projGroup = result.current.find((g) => g.group === 'Projects');
    expect(projGroup).toBeDefined();
    expect(projGroup!.items.every((i) => i.id !== 'p3')).toBe(true);
  });

  it('debounces the query — all 5 groups present at empty query, narrows after 200ms', () => {
    const { result, rerender: rerenderHook } = renderHook(({ q }) => useGlobalSearch(q), {
      initialProps: { q: '' },
    });

    act(() => {
      vi.runAllTimers();
    });
    // Empty query shows all groups
    const allGroups = result.current.map((g) => g.group);
    expect(allGroups).toContain('Chats');

    rerenderHook({ q: 'xyzzyplonkzomg' });
    // Before timer fires the debounced value hasn't changed — groups still populated
    const chatGroupBeforeDebounce = result.current.find((g) => g.group === 'Chats');
    expect(chatGroupBeforeDebounce).toBeDefined();

    act(() => {
      vi.advanceTimersByTime(200);
    });
    // After 200ms query resolves and no group has matching items
    expect(result.current.every((g) => g.items.length === 0)).toBe(true);
  });

  it('returns empty groups when nothing matches query', async () => {
    const { result } = renderHook(() => useGlobalSearch('xyzzyplonkzomg'));
    act(() => {
      vi.runAllTimers();
    });

    expect(result.current.every((g) => g.items.length === 0)).toBe(true);
  });

  it('result items have required id and title fields', async () => {
    const { result } = renderHook(() => useGlobalSearch(''));
    act(() => {
      vi.runAllTimers();
    });

    for (const group of result.current) {
      for (const item of group.items) {
        expect(item.id).toBeTruthy();
        expect(item.title).toBeTruthy();
      }
    }
  });
});
