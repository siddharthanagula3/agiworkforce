import type { StreamCallbacks, StreamDelta } from '../services/streaming';
import { WEB_SEARCH_CITATION_DELTA_KEY } from '@agiworkforce/types';
import { requireMobileCloudModel } from '../test-utils/modelFixtures';

const MODEL = requireMobileCloudModel();
const RUN_ID = '0190a000-0000-7000-8000-000000000002';
const guardedFetchMock = jest.fn();

function load() {
  jest.resetModules();
  guardedFetchMock.mockReset();
  jest.doMock('@/lib/constants', () => ({
    API_URL: 'https://api.agi.test',
    TIMEOUTS: { STREAMING: 60_000, STREAM_STALL: 30_000 },
  }));
  jest.doMock('@/lib/egressGuard', () => ({ guardedFetch: guardedFetchMock }));
  jest.doMock('../services/authSession', () => ({
    getAuthToken: jest.fn().mockResolvedValue('citation-token'),
  }));
  jest.doMock('../services/llmGate', () => ({
    ensureCloudSendConsent: jest.fn().mockResolvedValue(undefined),
    ensureLlmGateOpen: jest.fn(),
  }));
  jest.doMock('../services/remoteChatGate', () => ({ assertRemoteChatAllowed: jest.fn() }));
  jest.doMock('@/src/features/waitlist/store', () => ({
    useWaitlistStore: { getState: () => ({ cloudUnlocked: true }) },
  }));
  jest.doMock('@/src/features/integrations/services/phoneDeviceHost', () => ({
    phoneDeviceHostHeaders: jest.fn().mockResolvedValue({}),
  }));
  jest.doMock('../services/api', () => ({
    ApiPaywallError: class ApiPaywallError extends Error {},
    recoverStreamSession: jest.fn().mockResolvedValue(true),
    streamAuthRefusal: jest.fn().mockReturnValue(null),
  }));
  jest
    .requireActual<typeof import('../src/features/auth/services/cloudAccountSession')>(
      '../src/features/auth/services/cloudAccountSession',
    )
    .activateCloudAccount('citation-account');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../services/streaming') as typeof import('../services/streaming');
}

function respondWith(deltas: unknown[]): Response {
  const frames = deltas
    .map((delta) => `data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`)
    .join('');
  return {
    ok: true,
    status: 200,
    body: null,
    text: async () => `${frames}data: [DONE]\n\n`,
  } as unknown as Response;
}

async function received(deltas: unknown[]): Promise<StreamDelta[]> {
  const streaming = load();
  guardedFetchMock.mockResolvedValue(respondWith(deltas));
  const seen: StreamDelta[] = [];
  const callbacks: StreamCallbacks = {
    onDelta: (delta) => seen.push(delta),
    onDone: () => undefined,
    onError: (error) => {
      throw error;
    },
  };
  await streaming.streamChat(
    {
      model: MODEL.id,
      messages: [{ role: 'user', content: 'Search the web for tulip care.' }],
      stream: true,
      operationId: RUN_ID,
    },
    callbacks,
  );
  return seen;
}

afterEach(() => {
  for (const path of [
    '@/lib/constants',
    '@/lib/egressGuard',
    '../services/authSession',
    '../services/llmGate',
    '../services/remoteChatGate',
    '@/src/features/waitlist/store',
    '@/src/features/integrations/services/phoneDeviceHost',
    '../services/api',
  ])
    jest.dontMock(path);
});

describe('a page a provider search cited', () => {
  it('reaches the turn with its address and title', async () => {
    const deltas = await received([
      { content: 'Water them weekly [1].' },
      {
        [WEB_SEARCH_CITATION_DELTA_KEY]: {
          url: 'https://cited.example.net/guide',
          title: 'Tulip guide',
          provider_id: 'native',
        },
      },
    ]);
    expect(deltas.map((delta) => delta[WEB_SEARCH_CITATION_DELTA_KEY])).toEqual([
      undefined,
      { url: 'https://cited.example.net/guide', title: 'Tulip guide' },
    ]);
  });

  it('is dropped when the frame names no page', async () => {
    const deltas = await received([
      { [WEB_SEARCH_CITATION_DELTA_KEY]: { url: 'https://cited.example.net/guide' } },
      { [WEB_SEARCH_CITATION_DELTA_KEY]: 'https://cited.example.net/guide' },
    ]);
    expect(deltas.some((delta) => WEB_SEARCH_CITATION_DELTA_KEY in delta)).toBe(false);
  });
});
