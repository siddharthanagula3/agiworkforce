import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mocks = vi.hoisted(() => ({
  useAuditDestination: vi.fn(),
  saveMutate: vi.fn(),
  toggleMutate: vi.fn(),
  removeMutate: vi.fn(),
}));

vi.mock('../../hooks/use-audit-destination', () => ({
  useAuditDestination: mocks.useAuditDestination,
  useSaveAuditDestination: () => ({ mutate: mocks.saveMutate, isPending: false, error: null }),
  useToggleAuditDestination: () => ({ mutate: mocks.toggleMutate, isPending: false, error: null }),
  useDeleteAuditDestination: () => ({ mutate: mocks.removeMutate, isPending: false, error: null }),
}));

import { WorkspaceAuditStreaming } from '../WorkspaceAuditStreaming';

const ENDPOINT = 'https://siem.example.test/hook';
const SECRET = 'f'.repeat(64);

function destination(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: 'org-1',
    endpointUrl: ENDPOINT,
    secretPrefix: 'ffffffff',
    enabled: true,
    lastDeliveredAt: '2026-09-16T00:00:00.000Z',
    lastAttemptAt: '2026-09-16T00:00:00.000Z',
    lastStatus: 'HTTP 200',
    consecutiveFailures: 0,
    createdAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function loaded(value: unknown) {
  mocks.useAuditDestination.mockReturnValue({
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    data: value,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('WorkspaceAuditStreaming', () => {
  it('renders nothing for a member who does not administer the workspace', () => {
    loaded(null);
    const { container } = render(<WorkspaceAuditStreaming />);
    expect(container).toBeEmptyDOMElement();
  });

  it('saves a new https endpoint and shows the signing secret exactly once', async () => {
    loaded({ organizationId: 'org-1', destination: null });
    mocks.saveMutate.mockImplementation((_input, options) =>
      options.onSuccess({
        organizationId: 'org-1',
        destination: destination(),
        signingSecret: SECRET,
      }),
    );
    const user = userEvent.setup();
    render(<WorkspaceAuditStreaming />);

    const start = screen.getByRole('button', { name: 'Start streaming' });
    expect(start).toBeDisabled();

    await user.type(screen.getByLabelText('Audit destination endpoint'), ENDPOINT);
    await user.click(start);

    expect(mocks.saveMutate).toHaveBeenCalledWith(
      { endpointUrl: ENDPOINT, enabled: true },
      expect.anything(),
    );
    expect(screen.getByText(SECRET)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'I have stored it' }));
    expect(screen.queryByText(SECRET)).not.toBeInTheDocument();
  });

  it('shows a failing destination as failing, and pauses without asking', async () => {
    loaded({ organizationId: 'org-1', destination: destination({ consecutiveFailures: 3 }) });
    const user = userEvent.setup();
    render(<WorkspaceAuditStreaming />);

    expect(screen.getByText('Failing, 3 in a row')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Pause delivery' }));
    expect(mocks.toggleMutate).toHaveBeenCalledWith(false);
  });

  it('asks before rotating the secret and names what breaks', async () => {
    loaded({ organizationId: 'org-1', destination: destination() });
    const user = userEvent.setup();
    render(<WorkspaceAuditStreaming />);

    await user.click(screen.getByRole('button', { name: 'Rotate secret' }));

    expect(mocks.saveMutate).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(/rejects them until it is updated/);
  });

  it('asks before removing the destination and only removes on confirm', async () => {
    loaded({ organizationId: 'org-1', destination: destination() });
    mocks.removeMutate.mockImplementation((_input, options) => options.onSettled());
    const user = userEvent.setup();
    render(<WorkspaceAuditStreaming />);

    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(mocks.removeMutate).not.toHaveBeenCalled();

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(ENDPOINT);
    await user.click(screen.getByRole('button', { name: 'Remove destination' }));
    expect(mocks.removeMutate).toHaveBeenCalledOnce();
  });
});
