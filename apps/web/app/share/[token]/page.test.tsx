import { beforeEach, describe, expect, it, vi } from 'vitest';

type NeonDbModule = typeof import('@/lib/server/neon-db');
type RlsDbModule = typeof import('@/lib/server/rls-db');
type OrgSharedSessionModule = typeof import('@/lib/services/org-shared-session-service');
type ReportContentLinkModule = typeof import('@/app/copyright/report/ReportContentLink');

const TOKEN = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const NOT_FOUND = 'NEXT_NOT_FOUND';

const mocks = vi.hoisted(() => ({
  publicSession: vi.fn(),
  cookieReader: vi.fn(),
  orgSession: vi.fn(),
  headers: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: mocks.headers }));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error(NOT_FOUND);
  },
}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<NeonDbModule>()),
  getNeonDb: () => ({}),
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<RlsDbModule>()),
  getCurrentCookieUserRlsDb: mocks.cookieReader,
}));
vi.mock('@/lib/services/org-shared-session-service', async (importOriginal) => ({
  ...(await importOriginal<OrgSharedSessionModule>()),
  getPublicSharedSessionByToken: (...args: unknown[]) => mocks.publicSession(...args),
  getOrgReadableSessionByToken: mocks.orgSession,
  readSharedSessionSharerName: async () => null,
}));
vi.mock('@/features/chat/components/share/SharedSessionViewer', () => ({
  SharedSessionViewer: () => null,
}));
vi.mock('@/app/copyright/report/ReportContentLink', async (importOriginal) => ({
  ...(await importOriginal<ReportContentLinkModule>()),
  ReportContentLink: () => null,
}));

import SharedSessionPage, { generateMetadata } from './page';

const props = { params: Promise.resolve({ token: TOKEN }) };

function session(expiresAt: string) {
  return {
    id: 'share-1',
    token: TOKEN,
    ownerUserId: 'user-1',
    title: 'Quarterly plan',
    modelId: null,
    provider: null,
    messages: [],
    messageCount: 2,
    visibility: 'public',
    expiresAt,
    createdAt: '2026-09-01T00:00:00.000Z',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cookieReader.mockResolvedValue(null);
  mocks.orgSession.mockResolvedValue(null);
  mocks.headers.mockResolvedValue(new Headers({ 'x-real-ip': '192.0.2.1' }));
});

describe('/share/[token] once the link no longer opens', () => {
  it('answers an expired link with the not-found page, so the response is a 404', async () => {
    mocks.publicSession.mockResolvedValue(session('2026-01-01T00:00:00.000Z'));

    await expect(SharedSessionPage(props)).rejects.toThrow(NOT_FOUND);
  });

  it('answers a revoked link the same way', async () => {
    mocks.publicSession.mockResolvedValue(null);

    await expect(SharedSessionPage(props)).rejects.toThrow(NOT_FOUND);
  });

  it('keeps an expired conversation’s title out of the page title', async () => {
    mocks.publicSession.mockResolvedValue(session('2026-01-01T00:00:00.000Z'));

    const metadata = await generateMetadata(props);

    expect(metadata.title).toBe('Shared Session - AGI');
    expect(metadata.description).toBeUndefined();
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it('still opens a live link under its own title', async () => {
    mocks.publicSession.mockResolvedValue(session('2099-01-01T00:00:00.000Z'));

    await expect(SharedSessionPage(props)).resolves.toBeTruthy();
    expect((await generateMetadata(props)).title).toBe('Quarterly plan - AGI');
  });
});

describe('/share/[token] cookie admission', () => {
  it('does not run authenticated admission or read request headers for a public share', async () => {
    mocks.publicSession.mockResolvedValue(session('2099-01-01T00:00:00.000Z'));
    await SharedSessionPage(props);
    expect(mocks.cookieReader).not.toHaveBeenCalled();
    expect(mocks.headers).not.toHaveBeenCalled();
  });

  it('passes network headers to admission before reading an organization share', async () => {
    const db = {};
    mocks.publicSession.mockResolvedValue(null);
    mocks.cookieReader.mockResolvedValue({ db, userId: 'account-1' });
    mocks.orgSession.mockResolvedValue({
      ...session('2099-01-01T00:00:00.000Z'),
      visibility: 'organization',
    });
    await expect(SharedSessionPage(props)).resolves.toBeTruthy();
    expect(mocks.cookieReader.mock.calls[0]?.[0].headers.get('x-real-ip')).toBe('192.0.2.1');
    expect(mocks.orgSession).toHaveBeenCalledWith(db, TOKEN);
  });

  it('does not read organization content when admission fails', async () => {
    mocks.publicSession.mockResolvedValue(null);
    mocks.cookieReader.mockRejectedValue(new Error('gate refused'));
    await expect(SharedSessionPage(props)).rejects.toThrow(NOT_FOUND);
    expect(mocks.orgSession).not.toHaveBeenCalled();
  });
});
