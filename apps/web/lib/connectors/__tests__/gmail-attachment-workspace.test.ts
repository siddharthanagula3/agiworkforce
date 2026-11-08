import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StoredObjectTooLargeError } from '@/lib/server/object-storage';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  activeOrganization: vi.fn(),
  membership: vi.fn(),
  asset: vi.fn(),
  read: vi.fn(),
  fetch: vi.fn(),
  db: {},
}));

vi.mock('@/lib/connectors/oauth-access', async (importOriginal) => ({
  ...(await importOriginal<MockedModule0>()),
  resolveConnectorAccessToken: mocks.access,
}));
vi.mock('@/lib/services/active-workspace-service', () => ({
  resolveActiveOrganizationId: mocks.activeOrganization,
  resolveOrganizationMembershipId: mocks.membership,
}));
vi.mock('@/lib/server/media-assets', () => ({
  getActiveWorkspaceMediaAssetById: mocks.asset,
}));
vi.mock('@/lib/server/media-storage', async (importOriginal) => ({
  ...(await importOriginal<CompleteMockModule0>()),
  readStoredMedia: mocks.read,
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => mocks.db }));
vi.mock('@/lib/url-fetch/guarded-fetch', async (importOriginal) => ({
  ...(await importOriginal<CompleteMockModule1>()),
  createDeadline: () => ({ release: vi.fn() }),
  credentialedFetch: mocks.fetch,
}));

import {
  executeGmailAction,
  GMAIL_CREATE_DRAFT_WITH_ATTACHMENTS_ACTION,
  GMAIL_READ_ATTACHMENTS_ACTION,
  GMAIL_SEND_DRAFT_ACTION,
} from '../gmail-actions';

const USER_ID = 'user-owner';
const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ORGANIZATION_ID = '22222222-2222-4222-8222-222222222222';
const ASSET_ID = '33333333-3333-4333-8333-333333333333';
const args = {
  to: ['recipient@example.com'],
  subject: 'Fixture',
  body: 'Fixture attachment',
  files: [`/api/files/${ASSET_ID}`],
};

function asset(organizationId: string | null = ORGANIZATION_ID) {
  return {
    id: ASSET_ID,
    userId: USER_ID,
    organizationId,
    deletedAt: null,
    storagePathname: 'media/fixture.txt',
    mimeType: 'text/plain',
    metadata: { filename: 'fixture.txt' },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.mockResolvedValue({
    status: 'ready',
    accessToken: 'fixture-token',
    tokenType: 'Bearer',
  });
  mocks.activeOrganization.mockResolvedValue(OTHER_ORGANIZATION_ID);
  mocks.membership.mockImplementation(async (_db, _userId, organizationId) => organizationId);
  mocks.asset.mockResolvedValue(asset());
  mocks.read.mockResolvedValue({ data: Buffer.from('fixture contents') });
  mocks.fetch.mockResolvedValue({
    ok: true,
    response: { ok: true, json: async () => ({ id: 'fixture-draft' }) },
  });
});

describe('Gmail draft attachment workspace authority', () => {
  it('keeps the admitted organization despite a different saved selection', async () => {
    const result = await executeGmailAction(
      USER_ID,
      GMAIL_CREATE_DRAFT_WITH_ATTACHMENTS_ACTION,
      args,
      ORGANIZATION_ID,
    );
    expect(result.isError).toBe(false);
    expect(mocks.activeOrganization).not.toHaveBeenCalled();
    expect(mocks.membership).toHaveBeenCalledWith(mocks.db, USER_ID, ORGANIZATION_ID);
    expect(mocks.asset).toHaveBeenCalledWith(USER_ID, ASSET_ID, mocks.db, {
      organizationId: ORGANIZATION_ID,
    });
    expect(mocks.read).toHaveBeenCalledWith('media/fixture.txt', 20_971_520);
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });

  it('keeps explicit Personal authority without consulting saved selection', async () => {
    mocks.asset.mockResolvedValue(asset(null));
    const result = await executeGmailAction(
      USER_ID,
      GMAIL_CREATE_DRAFT_WITH_ATTACHMENTS_ACTION,
      args,
      null,
    );
    expect(result.isError).toBe(false);
    expect(mocks.activeOrganization).not.toHaveBeenCalled();
    expect(mocks.membership).not.toHaveBeenCalled();
    expect(mocks.asset).toHaveBeenCalledWith(USER_ID, ASSET_ID, mocks.db, { organizationId: null });
  });

  it('resolves omitted legacy context once for the entire draft', async () => {
    mocks.asset.mockResolvedValue(asset(OTHER_ORGANIZATION_ID));
    const result = await executeGmailAction(USER_ID, GMAIL_CREATE_DRAFT_WITH_ATTACHMENTS_ACTION, {
      ...args,
      files: [...args.files, ...args.files],
    });
    expect(result.isError).toBe(false);
    expect(mocks.activeOrganization).toHaveBeenCalledExactlyOnceWith(mocks.db, USER_ID);
    expect(mocks.asset).toHaveBeenCalledTimes(2);
    expect(mocks.asset).toHaveBeenNthCalledWith(2, USER_ID, ASSET_ID, mocks.db, {
      organizationId: OTHER_ORGANIZATION_ID,
    });
  });

  it.each([
    ['foreign owner', { ...asset(), userId: 'another-owner' }],
    ['other workspace', asset(OTHER_ORGANIZATION_ID)],
    ['Personal asset', asset(null)],
    ['deleted asset', { ...asset(), deletedAt: '2026-11-01T00:00:00.000Z' }],
    ['missing storage path', { ...asset(), storagePathname: null }],
    ['missing asset', null],
  ])('refuses %s before reading bytes or creating a draft', async (_label, row) => {
    mocks.asset.mockResolvedValue(row);
    const result = await executeGmailAction(
      USER_ID,
      GMAIL_CREATE_DRAFT_WITH_ATTACHMENTS_ACTION,
      args,
      ORGANIZATION_ID,
    );
    expect(result.isError).toBe(true);
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('does not attach an organization asset to a Personal draft', async () => {
    const result = await executeGmailAction(
      USER_ID,
      GMAIL_CREATE_DRAFT_WITH_ATTACHMENTS_ACTION,
      args,
      null,
    );
    expect(result.isError).toBe(true);
    expect(mocks.activeOrganization).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it.each(['revoked', 'unavailable'])('fails closed when membership is %s', async (failure) => {
    if (failure === 'revoked') mocks.membership.mockResolvedValue(null);
    else mocks.membership.mockRejectedValue(new Error('membership unavailable'));
    const result = await executeGmailAction(
      USER_ID,
      GMAIL_CREATE_DRAFT_WITH_ATTACHMENTS_ACTION,
      args,
      ORGANIZATION_ID,
    );
    expect(result.isError).toBe(true);
    expect(mocks.activeOrganization).not.toHaveBeenCalled();
    expect(mocks.asset).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it.each([
    [GMAIL_SEND_DRAFT_ACTION, { draft_id: 'fixture-draft' }],
    [GMAIL_READ_ATTACHMENTS_ACTION, { message_id: 'fixture-message' }],
  ])('leaves %s independent of local attachment scope', async (action, input) => {
    mocks.membership.mockRejectedValue(new Error('must not run'));
    const result = await executeGmailAction(USER_ID, action, input, ORGANIZATION_ID);
    expect(result.isError).toBe(false);
    expect(mocks.activeOrganization).not.toHaveBeenCalled();
    expect(mocks.membership).not.toHaveBeenCalled();
    expect(mocks.asset).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });
});

describe('Gmail aggregate attachment read budget', () => {
  const limit = 20_971_520;
  const twoFiles = { ...args, files: [...args.files, ...args.files] };

  it('passes the remaining aggregate budget to each read', async () => {
    mocks.read.mockResolvedValueOnce({ data: Buffer.from('first') });
    mocks.read.mockResolvedValueOnce({ data: Buffer.from('second') });
    const result = await executeGmailAction(
      USER_ID,
      GMAIL_CREATE_DRAFT_WITH_ATTACHMENTS_ACTION,
      twoFiles,
      ORGANIZATION_ID,
    );
    expect(result.isError).toBe(false);
    expect(mocks.read).toHaveBeenNthCalledWith(1, 'media/fixture.txt', limit);
    expect(mocks.read).toHaveBeenNthCalledWith(2, 'media/fixture.txt', limit - 5);
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });

  it.each([undefined, limit + 1])(
    'refuses unknown or oversized storage without posting: %s',
    async (size) => {
      mocks.read.mockRejectedValue(new StoredObjectTooLargeError('media/fixture.txt', limit, size));
      const result = await executeGmailAction(
        USER_ID,
        GMAIL_CREATE_DRAFT_WITH_ATTACHMENTS_ACTION,
        twoFiles,
        ORGANIZATION_ID,
      );
      expect(result.isError).toBe(true);
      expect(result.content).toContain(`${limit}-byte limit`);
      expect(result.content).not.toContain('add up to');
      expect(mocks.read).toHaveBeenCalledOnce();
      expect(mocks.fetch).not.toHaveBeenCalled();
    },
  );

  it('stops on cumulative overflow without loading subsequent files or posting', async () => {
    mocks.read.mockResolvedValueOnce({ data: Buffer.from('first') });
    mocks.read.mockRejectedValueOnce(new StoredObjectTooLargeError('media/fixture.txt', limit - 5));
    const result = await executeGmailAction(
      USER_ID,
      GMAIL_CREATE_DRAFT_WITH_ATTACHMENTS_ACTION,
      {
        ...args,
        files: [...twoFiles.files, ...args.files],
      },
      ORGANIZATION_ID,
    );
    expect(result.isError).toBe(true);
    expect(mocks.read).toHaveBeenCalledTimes(2);
    expect(mocks.read).toHaveBeenNthCalledWith(2, 'media/fixture.txt', limit - 5);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('allows an exact-cap attachment followed by an empty attachment', async () => {
    mocks.read.mockResolvedValueOnce({ data: Buffer.alloc(limit) });
    mocks.read.mockResolvedValueOnce({ data: Buffer.alloc(0) });
    const result = await executeGmailAction(
      USER_ID,
      GMAIL_CREATE_DRAFT_WITH_ATTACHMENTS_ACTION,
      twoFiles,
      ORGANIZATION_ID,
    );
    expect(result.isError).toBe(false);
    expect(mocks.read).toHaveBeenNthCalledWith(2, 'media/fixture.txt', 0);
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });
});

type MockedModule0 = typeof import('@/lib/connectors/oauth-access');

type CompleteMockModule0 = typeof import('@/lib/server/media-storage');
type CompleteMockModule1 = typeof import('@/lib/url-fetch/guarded-fetch');
