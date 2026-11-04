import { beforeEach, describe, expect, it, vi } from 'vitest';

type RlsDbModule = typeof import('@/lib/server/rls-db');
type PublishedModule = typeof import('@/lib/services/published-artifact-service');
type OrgModule = typeof import('@/lib/services/org-shared-artifact-service');
type InvitedModule = typeof import('@/lib/services/published-site-viewer-service');

const mocks = vi.hoisted(() => ({
  publicArtifact: vi.fn(),
  cookieReader: vi.fn(),
  orgArtifact: vi.fn(),
  invitedArtifact: vi.fn(),
  inviteOnly: vi.fn(),
  headers: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => ({}) }));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<RlsDbModule>()),
  getCurrentCookieUserRlsDb: mocks.cookieReader,
}));
vi.mock('@/lib/services/published-artifact-service', async (importOriginal) => ({
  ...(await importOriginal<PublishedModule>()),
  getPublishedArtifactByToken: mocks.publicArtifact,
  isInviteOnlyPublication: mocks.inviteOnly,
}));
vi.mock('@/lib/services/org-shared-artifact-service', async (importOriginal) => ({
  ...(await importOriginal<OrgModule>()),
  getOrgReadableArtifactByToken: mocks.orgArtifact,
}));
vi.mock('@/lib/services/published-site-viewer-service', async (importOriginal) => ({
  ...(await importOriginal<InvitedModule>()),
  getInvitedReadableArtifactByToken: mocks.invitedArtifact,
}));
vi.mock('@/lib/server/artifact-ai-switch', () => ({ artifactAiEnabled: () => false }));
vi.mock('./PublishedArtifactView', () => ({ PublishedArtifactView: () => null }));
vi.mock('./InviteOnlyArtifact', () => ({ InviteOnlyArtifact: () => null }));
vi.mock('./UnavailableArtifact', () => ({ UnavailableArtifact: () => null }));
vi.mock('@/app/copyright/report/ReportContentLink', () => ({ ReportContentLink: () => null }));

import Page, { generateMetadata } from './page';
import { InviteOnlyArtifact } from './InviteOnlyArtifact';
import { UnavailableArtifact } from './UnavailableArtifact';

const TOKEN = 'a'.repeat(24);
const props = { params: Promise.resolve({ token: TOKEN }) };
const artifact = { title: 'Shared artifact', kind: 'html', content: 'private', visibility: 'organization' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.publicArtifact.mockResolvedValue(null);
  mocks.cookieReader.mockResolvedValue(null);
  mocks.orgArtifact.mockResolvedValue(null);
  mocks.invitedArtifact.mockResolvedValue(null);
  mocks.inviteOnly.mockResolvedValue(false);
  mocks.headers.mockResolvedValue(new Headers({ 'x-real-ip': '192.0.2.1' }));
});

describe('published artifact cookie admission', () => {
  it('keeps public content and metadata independent of cookie admission', async () => {
    mocks.publicArtifact.mockResolvedValue({ ...artifact, visibility: 'public' });
    await expect(Page(props)).resolves.toBeTruthy();
    expect((await generateMetadata(props)).title).toBe('Shared artifact - AGI');
    expect(mocks.cookieReader).not.toHaveBeenCalled();
    expect(mocks.headers).not.toHaveBeenCalled();
  });

  it('passes incoming network headers and uses RLS without a workspace equality restriction', async () => {
    const db = {};
    mocks.cookieReader.mockResolvedValue({ db, userId: 'member' });
    mocks.orgArtifact.mockResolvedValue(artifact);
    await expect(Page(props)).resolves.toBeTruthy();
    expect(mocks.cookieReader.mock.calls[0]?.[0].headers.get('x-real-ip')).toBe('192.0.2.1');
    expect(mocks.orgArtifact).toHaveBeenCalledWith(db, TOKEN);
    expect(mocks.invitedArtifact).not.toHaveBeenCalled();
  });

  it('preserves the admitted invited-reader fallback', async () => {
    const db = {};
    mocks.cookieReader.mockResolvedValue({ db, userId: 'invitee' });
    mocks.invitedArtifact.mockResolvedValue(artifact);
    await expect(Page(props)).resolves.toBeTruthy();
    expect(mocks.invitedArtifact).toHaveBeenCalledWith(db, TOKEN);
  });

  it('does not query either private reader after a gate failure', async () => {
    mocks.cookieReader.mockRejectedValue(new Error('gate refused'));
    expect((await Page(props)).type).toBe(UnavailableArtifact);
    expect(mocks.orgArtifact).not.toHaveBeenCalled();
    expect(mocks.invitedArtifact).not.toHaveBeenCalled();
    expect((await generateMetadata(props)).title).toBe('Published artifact - AGI');
  });

  it('preserves the invite-only explanation for an unadmitted viewer', async () => {
    mocks.inviteOnly.mockResolvedValue(true);
    const result = await Page(props);
    expect(result.type).toBe(InviteOnlyArtifact);
    expect(result.props.signedIn).toBe(false);
    expect(mocks.orgArtifact).not.toHaveBeenCalled();
  });
});
