import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  lockdown: vi.fn(),
  getNeonDb: vi.fn(),
  getSession: vi.fn(),
  listTerminal: vi.fn(),
  listTurns: vi.fn(),
}));

vi.mock('@/lib/feature-flags/tenant-lockdown', () => ({
  assertTenantNotLockedDown: mocks.lockdown,
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: mocks.getNeonDb }));
vi.mock('@/lib/user-connector-tools', () => ({ getUserGithubInstallations: vi.fn() }));
vi.mock('../cloud-code-session-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../cloud-code-session-service')>()),
  getCloudCodeSession: mocks.getSession,
  listCloudCodeTerminalEntries: mocks.listTerminal,
  listCloudCodeAgentTurns: mocks.listTurns,
}));

import { openSharedCloudCodeSession } from '../cloud-code-session-sharing';

const ORG = '11111111-1111-4111-8111-111111111111';
const TOKEN = 'A'.repeat(24);

function viewerDbFor(row: Record<string, unknown> | null): DatabaseAdapter {
  return { query: vi.fn().mockResolvedValue(row ? [row] : []) } as unknown as DatabaseAdapter;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.lockdown.mockResolvedValue(undefined);
  mocks.getNeonDb.mockReturnValue({ query: vi.fn().mockResolvedValue([]) });
  mocks.getSession.mockResolvedValue({
    title: 'Fix build',
    repositoryUrl: null,
    workingBranch: null,
    baseBranch: null,
    pullRequestUrl: null,
    pullRequestNumber: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  });
  mocks.listTerminal.mockResolvedValue([]);
  mocks.listTurns.mockResolvedValue([]);
});

describe('opening a shared Code session from a locked workspace', () => {
  const grant = {
    session_id: '22222222-2222-4222-8222-222222222222',
    owner_user_id: 'owner',
    organization_id: ORG,
    share_visibility: 'team',
  };

  it('refuses before any transcript is read when the granting workspace is locked down', async () => {
    mocks.lockdown.mockRejectedValue(new Error('locked'));

    await expect(openSharedCloudCodeSession(viewerDbFor(grant), 'viewer', TOKEN)).rejects.toThrow(
      'locked',
    );

    expect(mocks.lockdown).toHaveBeenCalledWith(ORG);
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.listTerminal).not.toHaveBeenCalled();
    expect(mocks.listTurns).not.toHaveBeenCalled();
  });

  it('still opens the transcript when the granting workspace is not locked', async () => {
    const shared = await openSharedCloudCodeSession(viewerDbFor(grant), 'viewer', TOKEN);

    expect(mocks.lockdown).toHaveBeenCalledWith(ORG);
    expect(shared?.title).toBe('Fix build');
  });

  it('asks the lockdown check with no workspace for a personal public share', async () => {
    const shared = await openSharedCloudCodeSession(
      viewerDbFor({ ...grant, organization_id: null, share_visibility: 'public' }),
      'viewer',
      TOKEN,
    );

    expect(mocks.lockdown).toHaveBeenCalledWith(null);
    expect(shared?.visibility).toBe('public');
  });
});
