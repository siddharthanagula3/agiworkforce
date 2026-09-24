import { describe, expect, it } from 'vitest';
import {
  WINDOW_CASCADE_OFFSET,
  broadcastRuntimeEvent,
  cascadeBounds,
  conversationIdFromRoute,
  planSignOut,
  planWindowOpen,
  resolveNavigationConflict,
  windowHoldingConversation,
  type OpenWindow,
  type WindowBounds,
} from '../windowRegistry';
import { MIN_WINDOW_HEIGHT, MIN_WINDOW_WIDTH } from '../garnishCore';

const ADA_CHAT = '7f3c1a22-9d5b-4f61-a0c4-1b2e3d4f5a6b';
const GRACE_CHAT = '0c9b8a77-1e2d-4c3b-9a8f-7e6d5c4b3a21';

const WORK_AREA = { x: 0, y: 25, width: 1512, height: 920 };

function bounds(overrides: Partial<WindowBounds> = {}): WindowBounds {
  return { x: 100, y: 100, width: 1280, height: 800, ...overrides };
}

function windowOn(id: number, route: string, overrides: Partial<OpenWindow> = {}): OpenWindow {
  return { id, primary: false, route, bounds: bounds(), ...overrides };
}

describe('the route that names a conversation', () => {
  it('reads the conversation out of a chat route and ignores the rest', () => {
    expect(conversationIdFromRoute(`/chat/${ADA_CHAT}`)).toBe(ADA_CHAT);
    expect(conversationIdFromRoute(`/chat/${ADA_CHAT}?highlightMessage=12`)).toBe(ADA_CHAT);
    expect(conversationIdFromRoute(`/chat/${ADA_CHAT.toUpperCase()}`)).toBe(ADA_CHAT);
  });

  it('does not mistake a section of the chat rail for a conversation', () => {
    for (const route of [
      '/chat',
      '/chat/library',
      '/chat/library?surface=artifact',
      '/chat/projects',
      '/chat/projects/summer-launch',
      '/chat/study',
      '/settings',
      '/',
    ]) {
      expect(conversationIdFromRoute(route), route).toBeNull();
    }
  });
});

describe('asking for a route in a window of its own', () => {
  it('opens a window for a conversation nothing is showing', () => {
    expect(planWindowOpen([windowOn(1, '/chat', { primary: true })], `/chat/${ADA_CHAT}`)).toEqual({
      action: 'create',
      route: `/chat/${ADA_CHAT}`,
    });
  });

  it('raises the window already on that conversation instead of opening a second', () => {
    const windows = [
      windowOn(1, '/chat', { primary: true }),
      windowOn(2, `/chat/${ADA_CHAT}`),
      windowOn(3, `/chat/${GRACE_CHAT}`),
    ];

    expect(planWindowOpen(windows, `/chat/${ADA_CHAT}`)).toEqual({ action: 'focus', windowId: 2 });
    expect(planWindowOpen(windows, `/chat/${GRACE_CHAT}`)).toEqual({
      action: 'focus',
      windowId: 3,
    });
  });

  it('lets two different conversations have a window each', () => {
    let windows = [windowOn(1, '/chat', { primary: true })];
    const first = planWindowOpen(windows, `/chat/${ADA_CHAT}`);
    expect(first).toEqual({ action: 'create', route: `/chat/${ADA_CHAT}` });

    windows = [...windows, windowOn(2, `/chat/${ADA_CHAT}`)];
    expect(planWindowOpen(windows, `/chat/${GRACE_CHAT}`)).toEqual({
      action: 'create',
      route: `/chat/${GRACE_CHAT}`,
    });
    expect(windowHoldingConversation(windows, ADA_CHAT)?.id).toBe(2);
  });

  it('opens a second window on a route that is not a conversation', () => {
    const windows = [windowOn(1, '/chat/library', { primary: true })];

    expect(planWindowOpen(windows, '/chat/library')).toEqual({
      action: 'create',
      route: '/chat/library',
    });
    expect(planWindowOpen(windows, '/chat/library?surface=artifact')).toEqual({
      action: 'create',
      route: '/chat/library?surface=artifact',
    });
  });

  it('refuses anything that is not an in-app route the shell may restore', () => {
    const windows = [windowOn(1, '/chat', { primary: true })];

    for (const route of [
      'https://elsewhere.example/chat',
      '//elsewhere.example/chat',
      'javascript:alert(1)',
      '/sign-in',
      '/api/me',
      '/chat/../admin',
      '',
    ]) {
      expect(planWindowOpen(windows, route), route).toEqual({
        action: 'refuse',
        reason: 'route-not-openable',
      });
    }
  });
});

describe('a window that navigates onto a conversation another one holds', () => {
  it('leaves the conversation with the window that had it', () => {
    const windows = [windowOn(1, '/chat', { primary: true }), windowOn(2, `/chat/${ADA_CHAT}`)];

    expect(resolveNavigationConflict(windows, 1, `/chat/${ADA_CHAT}`)).toEqual({ focus: 2 });
  });

  it('says nothing about a window navigating within its own conversation', () => {
    const windows = [windowOn(1, `/chat/${ADA_CHAT}`, { primary: true })];

    expect(
      resolveNavigationConflict(windows, 1, `/chat/${ADA_CHAT}?highlightMessage=4`),
    ).toBeNull();
  });

  it('says nothing about a route no conversation is behind', () => {
    const windows = [
      windowOn(1, '/chat/library', { primary: true }),
      windowOn(2, `/chat/${ADA_CHAT}`),
    ];

    expect(resolveNavigationConflict(windows, 1, '/chat/library?surface=artifact')).toBeNull();
    expect(resolveNavigationConflict(windows, 2, '/settings')).toBeNull();
  });
});

describe('where a second window opens', () => {
  it('steps off the window it was opened from rather than landing on it', () => {
    const from = bounds({ x: 200, y: 200, width: 900, height: 600 });

    expect(cascadeBounds(from, [from], WORK_AREA)).toMatchObject({
      x: 200 + WINDOW_CASCADE_OFFSET,
      y: 200 + WINDOW_CASCADE_OFFSET,
    });
  });

  it('steps again rather than stacking exactly on a window that is already there', () => {
    const from = bounds({ x: 200, y: 200, width: 900, height: 600 });
    const second = { ...from, x: 200 + WINDOW_CASCADE_OFFSET, y: 200 + WINDOW_CASCADE_OFFSET };

    expect(cascadeBounds(from, [from, second], WORK_AREA)).toMatchObject({
      x: 200 + WINDOW_CASCADE_OFFSET * 2,
      y: 200 + WINDOW_CASCADE_OFFSET * 2,
    });
  });

  it('keeps the whole window on the screen instead of stepping it off the edge', () => {
    const from = bounds({ x: 1400, y: 880, width: 1280, height: 800 });
    const opened = cascadeBounds(from, [], WORK_AREA);

    expect(opened.x + opened.width).toBeLessThanOrEqual(WORK_AREA.x + WORK_AREA.width);
    expect(opened.y + opened.height).toBeLessThanOrEqual(WORK_AREA.y + WORK_AREA.height);
    expect(opened.x).toBeGreaterThanOrEqual(WORK_AREA.x);
    expect(opened.y).toBeGreaterThanOrEqual(WORK_AREA.y);
  });

  it('never opens smaller than the layout can draw', () => {
    const opened = cascadeBounds(bounds({ width: 120, height: 90 }), [], WORK_AREA);

    expect(opened.width).toBe(MIN_WINDOW_WIDTH);
    expect(opened.height).toBe(MIN_WINDOW_HEIGHT);
  });
});

describe('what the account changing does to the windows that are open', () => {
  it('closes every window but one, and keeps the primary', () => {
    const windows = [
      windowOn(1, '/chat', { primary: true }),
      windowOn(2, `/chat/${ADA_CHAT}`),
      windowOn(3, '/chat/library'),
    ];

    expect(planSignOut(windows)).toEqual({ close: [2, 3], keep: 1 });
  });

  it('keeps one window even when no primary is left', () => {
    expect(planSignOut([windowOn(7, `/chat/${ADA_CHAT}`), windowOn(9, '/chat')])).toEqual({
      close: [9],
      keep: 7,
    });
  });

  it('has nothing to do when no window is open', () => {
    expect(planSignOut([])).toEqual({ close: [], keep: null });
  });
});

describe('who a runtime event reaches', () => {
  function target(destroyed = false) {
    const received: { channel: string; event: unknown }[] = [];
    return {
      received,
      isDestroyed: () => destroyed,
      send: (channel: string, event: unknown) => received.push({ channel, event }),
    };
  }

  it('reaches every open window, not only the first', () => {
    const targets = [target(), target(), target()];
    const revoked = { kind: 'permission-changed', capability: 'shell.run', state: 'denied' };

    expect(broadcastRuntimeEvent(targets, 'agi:runtime-event', revoked)).toBe(3);
    for (const one of targets) {
      expect(one.received).toEqual([{ channel: 'agi:runtime-event', event: revoked }]);
    }
  });

  it('steps over a window that has been torn down', () => {
    const open = target();
    const gone = target(true);

    expect(broadcastRuntimeEvent([gone, open], 'agi:runtime-event', { kind: 'policy' })).toBe(1);
    expect(gone.received).toEqual([]);
    expect(open.received).toHaveLength(1);
  });
});
