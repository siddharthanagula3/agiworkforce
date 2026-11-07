import { act, renderHook } from '@testing-library/react-native';
import { ApiHttpError } from '@/services/apiErrors';
import {
  fetchArtifactPublication,
  recordPublishedArtifactAudience,
  refreshPublishedArtifactAudiences,
  PUBLISH_FAILED_MESSAGE,
  publishFailureMessage,
  usePublishedArtifactAudience,
  usePublishedArtifactAudiences,
} from '../artifactPublishing';
import { api } from '@/services/api';
import {
  activateCloudAccount,
  captureCloudAccountEpoch,
  invalidateCloudAccount,
  StaleCloudAccountOperationError,
} from '@/src/features/auth/services/cloudAccountSession';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { MANAGED_CLOUD_PUBLISHED_ARTIFACT_PAGE_MAX_ITEMS, MANAGED_CLOUD_PUBLISHED_ARTIFACT_ID_MAX_CHARS } from '@agiworkforce/cloud-contracts';

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
    expect(usePublishedArtifactAudiences.getState().byId).toEqual({});
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


describe('publication badge refresh authority', () => {
  beforeEach(() => {
    jest.mocked(api.get).mockReset();
    invalidateCloudAccount();
    activateCloudAccount('owner-a');
    useChatAppModeStore.setState({ appMode: 'cloud' });
    recordPublishedArtifactAudience('older', 'public');
  });

  afterEach(() => {
    invalidateCloudAccount();
    useChatAppModeStore.setState({ appMode: 'local' });
  });

  function deferredList() {
    let resolve!: (response: unknown) => void;
    const promise = new Promise<unknown>((done) => { resolve = done; });
    jest.mocked(api.get).mockReturnValueOnce(promise);
    return resolve;
  }

  const page = (artifacts = [publication()], nextCursor: string | null = null) => ({
    artifacts, pageInfo: { nextCursor }, workspace: null,
  });

  it.each([undefined, { nextCursor: 'more' }])(
    'merges incomplete or legacy page %p without more requests', async (pageInfo) => {
      jest.mocked(api.get).mockResolvedValue({ artifacts: [publication()], pageInfo });
      await refreshPublishedArtifactAudiences();
      expect(usePublishedArtifactAudiences.getState().byId).toEqual({
        older: 'public', 'artifact-1': 'organization',
      });
      expect(api.get).toHaveBeenCalledTimes(1);
      expect(api.get).toHaveBeenCalledWith('/api/artifacts/publish', {
        accountEpoch: captureCloudAccountEpoch(), signal: expect.objectContaining({ aborted: false }),
      });
    },
  );

  it('clears omissions only on a validated complete first page', async () => {
    jest.mocked(api.get).mockResolvedValue(page([]));
    await refreshPublishedArtifactAudiences();
    expect(usePublishedArtifactAudiences.getState().byId).toEqual({});
  });

  it.each([
    {}, { artifacts: [] , pageInfo: {} }, page([{} as ReturnType<typeof publication>]),
    page([publication(), publication()]),
    page(Array.from({ length: MANAGED_CLOUD_PUBLISHED_ARTIFACT_PAGE_MAX_ITEMS + 1 },
      (_, index) => publication(`artifact-${index}`))),
  ])('rejects malformed, duplicate or oversized pages without clearing badges: %p', async (reply) => {
    jest.mocked(api.get).mockResolvedValue(reply);
    await expect(refreshPublishedArtifactAudiences()).rejects.toThrow();
    expect(usePublishedArtifactAudiences.getState().byId).toEqual({ older: 'public' });
  });

  it('keeps known badges on transport failure and permits a later retry', async () => {
    jest.mocked(api.get).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(page());
    await expect(refreshPublishedArtifactAudiences()).rejects.toThrow('offline');
    expect(usePublishedArtifactAudiences.getState().byId).toEqual({ older: 'public' });
    await refreshPublishedArtifactAudiences();
    expect(usePublishedArtifactAudiences.getState().byId).toEqual({ 'artifact-1': 'organization' });
  });

  it.each([null, 'more'])('preserves newer records and forgets over page %p', async (cursor) => {
    const resolve = deferredList();
    const pending = refreshPublishedArtifactAudiences();
    recordPublishedArtifactAudience('new', 'invited');
    recordPublishedArtifactAudience('artifact-1', 'public');
    recordPublishedArtifactAudience('older', null);
    resolve(page([publication(), publication('older')], cursor));
    await pending;
    expect(usePublishedArtifactAudiences.getState().byId).toEqual({
      new: 'invited', 'artifact-1': 'public',
    });
    jest.mocked(api.get).mockResolvedValue(page([publication('older')]));
    await refreshPublishedArtifactAudiences();
    expect(usePublishedArtifactAudiences.getState().byId).toEqual({ older: 'organization' });
  });

  it.each([true, false])('only the latest-started refresh may commit; newer resolves first: %p', async (newerFirst) => {
    const first = deferredList();
    const older = refreshPublishedArtifactAudiences();
    const firstSignal = jest.mocked(api.get).mock.calls[0]![1]!.signal!;
    const second = deferredList();
    const newer = refreshPublishedArtifactAudiences();
    expect(firstSignal.aborted).toBe(true);
    if (newerFirst) {
      second(page([publication('latest')]));
      await newer;
      first(page());
      await older;
    } else {
      first(page());
      await older;
      expect(usePublishedArtifactAudiences.getState().byId).toEqual({ older: 'public' });
      second(page([publication('latest')]));
      await newer;
    }
    expect(usePublishedArtifactAudiences.getState().byId).toEqual({ latest: 'organization' });
  });

  it('keeps the newer refresh and its overlay when a superseded request rejects', async () => {
    let reject!: (error: Error) => void;
    jest.mocked(api.get).mockReturnValueOnce(new Promise((_, fail) => { reject = fail; }));
    const older = refreshPublishedArtifactAudiences();
    const failure = new Error('superseded request failed');
    const rejection = expect(older).rejects.toBe(failure);
    const resolve = deferredList();
    const newer = refreshPublishedArtifactAudiences();
    reject(failure);
    await rejection;
    recordPublishedArtifactAudience('artifact-1', 'public');
    recordPublishedArtifactAudience('new', 'invited');
    resolve(page());
    await newer;
    expect(usePublishedArtifactAudiences.getState().byId).toEqual({
      'artifact-1': 'public', new: 'invited',
    });
  });

  it.each(['other-owner', 'same-owner'])('invalidates and notifies across %s epoch transitions', async (transition) => {
    const resolve = deferredList();
    const pending = refreshPublishedArtifactAudiences();
    const rejection = expect(pending).rejects.toBeInstanceOf(StaleCloudAccountOperationError);
    const listener = jest.fn();
    const unsubscribe = usePublishedArtifactAudiences.subscribe(listener);
    if (transition === 'other-owner') activateCloudAccount('owner-b');
    else invalidateCloudAccount();
    expect(usePublishedArtifactAudiences.getState().byId).toEqual({});
    expect(listener).toHaveBeenCalled();
    activateCloudAccount('owner-a');
    recordPublishedArtifactAudience('current', 'invited');
    resolve(page());
    await rejection;
    expect(usePublishedArtifactAudiences.getState().byId).toEqual({ current: 'invited' });
    expect(jest.mocked(api.get).mock.calls[0]![1]!.signal!.aborted).toBe(true);
    unsubscribe();
  });

  it('retires a cloud refresh across Local and back without rolling back explicit writes', async () => {
    const resolve = deferredList();
    const pending = refreshPublishedArtifactAudiences();
    useChatAppModeStore.setState({ appMode: 'local' });
    recordPublishedArtifactAudience('explicit', 'public');
    await refreshPublishedArtifactAudiences();
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(jest.mocked(api.get).mock.calls[0]![1]!.signal!.aborted).toBe(true);
    useChatAppModeStore.setState({ appMode: 'cloud' });
    resolve(page());
    await pending;
    expect(usePublishedArtifactAudiences.getState().byId).toEqual({ older: 'public', explicit: 'public' });
  });

  it('does not request a list without an active account', async () => {
    invalidateCloudAccount();
    await expect(refreshPublishedArtifactAudiences()).rejects.toBeInstanceOf(StaleCloudAccountOperationError);
    expect(api.get).not.toHaveBeenCalled();
  });

  it.each(['constructor', 'toString'])(
    'reads only own audience entries for %s through the hook', (artifactId) => {
      usePublishedArtifactAudiences.setState({ ownerId: 'owner-a', byId: {} });
      const { result, unmount } = renderHook(() => usePublishedArtifactAudience(artifactId));
      expect(result.current).toBeNull();
      act(() => recordPublishedArtifactAudience(artifactId, 'public'));
      expect(result.current).toBe('public');
      act(() => recordPublishedArtifactAudience(artifactId, null));
      expect(result.current).toBeNull();
      unmount();
    },
  );

  it('stores prototype-looking IDs as own audience entries', async () => {
    jest.mocked(api.get).mockResolvedValue(page([publication('__proto__'), publication('constructor')]));
    await refreshPublishedArtifactAudiences();
    expect(Object.keys(usePublishedArtifactAudiences.getState().byId)).toEqual(['__proto__', 'constructor']);
    recordPublishedArtifactAudience('__proto__', 'public');
    expect(usePublishedArtifactAudiences.getState().byId['__proto__']).toBe('public');
    recordPublishedArtifactAudience('__proto__', null);
    expect(Object.prototype.hasOwnProperty.call(usePublishedArtifactAudiences.getState().byId, '__proto__')).toBe(false);
  });
});
