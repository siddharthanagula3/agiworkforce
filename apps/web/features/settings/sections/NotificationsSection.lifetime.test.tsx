import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PreferenceOwner } from '@/app/settings/_lib/preferences-client';
import type { RequestAuthority } from '@/lib/identity/request-authority';
import type { NotificationSnapshot } from '../services/notification-preferences-client';
import { AVAILABLE_NOW_LABEL, SURFACE_STATUS } from '@/lib/surface-status';
import { NotificationsSection } from './NotificationsSection';

const mocks = vi.hoisted(() => ({ owner: null as PreferenceOwner | null, read: vi.fn(), save: vi.fn(), browserMount: vi.fn(), browserUnmount: vi.fn(), browserOperation: vi.fn() }));
vi.mock('../hooks/use-preference-owner', async (original) => ({
  ...await original<typeof import('../hooks/use-preference-owner')>(),
  usePreferenceOwner: () => mocks.owner,
}));
vi.mock('../services/notification-preferences-client', () => ({
  readNotificationPreferences: mocks.read,
  saveNotificationPreferences: mocks.save,
}));
vi.mock('@/features/notifications', async (original) => {
  const React = await import('react');
  return {
    ...await original<typeof import('@/features/notifications')>(),
    useWebPushToggle: function useBrowserToggle() {
      const [busy, setBusy] = React.useState(false);
      React.useEffect(() => { mocks.browserMount(); return () => { mocks.browserUnmount(); }; }, []);
      return {
        checked: false, disabled: busy, unavailable: false, description: '',
        onCheckedChange: async () => {
          setBusy(true);
          await mocks.browserOperation();
          setBusy(false);
        },
      };
    },
  };
});

function owner(incarnation: number): PreferenceOwner {
  const candidate: PreferenceOwner = {
    incarnation,
    session: { userId: String(incarnation), sessionId: String(incarnation), isCurrent: () => mocks.owner === candidate, getToken: async () => 'token' },
    isCurrent: () => mocks.owner === candidate,
  };
  return candidate;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function retainChange(label: string) {
  const node = screen.getByRole('combobox', { name: label });
  const key = Object.keys(node).find((candidate) => candidate.startsWith('__reactProps$'));
  if (!key) throw new Error('Rendered React select props are unavailable');
  const props = (node as unknown as Record<string, { onChange: (event: { target: { value: string } }) => void }>)[key];
  if (!props) throw new Error('Rendered React select props are missing');
  return props.onChange;
}
const ready = () => waitFor(() => expect(screen.getByRole('combobox', { name: 'Reply ready' })).toBeEnabled());
const snapshot = (enabled: boolean): NotificationSnapshot => ({ stored: { browserReplyReady: enabled }, version: 'v1' });

beforeEach(() => {
  mocks.owner = owner(1);
  mocks.browserMount.mockReset();
  mocks.browserUnmount.mockReset();
  mocks.browserOperation.mockReset().mockResolvedValue(undefined);
  mocks.read.mockReset().mockResolvedValue(snapshot(true));
  mocks.save.mockReset().mockResolvedValue(snapshot(false));
});

describe('notification view admission', () => {
  it('preserves the browser operation and mounted row across preference owner changes', async () => {
    const browser = deferred<void>();
    mocks.browserOperation.mockReturnValue(browser.promise);
    const view = render(<NotificationsSection />);
    await ready();
    const toggle = screen.getByRole('switch', { name: 'Agent run updates' });
    fireEvent.click(toggle);
    expect(toggle).toBeDisabled();
    mocks.owner = owner(2);
    view.rerender(<NotificationsSection surfaceStatus={{ ...SURFACE_STATUS, mobile: AVAILABLE_NOW_LABEL }} />);
    await ready();
    expect(screen.getByRole('switch', { name: 'Agent run updates' })).toBe(toggle);
    expect(toggle).toBeDisabled();
    expect(mocks.browserMount).toHaveBeenCalledTimes(1);
    expect(mocks.browserUnmount).not.toHaveBeenCalled();
    await act(async () => { browser.resolve(); await browser.promise; });
    expect(toggle).toBeEnabled();
    expect(mocks.browserOperation).toHaveBeenCalledTimes(1);
  });

  it('does not load or edit without an admitted owner', () => {
    mocks.owner = null;
    render(<NotificationsSection />);
    expect(screen.getByRole('combobox', { name: 'Reply ready' })).toBeDisabled();
    expect(mocks.read).not.toHaveBeenCalled();
    expect(screen.getByText('Sign in to load account preferences.')).toBeInTheDocument();
  });

  it('retires the actual old handler after a fresh confirmed read', async () => {
    mocks.read.mockResolvedValueOnce(snapshot(true)).mockResolvedValue(snapshot(false));
    render(<NotificationsSection />);
    await ready();
    const oldChange = retainChange('Reply ready');
    act(() => oldChange({ target: { value: 'off' } }));
    await screen.findByText('Saved');
    await ready();
    act(() => oldChange({ target: { value: 'browserReplyReady' } }));
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('combobox', { name: 'Reply ready' })).toHaveValue('off');
    fireEvent.change(screen.getByRole('combobox', { name: 'Reply ready' }), { target: { value: 'browserReplyReady' } });
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
  });

  it('admits one write synchronously even if a retained callback fires twice', async () => {
    mocks.save.mockReturnValue(new Promise(() => {}));
    render(<NotificationsSection />);
    await ready();
    const change = retainChange('Reply ready');
    act(() => { change({ target: { value: 'off' } }); change({ target: { value: 'off' } }); });
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('combobox', { name: 'Reply ready' })).toBeDisabled();
  });

  it('rejects retained callbacks after account replacement', async () => {
    const view = render(<NotificationsSection />);
    await ready();
    const oldChange = retainChange('Reply ready');
    mocks.owner = owner(2);
    view.rerender(<NotificationsSection />);
    await ready();
    act(() => oldChange({ target: { value: 'off' } }));
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('does not revive a retained mobile option after an observed hide/show cycle', async () => {
    const released = { ...SURFACE_STATUS, mobile: AVAILABLE_NOW_LABEL };
    const view = render(<NotificationsSection surfaceStatus={released} />);
    await ready();
    const oldChange = retainChange('Scheduled task finished');
    view.rerender(<NotificationsSection surfaceStatus={SURFACE_STATUS} />);
    await ready();
    act(() => oldChange({ target: { value: 'emailScheduleDone+mobilePushScheduleDone' } }));
    expect(mocks.save).not.toHaveBeenCalled();
    view.rerender(<NotificationsSection surfaceStatus={released} />);
    await ready();
    act(() => oldChange({ target: { value: 'emailScheduleDone+mobilePushScheduleDone' } }));
    expect(mocks.save).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('combobox', { name: 'Scheduled task finished' }), { target: { value: 'emailScheduleDone+mobilePushScheduleDone' } });
    expect(mocks.save).toHaveBeenCalledWith(expect.anything(), { emailScheduleDone: true, mobilePushScheduleDone: true });
  });

  it('does not apply an old account read to its replacement', async () => {
    const old = deferred<NotificationSnapshot>();
    mocks.read.mockReturnValueOnce(old.promise).mockResolvedValue(snapshot(false));
    const view = render(<NotificationsSection />);
    const authority = mocks.read.mock.calls[0]?.[0] as RequestAuthority;
    mocks.owner = owner(2);
    view.rerender(<NotificationsSection />);
    await ready();
    await act(async () => { old.resolve(snapshot(true)); await old.promise; });
    expect(authority.isCurrent()).toBe(false);
    expect(screen.getByRole('combobox', { name: 'Reply ready' })).toHaveValue('off');
  });

  it('retires a write on unmount without issuing its recovery GET', async () => {
    const write = deferred<NotificationSnapshot>();
    mocks.save.mockReturnValueOnce(write.promise);
    const view = render(<NotificationsSection />);
    await ready();
    const oldChange = retainChange('Reply ready');
    act(() => oldChange({ target: { value: 'off' } }));
    const authority = mocks.save.mock.calls[0]?.[0] as RequestAuthority;
    view.unmount();
    render(<NotificationsSection />);
    await ready();
    await act(async () => { write.resolve(snapshot(false)); await write.promise; });
    act(() => oldChange({ target: { value: 'off' } }));
    expect(authority.isCurrent()).toBe(false);
    expect(mocks.read).toHaveBeenCalledTimes(2);
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Saved')).toBeNull();
  });
});
