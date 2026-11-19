import { ApiHttpError } from '@/services/apiErrors';
import { EgressBlockedError } from '@/lib/egressGuard';
import { api, apiFetch } from '@/services/api';
import {
  LOCAL_MODE_PUBLISH_MESSAGE,
  SIGNED_OUT_PUBLISH_MESSAGE,
  addPublishedArtifactViewer,
  isPublicationOutcomeUncertain,
  listPublishedArtifactViewers,
  normalizePublishedArtifactViewerEmail,
  PUBLISH_FAILED_MESSAGE,
  publishArtifact,
  publishFailureMessage,
  removePublishedArtifactViewer,
  viewersFailureMessage,
  VIEWERS_FAILED_MESSAGE,
} from '../artifactPublishing';
import {
  activateCloudAccount,
  captureCloudAccountEpoch,
  invalidateCloudAccount,
  StaleCloudAccountOperationError,
} from '@/src/features/auth/services/cloudAccountSession';

jest.mock('@/services/api', () => ({
  api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
  apiFetch: jest.fn(),
}));

const TOKEN = 'a'.repeat(24);
const SHARE_URL = `https://example.com/shared-artifact/${TOKEN}`;
const VIEWERS_PATH = `/api/artifacts/publish/${TOKEN}/viewers`;

function reply(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('publish failure wording', () => {
  it('says nothing was published when the account is gone', async () => {
    invalidateCloudAccount();
    const failure = await publishArtifact({
      artifactId: 'artifact-1',
      title: 'Page',
      kind: 'html',
      content: '<p>x</p>',
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(StaleCloudAccountOperationError);
    expect(publishFailureMessage(failure)).toBe(
      'You are signed out of AGI Cloud, so nothing was published.',
    );
    expect(publishFailureMessage(failure)).toBe(SIGNED_OUT_PUBLISH_MESSAGE);
    expect(publishFailureMessage(failure)).not.toMatch(/may have completed/);
    expect(isPublicationOutcomeUncertain(failure)).toBe(false);
  });

  it('does not claim nothing was published when the account changes after the upload was sent', async () => {
    activateCloudAccount('owner-a');
    const sent = deferred<unknown>();
    (api.post as jest.Mock).mockReturnValue(sent.promise);
    const pending = publishArtifact({
      artifactId: 'artifact-1',
      title: 'Page',
      kind: 'html',
      content: '<p>x</p>',
    }).catch((error: unknown) => error);
    invalidateCloudAccount();
    sent.resolve({});
    const failure = await pending;

    expect(failure).toBeInstanceOf(StaleCloudAccountOperationError);
    expect(isPublicationOutcomeUncertain(failure)).toBe(true);
    expect(publishFailureMessage(failure)).toBe(PUBLISH_FAILED_MESSAGE);
    expect(publishFailureMessage(failure)).not.toBe(SIGNED_OUT_PUBLISH_MESSAGE);
  });

  it('says nothing was published when Local mode blocked the upload', () => {
    const failure = new EgressBlockedError('agiworkforce.com');

    expect(publishFailureMessage(failure)).toBe(LOCAL_MODE_PUBLISH_MESSAGE);
    expect(LOCAL_MODE_PUBLISH_MESSAGE).toBe(
      'This device is in Local mode, so nothing was published. Switch to AGI Cloud mode and try again.',
    );
    expect(isPublicationOutcomeUncertain(failure)).toBe(false);
  });

  it('still calls a dropped connection unconfirmed', () => {
    expect(isPublicationOutcomeUncertain(new TypeError('Network request failed'))).toBe(true);
  });
});

describe('published artifact viewers service', () => {
  beforeEach(() => {
    jest.mocked(apiFetch).mockReset();
    invalidateCloudAccount();
    activateCloudAccount('viewers-owner');
  });

  afterEach(() => invalidateCloudAccount());

  it('lists the invited people with a GET on the viewers path', async () => {
    const viewers = [{ email: 'ann@example.com', invitedAt: '2026-11-10T00:00:00Z' }];
    jest.mocked(apiFetch).mockResolvedValue(reply(200, { viewers }));

    await expect(listPublishedArtifactViewers(SHARE_URL)).resolves.toEqual(viewers);

    expect(apiFetch).toHaveBeenCalledWith(
      VIEWERS_PATH,
      { method: 'GET' },
      { accountEpoch: captureCloudAccountEpoch(), auth401Recovery: 'caller-owned' },
    );
  });

  it('adds with a POST and removes with a DELETE, each carrying the email', async () => {
    jest.mocked(apiFetch).mockResolvedValue(reply(200, { viewers: [] }));

    await addPublishedArtifactViewer(SHARE_URL, 'ann@example.com');
    await removePublishedArtifactViewer(SHARE_URL, 'ann@example.com');

    expect(jest.mocked(apiFetch).mock.calls.map(([path, init]) => [path, init])).toEqual([
      [VIEWERS_PATH, { method: 'POST', body: JSON.stringify({ email: 'ann@example.com' }) }],
      [VIEWERS_PATH, { method: 'DELETE', body: JSON.stringify({ email: 'ann@example.com' }) }],
    ]);
  });

  it('refuses a link that does not name a published artifact', async () => {
    await expect(listPublishedArtifactViewers('https://example.com/other')).rejects.toThrow(
      'That share link does not name a published artifact.',
    );
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('raises the server sentence as an HTTP error', async () => {
    jest
      .mocked(apiFetch)
      .mockResolvedValue(
        reply(409, { error: { code: 'conflict', message: 'Viewer limit reached.' } }),
      );

    const failure = await addPublishedArtifactViewer(SHARE_URL, 'ann@example.com').catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(ApiHttpError);
    expect(viewersFailureMessage(failure)).toBe('Viewer limit reached.');
  });

  it('never shows what a dropped connection threw', () => {
    expect(viewersFailureMessage(new TypeError('Network request failed'))).toBe(
      VIEWERS_FAILED_MESSAGE,
    );
  });

  it('ignores a reply that arrives after an account switch', async () => {
    const pending = deferred<Response>();
    jest.mocked(apiFetch).mockReturnValue(pending.promise);

    const outcome = listPublishedArtifactViewers(SHARE_URL).catch((error: unknown) => error);
    activateCloudAccount('someone-else');
    pending.resolve(reply(200, { viewers: [{ email: 'ann@example.com', invitedAt: 'x' }] }));

    expect(await outcome).toBeInstanceOf(StaleCloudAccountOperationError);
  });

  it('turns the address into the form the server stores, or refuses it', () => {
    expect(normalizePublishedArtifactViewerEmail('  Ann@Example.COM ')).toBe('ann@example.com');
    expect(normalizePublishedArtifactViewerEmail('ann@')).toBeNull();
    expect(normalizePublishedArtifactViewerEmail('')).toBeNull();
  });
});
