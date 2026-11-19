import type { StreamCallbacks } from '../services/streaming';
import { requireMobileCloudModel } from '../test-utils/modelFixtures';

type CloudAccountSessionModule = typeof import('../src/features/auth/services/cloudAccountSession');

const MODEL = requireMobileCloudModel();
const RUN_ID = '0190a000-0000-7000-8000-000000000001';
const LINE_COUNT = 200;
const guardedFetchMock = jest.fn();

const lines = Array.from({ length: LINE_COUNT }, (_, index) => `${index + 1}\n`);
const answer = lines.join('');
const frames = lines.map(
  (line) => `data: ${JSON.stringify({ choices: [{ delta: { content: line } }] })}\n\n`,
);

function load() {
  jest.resetModules();
  guardedFetchMock.mockReset();
  jest.doMock('@/lib/constants', () => ({
    API_URL: 'https://api.agi.test',
    TIMEOUTS: { STREAMING: 60_000, STREAM_STALL: 30_000 },
  }));
  jest.doMock('@/lib/egressGuard', () => ({ guardedFetch: guardedFetchMock }));
  jest.doMock('../services/authSession', () => ({
    getAuthToken: jest.fn().mockResolvedValue('burst-token'),
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
    .requireActual<CloudAccountSessionModule>('../src/features/auth/services/cloudAccountSession')
    .activateCloudAccount('burst-account');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../services/streaming') as typeof import('../services/streaming');
}

/**
 * Counts commits the way React Native's Fabric renderer schedules them: with
 * `RN$enableMicrotasksInReact`, the first store write in a synchronous run
 * queues one microtask render and every write before it runs joins that render
 * (`scheduleImmediateRootScheduleTask` in ReactFabric-prod.js). The jest
 * renderer schedules on a macrotask instead, so it cannot show this.
 */
function fabricCommitCounter() {
  let commits = 0;
  let pending = false;
  return {
    write() {
      if (pending) return;
      pending = true;
      commits += 1;
      queueMicrotask(() => {
        pending = false;
      });
    },
    get commits() {
      return commits;
    },
  };
}

function wholeAnswerAtOnce(onArrived?: () => void): Response {
  return {
    ok: true,
    status: 200,
    body: null,
    text: async () => {
      onArrived?.();
      return `${frames.join('')}data: [DONE]\n\n`;
    },
  } as unknown as Response;
}

function answerThenOpenStream(onArrived: () => void): Response {
  const encoded = new TextEncoder().encode(frames.join(''));
  let delivered = false;
  const reader = {
    read: () => {
      if (delivered) return new Promise<never>(() => undefined);
      delivered = true;
      onArrived();
      return Promise.resolve({ value: encoded, done: false });
    },
    cancel: () => Promise.resolve(),
    releaseLock: () => undefined,
  };
  return {
    ok: true,
    status: 200,
    body: { getReader: () => reader },
    text: async () => '',
  } as unknown as Response;
}

function send(
  streaming: ReturnType<typeof load>,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  return streaming.streamChat(
    {
      model: MODEL.id,
      messages: [{ role: 'user', content: 'Count from 1 to 200, one number per line.' }],
      stream: true,
      operationId: RUN_ID,
    },
    callbacks,
    signal,
  );
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

describe('a Cloud answer that arrives all at once', () => {
  it('reaches the screen in one commit rather than one per line', async () => {
    const streaming = load();
    guardedFetchMock.mockResolvedValue(wholeAnswerAtOnce());
    const counter = fabricCommitCounter();
    let shown = '';
    const order: string[] = [];

    await send(streaming, {
      onDelta: (delta) => {
        counter.write();
        shown += delta.content ?? '';
        order.push('delta');
      },
      onDone: () => order.push('done'),
      onError: (error) => {
        throw error;
      },
    });

    expect(shown).toBe(answer);
    expect(order.filter((entry) => entry === 'delta')).toHaveLength(LINE_COUNT);
    expect(order[order.length - 1]).toBe('done');
    expect(counter.commits).toBeLessThanOrEqual(2);
  });

  it('lets a Stop tap run before the burst is rendered, and shows nothing after it', async () => {
    const streaming = load();
    const controller = new AbortController();
    const counter = fabricCommitCounter();
    let commitsBeforeStop = -1;
    let deltasBeforeStop = -1;
    let deltas = 0;
    const stopped = new Promise<void>((resolve) => {
      guardedFetchMock.mockResolvedValue(
        answerThenOpenStream(() => {
          setTimeout(() => {
            commitsBeforeStop = counter.commits;
            deltasBeforeStop = deltas;
            controller.abort();
            resolve();
          }, 0);
        }),
      );
    });

    const run = send(
      streaming,
      {
        onDelta: () => {
          counter.write();
          deltas += 1;
        },
        onDone: jest.fn(),
        onError: jest.fn(),
      },
      controller.signal,
    );
    await stopped;
    await run;
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(commitsBeforeStop).toBeLessThanOrEqual(1);
    expect(deltas).toBe(deltasBeforeStop);
  });
});
