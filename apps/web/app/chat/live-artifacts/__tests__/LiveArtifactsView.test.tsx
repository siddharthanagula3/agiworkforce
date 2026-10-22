import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  session: { isLoaded: true, isSignedIn: true },
  listLiveArtifacts: vi.fn(),
  removeLiveArtifact: vi.fn(),
  setLiveArtifactRefreshPolicy: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/lib/identity/client', () => ({
  useCurrentUser: vi.fn(),
  useSession: () => mocks.session,
  useSignOut: vi.fn(),
}));
vi.mock('../live-artifact-client', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listLiveArtifacts: mocks.listLiveArtifacts,
  removeLiveArtifact: mocks.removeLiveArtifact,
  setLiveArtifactRefreshPolicy: mocks.setLiveArtifactRefreshPolicy,
}));
vi.mock('@shared/components/layout/WebAppShell', () => ({
  WebAppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { LiveArtifactsView } from '../LiveArtifactsView';
import { LiveArtifactRequestError } from '../live-artifact-client';
import LiveArtifactsRoute, { metadata } from '../page';
import type { LiveArtifact } from '../live-artifact-contract';

const DAY = 86_400_000;

function liveArtifact(overrides: Partial<LiveArtifact>): LiveArtifact {
  return {
    artifactId: 'c0ffee00-0000-4000-8000-000000000001',
    conversationId: 'c0ffee00-0000-4000-8000-0000000000aa',
    title: 'Weekly growth metrics',
    type: 'html',
    connectors: ['google_drive', 'slack'],
    allowedTools: [],
    refreshPolicy: 'on_open',
    lastRefreshedAt: new Date(Date.now() - 2 * DAY).toISOString(),
    readiness: 'ready',
    missingConnectors: [],
    createdAt: new Date(Date.now() - 9 * DAY).toISOString(),
    updatedAt: new Date(Date.now() - 9 * DAY).toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session = { isLoaded: true, isSignedIn: true };
});

describe('Live artifacts page', () => {
  it('lists each live artifact as a card with title, subtitle, relative time and a menu, then a new tile', async () => {
    mocks.listLiveArtifacts.mockResolvedValue([
      liveArtifact({}),
      liveArtifact({
        artifactId: 'c0ffee00-0000-4000-8000-000000000002',
        title: 'Q2 pipeline: West region',
        readiness: 'needs_connection',
        missingConnectors: ['salesforce'],
        lastRefreshedAt: null,
        createdAt: new Date(Date.now() - 4 * DAY).toISOString(),
      }),
    ]);
    render(<LiveArtifactsView />);

    const cards = await screen.findAllByTestId('live-artifact-card');
    expect(cards).toHaveLength(2);
    const first = within(cards[0]!);
    expect(first.getByText('Weekly growth metrics')).toBeInTheDocument();
    expect(first.getByText('Reads Google Drive and Slack')).toHaveClass('truncate');
    expect(first.getByText('2 days ago')).toBeInTheDocument();
    expect(
      first.getByRole('button', { name: 'Options for Weekly growth metrics' }),
    ).toBeInTheDocument();
    const second = within(cards[1]!);
    expect(second.getByText('Connect Salesforce to refresh')).toBeInTheDocument();
    expect(second.getByText('4 days ago')).toBeInTheDocument();

    const tile = screen.getByTestId('live-artifact-new');
    expect(tile).toHaveTextContent('New live artifact');
    expect(tile.getAttribute('href')).toMatch(/^\/chat\?q=/);
    const items = screen.getByRole('list', { name: 'Live artifacts' }).children;
    expect(items[items.length - 1]).toContainElement(tile);
  });

  it('reopens an artifact in its chat with the artifact selected', async () => {
    const artifact = liveArtifact({});
    mocks.listLiveArtifacts.mockResolvedValue([artifact]);
    render(<LiveArtifactsView />);
    fireEvent.click(await screen.findByText('Weekly growth metrics'));
    expect(mocks.push).toHaveBeenCalledWith(
      `/chat/${artifact.conversationId}?artifact=${artifact.artifactId}`,
    );
  });

  it('shows the empty state with the new tile', async () => {
    mocks.listLiveArtifacts.mockResolvedValue([]);
    render(<LiveArtifactsView />);
    expect(await screen.findByTestId('live-artifacts-empty')).toBeInTheDocument();
    expect(screen.getByTestId('live-artifact-new')).toBeInTheDocument();
  });

  it('offers a retry when the list cannot load', async () => {
    mocks.listLiveArtifacts.mockRejectedValueOnce(new Error('offline')).mockResolvedValue([]);
    render(<LiveArtifactsView />);
    const retry = await screen.findByRole('button', { name: 'Try again' });
    fireEvent.click(retry);
    expect(await screen.findByTestId('live-artifacts-empty')).toBeInTheDocument();
  });

  it('asks a signed-out visitor to sign in', async () => {
    mocks.session = { isLoaded: true, isSignedIn: false };
    render(<LiveArtifactsView />);
    expect(await screen.findByTestId('live-artifacts-signed-out')).toBeInTheDocument();
    expect(mocks.listLiveArtifacts).not.toHaveBeenCalled();
  });

  it('treats an expired session as signed out', async () => {
    mocks.listLiveArtifacts.mockRejectedValue(
      new LiveArtifactRequestError('Unauthorized', 401, null),
    );
    render(<LiveArtifactsView />);
    expect(await screen.findByTestId('live-artifacts-signed-out')).toBeInTheDocument();
  });

  it('stops live updates only after a confirmation that names the consequence', async () => {
    const user = userEvent.setup();
    mocks.listLiveArtifacts.mockResolvedValue([liveArtifact({})]);
    mocks.removeLiveArtifact.mockResolvedValue(undefined);
    render(<LiveArtifactsView />);
    await user.click(
      await screen.findByRole('button', { name: 'Options for Weekly growth metrics' }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Stop live updates' }));
    expect(mocks.removeLiveArtifact).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('It stops reading Google Drive and Slack');
    await user.click(within(dialog).getByRole('button', { name: 'Stop live updates' }));
    await waitFor(() =>
      expect(mocks.removeLiveArtifact).toHaveBeenCalledWith('c0ffee00-0000-4000-8000-000000000001'),
    );
    await waitFor(() => expect(screen.queryByTestId('live-artifact-card')).toBeNull());
  });

  it('switches an artifact to refresh only when asked', async () => {
    const user = userEvent.setup();
    const artifact = liveArtifact({});
    mocks.listLiveArtifacts.mockResolvedValue([artifact]);
    mocks.setLiveArtifactRefreshPolicy.mockResolvedValue({ ...artifact, refreshPolicy: 'manual' });
    render(<LiveArtifactsView />);
    await user.click(
      await screen.findByRole('button', { name: 'Options for Weekly growth metrics' }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Refresh only when I ask' }));
    expect(mocks.setLiveArtifactRefreshPolicy).toHaveBeenCalledWith(artifact.artifactId, 'manual');
  });

  it('carries its own title and stays out of search indexes', () => {
    mocks.listLiveArtifacts.mockResolvedValue([]);
    render(<LiveArtifactsRoute />);
    expect(metadata.title).toBe('Live artifacts');
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
  });
});
