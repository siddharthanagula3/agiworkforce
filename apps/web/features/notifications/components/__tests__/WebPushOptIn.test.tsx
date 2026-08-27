import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  enableWebPush: vi.fn(),
  fetchVapidPublicKey: vi.fn(),
  isWebPushSupported: vi.fn(),
  readNotificationPermission: vi.fn(),
  registerNotificationWorker: vi.fn(),
  syncExistingSubscription: vi.fn(),
}));

vi.mock('@clerk/nextjs', () => ({ useAuth: mocks.useAuth }));
vi.mock('../../lib/web-push-client', () => ({
  enableWebPush: mocks.enableWebPush,
  fetchVapidPublicKey: mocks.fetchVapidPublicKey,
  isWebPushSupported: mocks.isWebPushSupported,
  readNotificationPermission: mocks.readNotificationPermission,
  registerNotificationWorker: mocks.registerNotificationWorker,
  syncExistingSubscription: mocks.syncExistingSubscription,
}));

const { WebPushOptIn } = await import('../WebPushOptIn');

const OFFER = 'Know when a run finishes';

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  mocks.useAuth.mockReturnValue({ isSignedIn: true });
  mocks.isWebPushSupported.mockReturnValue(true);
  mocks.readNotificationPermission.mockReturnValue('default');
  mocks.registerNotificationWorker.mockResolvedValue({});
  mocks.fetchVapidPublicKey.mockResolvedValue('a-public-key');
  mocks.enableWebPush.mockResolvedValue('enabled');
});

describe('WebPushOptIn', () => {
  it('registers the worker and offers the prompt without asking for permission on mount', async () => {
    render(<WebPushOptIn />);

    await waitFor(() => expect(screen.getByText(OFFER)).toBeInTheDocument());
    expect(mocks.registerNotificationWorker).toHaveBeenCalled();
    expect(mocks.enableWebPush).not.toHaveBeenCalled();
  });

  it('raises the browser prompt only from the button', async () => {
    render(<WebPushOptIn />);
    await waitFor(() => expect(screen.getByText(OFFER)).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Turn on' }));

    expect(mocks.enableWebPush).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByText(OFFER)).not.toBeInTheDocument());
  });

  it('stays hidden when the deployment publishes no VAPID key', async () => {
    mocks.fetchVapidPublicKey.mockResolvedValue(null);

    render(<WebPushOptIn />);

    await waitFor(() => expect(mocks.fetchVapidPublicKey).toHaveBeenCalled());
    expect(screen.queryByText(OFFER)).not.toBeInTheDocument();
  });

  it('re-registers instead of offering when permission is already granted', async () => {
    mocks.readNotificationPermission.mockReturnValue('granted');

    render(<WebPushOptIn />);

    await waitFor(() => expect(mocks.syncExistingSubscription).toHaveBeenCalled());
    expect(screen.queryByText(OFFER)).not.toBeInTheDocument();
    expect(mocks.fetchVapidPublicKey).not.toHaveBeenCalled();
  });

  it('does not re-offer after the user says not now', async () => {
    const first = render(<WebPushOptIn />);
    await waitFor(() => expect(screen.getByText(OFFER)).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    await waitFor(() => expect(screen.queryByText(OFFER)).not.toBeInTheDocument());
    first.unmount();

    render(<WebPushOptIn />);
    await waitFor(() => expect(mocks.registerNotificationWorker).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(OFFER)).not.toBeInTheDocument();
  });

  it('offers nothing to a signed-out visitor', async () => {
    mocks.useAuth.mockReturnValue({ isSignedIn: false });

    render(<WebPushOptIn />);

    await waitFor(() => expect(mocks.registerNotificationWorker).not.toHaveBeenCalled());
    expect(screen.queryByText(OFFER)).not.toBeInTheDocument();
  });

  it('offers nothing in a browser that cannot receive push', async () => {
    mocks.isWebPushSupported.mockReturnValue(false);

    render(<WebPushOptIn />);

    await waitFor(() => expect(mocks.registerNotificationWorker).not.toHaveBeenCalled());
    expect(screen.queryByText(OFFER)).not.toBeInTheDocument();
  });
});
