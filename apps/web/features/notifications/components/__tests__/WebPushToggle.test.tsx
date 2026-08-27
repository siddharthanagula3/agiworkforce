import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  disableWebPush: vi.fn(),
  enableWebPush: vi.fn(),
  isWebPushSupported: vi.fn(),
  readNotificationPermission: vi.fn(),
  registerNotificationWorker: vi.fn(),
  getSubscription: vi.fn(),
}));

vi.mock('../../lib/web-push-client', () => ({
  disableWebPush: mocks.disableWebPush,
  enableWebPush: mocks.enableWebPush,
  isWebPushSupported: mocks.isWebPushSupported,
  readNotificationPermission: mocks.readNotificationPermission,
  registerNotificationWorker: mocks.registerNotificationWorker,
}));

const { WebPushToggle } = await import('../WebPushToggle');

const SWITCH = { name: 'Browser notifications' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isWebPushSupported.mockReturnValue(true);
  mocks.readNotificationPermission.mockReturnValue('default');
  mocks.getSubscription.mockResolvedValue(null);
  mocks.registerNotificationWorker.mockResolvedValue({
    pushManager: { getSubscription: mocks.getSubscription },
  });
  mocks.enableWebPush.mockResolvedValue('enabled');
  mocks.disableWebPush.mockResolvedValue(true);
});

describe('WebPushToggle', () => {
  it('reads off when the browser holds no subscription', async () => {
    render(<WebPushToggle />);

    await waitFor(() =>
      expect(screen.getByRole('switch', SWITCH)).toHaveAttribute('aria-checked', 'false'),
    );
    expect(screen.getByText(/Get told when a run finishes/)).toBeInTheDocument();
  });

  it('reads on when this browser is already registered', async () => {
    mocks.getSubscription.mockResolvedValue({ endpoint: 'https://push.example.test/a' });

    render(<WebPushToggle />);

    await waitFor(() =>
      expect(screen.getByRole('switch', SWITCH)).toHaveAttribute('aria-checked', 'true'),
    );
  });

  it('is the way back on after the one-time offer was dismissed', async () => {
    render(<WebPushToggle />);
    await waitFor(() => expect(screen.getByRole('switch', SWITCH)).toBeEnabled());

    await userEvent.click(screen.getByRole('switch', SWITCH));

    expect(mocks.enableWebPush).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.getByRole('switch', SWITCH)).toHaveAttribute('aria-checked', 'true'),
    );
  });

  it('is the way back off again', async () => {
    mocks.getSubscription.mockResolvedValue({ endpoint: 'https://push.example.test/a' });
    render(<WebPushToggle />);
    await waitFor(() =>
      expect(screen.getByRole('switch', SWITCH)).toHaveAttribute('aria-checked', 'true'),
    );

    await userEvent.click(screen.getByRole('switch', SWITCH));

    expect(mocks.disableWebPush).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.getByRole('switch', SWITCH)).toHaveAttribute('aria-checked', 'false'),
    );
  });

  it('says so and stays inert when the site is blocked in browser settings', async () => {
    mocks.readNotificationPermission.mockReturnValue('denied');

    render(<WebPushToggle />);

    await waitFor(() => expect(screen.getByText(/blocked for this site/)).toBeInTheDocument());
    expect(screen.getByRole('switch', SWITCH)).toBeDisabled();
  });

  it('reports an unsupported browser rather than offering a switch that does nothing', () => {
    mocks.isWebPushSupported.mockReturnValue(false);

    render(<WebPushToggle />);

    expect(screen.getByText('This browser cannot receive notifications.')).toBeInTheDocument();
    expect(screen.getByRole('switch', SWITCH)).toBeDisabled();
  });

  it('falls back to off when the permission prompt is refused mid-toggle', async () => {
    mocks.enableWebPush.mockResolvedValue('denied');
    render(<WebPushToggle />);
    await waitFor(() => expect(screen.getByRole('switch', SWITCH)).toBeEnabled());

    await userEvent.click(screen.getByRole('switch', SWITCH));

    await waitFor(() => expect(screen.getByText(/blocked for this site/)).toBeInTheDocument());
  });
});
