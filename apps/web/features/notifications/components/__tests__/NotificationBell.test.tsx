import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationFeedResponse } from '../../lib/notification-target';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  session: { isLoaded: true, isSignedIn: true },
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/lib/identity/client', () => ({ useSession: () => mocks.session }));
vi.mock('@/lib/client/csrf', () => ({ getCsrfToken: vi.fn(async () => 'csrf-token') }));

const { NotificationBell, formatNotificationTime } = await import('../NotificationBell');

const FEED: NotificationFeedResponse = {
  unreadCount: 1,
  notifications: [
    {
      id: 'n-1',
      category: 'research',
      severity: 'success',
      title: 'Research report ready',
      message: '“Battery market” is ready, drawn from 12 sources.',
      href: '/open/research/r-1',
      read: false,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'n-2',
      category: 'schedule',
      severity: 'error',
      title: 'Scheduled task failed',
      message: '“Weekly digest” failed.',
      href: null,
      read: true,
      createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    },
  ],
};

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session = { isLoaded: true, isSignedIn: true };
  fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'PATCH') return new Response(JSON.stringify({ updated: 1 }));
    return new Response(JSON.stringify(FEED));
  });
  vi.stubGlobal('fetch', fetchMock);
});

function patchBodies(): unknown[] {
  return fetchMock.mock.calls
    .filter(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH')
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
}

describe('NotificationBell', () => {
  it('renders nothing for a signed-out visitor and never fetches', () => {
    mocks.session = { isLoaded: true, isSignedIn: false };
    const { container } = render(<NotificationBell />);
    expect(container).toBeEmptyDOMElement();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('announces the unread count on the trigger', async () => {
    render(<NotificationBell />);
    expect(
      await screen.findByRole('button', { name: 'Notifications, 1 unread' }),
    ).toBeInTheDocument();
  });

  it('opens a notification where it points and marks it read', async () => {
    render(<NotificationBell />);
    fireEvent.click(await screen.findByRole('button', { name: 'Notifications, 1 unread' }));

    fireEvent.click(await screen.findByRole('button', { name: /Research report ready/ }));

    expect(mocks.push).toHaveBeenCalledWith('/open/research/r-1');
    await waitFor(() => expect(patchBodies()).toEqual([{ ids: ['n-1'] }]));
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
  });

  it('marks everything read in one request', async () => {
    render(<NotificationBell />);
    fireEvent.click(await screen.findByRole('button', { name: 'Notifications, 1 unread' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Mark all as read' }));

    await waitFor(() => expect(patchBodies()).toEqual([{ all: true }]));
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('restores the unread state and says so when marking all read fails', async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') return new Response(null, { status: 500 });
      return new Response(JSON.stringify(FEED));
    });
    render(<NotificationBell />);
    fireEvent.click(await screen.findByRole('button', { name: 'Notifications, 1 unread' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Mark all as read' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('could not be marked as read');
    expect(screen.getByRole('button', { name: 'Notifications, 1 unread' })).toBeInTheDocument();
  });

  it('offers a retry when the feed cannot load', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 503 }));
    render(<NotificationBell />);
    fireEvent.click(await screen.findByRole('button', { name: 'Notifications' }));

    expect(await screen.findByText('Notifications could not be loaded.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('formatNotificationTime', () => {
  it('reads recent times relatively', () => {
    const now = Date.parse('2026-09-17T12:00:00.000Z');
    expect(formatNotificationTime('2026-09-17T11:58:00.000Z', now)).toMatch(/2 minutes ago/);
    expect(formatNotificationTime('2026-09-17T09:00:00.000Z', now)).toMatch(/3 hours ago/);
    expect(formatNotificationTime('not a date', now)).toBe('');
  });
});
