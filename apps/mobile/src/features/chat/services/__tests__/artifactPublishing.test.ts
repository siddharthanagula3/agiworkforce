import { ApiHttpError } from '@/services/apiErrors';
import {
  fetchArtifactPublication,
  PUBLISH_FAILED_MESSAGE,
  publishFailureMessage,
  usePublishedArtifactAudiences,
} from '../artifactPublishing';
import { api } from '@/services/api';
import {
  activateCloudAccount,
  captureCloudAccountEpoch,
  invalidateCloudAccount,
  StaleCloudAccountOperationError,
} from '@/src/features/auth/services/cloudAccountSession';
import { MANAGED_CLOUD_PUBLISHED_ARTIFACT_ID_MAX_CHARS } from '@agiworkforce/cloud-contracts';

jest.mock('@/services/api', () => ({ api: { get: jest.fn(), post: jest.fn() } }));

const publication = (artifactId = 'artifact-1') => ({
  token: 'a'.repeat(24),
  artifactId,
  title: 'Landing page',
  kind: 'html',
  language: 'html',
  contentChars: 14,
  visibility: 'organization',
  createdAt: '2026-11-07T00:00:00Z',
  updatedAt: '2026-11-07T00:00:00Z',
  shareUrl: `https://example.com/shared-artifact/${'a'.repeat(24)}`,
  sandboxed: true,
});

describe('exact artifact publication lookup', () => {
  beforeEach(() => {
    jest.mocked(api.get).mockReset();
    invalidateCloudAccount();
    activateCloudAccount('owner-a');
    usePublishedArtifactAudiences.setState({
      ownerId: 'owner-a',
      byId: { unrelated: 'public' },
    });
  });

  afterEach(() => invalidateCloudAccount());

  it('encodes the complete artifact ID and binds the request to the current epoch', async () => {
    const artifactId = 'folder/a?b&c=#雪';
    jest.mocked(api.get).mockResolvedValue({
      artifact: publication(artifactId),
      workspace: { memberCount: 7 },
    });
    await expect(fetchArtifactPublication(artifactId)).resolves.toEqual({
      publication: { shareUrl: publication().shareUrl, visibility: 'organization' },
      workspaceMemberCount: 7,
    });
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith(
      `/api/artifacts/publish/lookup?artifactId=${encodeURIComponent(artifactId)}`,
      { accountEpoch: captureCloudAccountEpoch() },
    );
    expect(usePublishedArtifactAudiences.getState().byId).toEqual({ unrelated: 'public' });
  });

  it.each(['', '   ', 'a'.repeat(MANAGED_CLOUD_PUBLISHED_ARTIFACT_ID_MAX_CHARS + 1)])(
    'rejects invalid IDs before transport: %p',
    async (artifactId) => {
      await expect(fetchArtifactPublication(artifactId)).rejects.toThrow();
      expect(api.get).not.toHaveBeenCalled();
    },
  );

  it.each([null, { memberCount: 0 }, { memberCount: 7 }])(
    'accepts only explicit validated absence with workspace %p',
    async (workspace) => {
      jest.mocked(api.get).mockResolvedValue({ artifact: null, workspace });
      await expect(fetchArtifactPublication('artifact-1')).resolves.toEqual({
        publication: null,
        workspaceMemberCount: workspace?.memberCount ?? null,
      });
      expect(usePublishedArtifactAudiences.getState().byId).toEqual({ unrelated: 'public' });
    },
  );

  it.each([
    undefined,
    null,
    {},
    { artifacts: [] },
    { artifact: null },
    { artifact: null, workspace: { memberCount: -1 } },
    { artifact: {}, workspace: null },
    { artifact: { ...publication(), shareUrl: '' }, workspace: null },
    { artifact: publication('other-artifact'), workspace: null },
  ])('rejects malformed or mismatched lookup response %p without clearing cache', async (reply) => {
    jest.mocked(api.get).mockResolvedValue(reply);
    await expect(fetchArtifactPublication('artifact-1')).rejects.toThrow();
    expect(usePublishedArtifactAudiences.getState().byId).toEqual({ unrelated: 'public' });
  });

  it.each([401, 403, 404, 500])('does not translate HTTP %i into private', async (status) => {
    const error = new ApiHttpError('Lookup unavailable', status, null);
    jest.mocked(api.get).mockRejectedValue(error);
    await expect(fetchArtifactPublication('artifact-1')).rejects.toBe(error);
    expect(usePublishedArtifactAudiences.getState().byId).toEqual({ unrelated: 'public' });
  });

  it('rejects an A to B to A account transition while the lookup is pending', async () => {
    let resolve!: (response: unknown) => void;
    jest.mocked(api.get).mockReturnValue(new Promise((done) => { resolve = done; }));
    const pending = fetchArtifactPublication('artifact-1');
    const rejection = expect(pending).rejects.toBeInstanceOf(StaleCloudAccountOperationError);
    activateCloudAccount('owner-b');
    activateCloudAccount('owner-a');
    resolve({ artifact: publication(), workspace: null });
    await rejection;
    expect(usePublishedArtifactAudiences.getState().byId).toEqual({ unrelated: 'public' });
  });

  it('does not send an unauthenticated lookup', async () => {
    invalidateCloudAccount();
    await expect(fetchArtifactPublication('artifact-1')).rejects.toBeInstanceOf(
      StaleCloudAccountOperationError,
    );
    expect(api.get).not.toHaveBeenCalled();
  });
});

describe('what a reader is told when publishing fails', () => {
  it("shows the server's own sentence with the reference that finds it", () => {
    const refused = new ApiHttpError('Publishing is turned off for this workspace.', 403, null, {
      requestId: 'req_7f3a',
    });
    expect(publishFailureMessage(refused)).toBe(
      'Publishing is turned off for this workspace. Reference: req_7f3a',
    );
  });

  it('never shows what a dropped connection or a malformed reply threw', () => {
    for (const thrown of [
      new TypeError('Network request failed'),
      new Error('The publish endpoint returned no share URL.'),
      new Error("Cannot read properties of undefined (reading 'shareUrl')"),
      'a string somebody threw',
      undefined,
    ]) {
      expect(publishFailureMessage(thrown)).toBe(PUBLISH_FAILED_MESSAGE);
    }
  });
});
