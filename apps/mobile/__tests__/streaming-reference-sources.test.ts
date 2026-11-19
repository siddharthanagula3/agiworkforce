import {
  MOVED_FROM_MODEL_HEADER,
  MOVED_REASON_HEADER,
  PROJECT_FILE_CITATIONS_HEADER,
} from '@agiworkforce/types';
import { ROUTE_LANE_HEADER, SECRET_REDACTION_COUNT_HEADER } from '@agiworkforce/cloud-contracts';
import { PAST_CHAT_CITATIONS_HEADER } from '../src/features/chat/utils/referenceCitations';
import type { StreamDelta } from '../services/streaming';
import { requireMobileCloudModel } from '../test-utils/modelFixtures';

const MODEL = requireMobileCloudModel();
const OPERATION_ID = '0190a000-0000-7000-8000-0000000000f1';

const guardedFetchMock = jest.fn();
const tokenMock = jest.fn();
const consentMock = jest.fn();
const deviceHeadersMock = jest.fn();
const recoverMock = jest.fn();
const refusalMock = jest.fn();

function load() {
  jest.resetModules();
  guardedFetchMock.mockReset();
  tokenMock.mockReset().mockResolvedValue('account-a-token');
  consentMock.mockReset().mockResolvedValue(undefined);
  deviceHeadersMock.mockReset().mockResolvedValue({});
  recoverMock.mockReset().mockResolvedValue(true);
  refusalMock.mockReset().mockReturnValue(null);
  jest.doMock('@/lib/constants', () => ({
    API_URL: 'https://api.agi.test',
    TIMEOUTS: { STREAMING: 60_000, STREAM_STALL: 30_000 },
  }));
  jest.doMock('@/lib/egressGuard', () => ({ guardedFetch: guardedFetchMock }));
  jest.doMock('../services/authSession', () => ({ getAuthToken: tokenMock }));
  jest.doMock('../services/llmGate', () => ({
    ensureCloudSendConsent: consentMock,
    ensureLlmGateOpen: jest.fn(),
  }));
  jest.doMock('../services/remoteChatGate', () => ({ assertRemoteChatAllowed: jest.fn() }));
  jest.doMock('@/src/features/waitlist/store', () => ({
    useWaitlistStore: { getState: () => ({ cloudUnlocked: true }) },
  }));
  jest.doMock('@/src/features/integrations/services/phoneDeviceHost', () => ({
    phoneDeviceHostHeaders: deviceHeadersMock,
  }));
  jest.doMock('../services/api', () => ({
    ApiPaywallError: class ApiPaywallError extends Error {},
    recoverStreamSession: recoverMock,
    streamAuthRefusal: refusalMock,
  }));

  const accounts = jest.requireActual<
    typeof import('../src/features/auth/services/cloudAccountSession')
  >('../src/features/auth/services/cloudAccountSession');
  accounts.activateCloudAccount('stream-account-a');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const streaming = require('../services/streaming') as typeof import('../services/streaming');
  return { ...streaming, accounts };
}

function headers(values: Record<string, string>) {
  const lower = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return { get: (name: string) => lower[name.toLowerCase()] ?? null };
}

function frame(delta: Record<string, unknown>): string {
  return `data: ${JSON.stringify({ choices: [{ index: 0, delta }] })}\n\n`;
}

function base64Json(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
}

function response(headerValues: Record<string, string>, frames: string[]) {
  return {
    ok: true,
    status: 200,
    body: null,
    headers: headers(headerValues),
    text: async () => frames.join('') + 'data: [DONE]\n\n',
  } as unknown as Response;
}

function callbacks() {
  return {
    onDelta: jest.fn<void, [StreamDelta]>(),
    onDone: jest.fn(),
    onError: jest.fn(),
    onProjectSources: jest.fn(),
    onPastChatSources: jest.fn(),
    onTurnNotices: jest.fn(),
  };
}

function send(services: ReturnType<typeof load>, calls: ReturnType<typeof callbacks>) {
  return services.streamChat(
    {
      model: MODEL.id,
      messages: [{ role: 'user', content: 'When do I plant tulips?' }],
      stream: true,
      operationId: OPERATION_ID,
    },
    calls,
  );
}

const PROJECT_SOURCE = { fileName: 'beds.pdf', fileId: 'file-beds', projectId: 'project-garden' };
const PAST_CHAT_SOURCE = {
  id: 'past-1',
  conversationId: '0190a000-0000-7000-8000-0000000000f2',
  messageId: 'past-message-1',
  title: 'Spring planting',
  createdAt: '2026-11-01T09:00:00.000Z',
};

describe('the sources the gateway reports in response headers', () => {
  it('passes on the project files and past chats the answer used', async () => {
    const services = load();
    guardedFetchMock.mockResolvedValueOnce(
      response(
        {
          [PROJECT_FILE_CITATIONS_HEADER]: base64Json([PROJECT_SOURCE]),
          [PAST_CHAT_CITATIONS_HEADER]: base64Json([PAST_CHAT_SOURCE]),
        },
        [frame({ content: 'In October.' })],
      ),
    );
    const calls = callbacks();

    await send(services, calls);

    expect(calls.onProjectSources).toHaveBeenCalledWith([
      expect.objectContaining({ fileName: 'beds.pdf', fileId: 'file-beds' }),
    ]);
    expect(calls.onPastChatSources).toHaveBeenCalledWith([
      expect.objectContaining({
        conversationId: PAST_CHAT_SOURCE.conversationId,
        title: 'Spring planting',
      }),
    ]);
    expect(calls.onDone).toHaveBeenCalled();
  });

  it('stays quiet when the answer used neither', async () => {
    const services = load();
    guardedFetchMock.mockResolvedValueOnce(response({}, [frame({ content: 'In October.' })]));
    const calls = callbacks();

    await send(services, calls);

    expect(calls.onProjectSources).not.toHaveBeenCalled();
    expect(calls.onPastChatSources).not.toHaveBeenCalled();
  });
});

describe('how the gateway says it answered', () => {
  it('passes on a model move, the lane and how many secrets it removed', async () => {
    const services = load();
    const movedFrom = requireMobileCloudModel((model) => model.id !== MODEL.id).id;
    guardedFetchMock.mockResolvedValueOnce(
      response(
        {
          [MOVED_FROM_MODEL_HEADER]: movedFrom,
          [MOVED_REASON_HEADER]: 'capability',
          [ROUTE_LANE_HEADER]: 'free',
          [SECRET_REDACTION_COUNT_HEADER]: '2',
        },
        [frame({ content: 'In October.' })],
      ),
    );
    const calls = callbacks();

    await send(services, calls);

    expect(calls.onTurnNotices).toHaveBeenCalledTimes(1);
    expect(calls.onTurnNotices).toHaveBeenCalledWith({
      movedFromModel: movedFrom,
      movedReason: 'capability',
      routeLane: 'free',
      secretRedactionCount: 2,
    });
  });

  it('ignores an unknown lane, an unreadable count and a reason without a move', async () => {
    const services = load();
    expect(
      services.readTurnNoticeHeaders(
        headers({
          [MOVED_REASON_HEADER]: 'capability',
          [ROUTE_LANE_HEADER]: 'express',
          [SECRET_REDACTION_COUNT_HEADER]: 'two',
        }),
      ),
    ).toEqual({});
    guardedFetchMock.mockResolvedValueOnce(response({}, [frame({ content: 'In October.' })]));
    const calls = callbacks();

    await send(services, calls);

    expect(calls.onTurnNotices).not.toHaveBeenCalled();
  });
});

describe('a tool approval request with its review', () => {
  it('keeps the risk, whether it is destructive, and the scopes the person may choose', async () => {
    const services = load();
    guardedFetchMock.mockResolvedValueOnce(
      response({}, [
        frame({
          x_tool_approval_request: {
            tool_call_id: 'call_send',
            name: 'mcp__gmail__send_email',
            args: { to: 'grower@example.net' },
            risk_tier: 'high',
            destructive: true,
            approval_scopes: ['once', 'session'],
          },
        }),
      ]),
    );
    const calls = callbacks();

    await send(services, calls);

    const request = calls.onDelta.mock.calls
      .map(([delta]) => delta.x_tool_approval_request)
      .find((value) => value !== undefined);
    expect(request).toMatchObject({
      risk_tier: 'high',
      destructive: true,
      approval_scopes: ['once', 'session'],
    });
  });

  it('drops a review whose fields are not ones the contract allows', async () => {
    const services = load();
    guardedFetchMock.mockResolvedValueOnce(
      response({}, [
        frame({
          x_tool_approval_request: {
            tool_call_id: 'call_send',
            name: 'mcp__gmail__send_email',
            args: {},
            risk_tier: 'unheard-of',
            destructive: 'yes',
            approval_scopes: ['forever'],
          },
        }),
      ]),
    );
    const calls = callbacks();

    await send(services, calls);

    const request = calls.onDelta.mock.calls
      .map(([delta]) => delta.x_tool_approval_request)
      .find((value) => value !== undefined) as Record<string, unknown> | undefined;
    expect(request).toBeDefined();
    expect(request).not.toHaveProperty('risk_tier');
    expect(request).not.toHaveProperty('approval_scopes');
  });
});
