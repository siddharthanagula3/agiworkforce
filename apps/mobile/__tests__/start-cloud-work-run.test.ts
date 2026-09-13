import { requireMobileCloudModel } from '../test-utils/modelFixtures';

const createConversationMock = jest.fn();
const sendMessageMock = jest.fn();
const guardedFetchMock = jest.fn();
const getAuthTokenMock = jest.fn();

const SSE = ['data: {"choices":[{"delta":{"content":"ok"}}]}', '', 'data: [DONE]', ''].join('\n');

async function loadStartWork() {
  jest.resetModules();
  createConversationMock.mockReset().mockResolvedValue('conversation-1');
  sendMessageMock.mockReset();

  jest.doMock('@/stores/chatStore', () => ({
    useChatStore: {
      getState: () => ({
        createConversation: createConversationMock,
        sendMessage: sendMessageMock,
      }),
    },
  }));
  jest.doMock('@/src/features/model-picker/store', () => ({
    useModelStore: { getState: () => ({ selectedModel: requireMobileCloudModel().id }) },
  }));
  jest.doMock('@/src/features/billing/store', () => ({
    useTierStore: { getState: () => ({ tier: 'pro' }) },
  }));

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../src/features/tasks/startWork') as typeof import('../src/features/tasks/startWork');
}

async function loadStreamingService() {
  jest.resetModules();
  guardedFetchMock.mockReset().mockResolvedValue({
    ok: true,
    status: 200,
    body: null,
    text: async () => SSE,
  } as unknown as Response);
  getAuthTokenMock.mockReset().mockResolvedValue('cloud-token');

  jest.doMock('@/lib/constants', () => ({
    API_URL: 'https://api.agi.test',
    TIMEOUTS: { STREAMING: 60_000, STREAM_STALL: 45_000 },
  }));
  jest.doMock('@/lib/egressGuard', () => ({ guardedFetch: guardedFetchMock }));
  jest.doMock('../services/authSession', () => ({ getAuthToken: getAuthTokenMock }));
  jest.doMock('../services/llmGate', () => ({ ensureLlmGateOpen: jest.fn() }));
  jest.doMock('../services/remoteChatGate', () => ({ assertRemoteChatAllowed: jest.fn() }));
  jest.doMock('@/src/features/waitlist/store', () => ({
    useWaitlistStore: { getState: () => ({ cloudUnlocked: true }) },
  }));

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../services/streaming') as typeof import('../services/streaming');
}

describe('starting an AGI Work run from mobile', () => {
  afterEach(() => {
    jest.dontMock('@/stores/chatStore');
    jest.dontMock('@/src/features/model-picker/store');
    jest.dontMock('@/src/features/billing/store');
    jest.dontMock('@/lib/constants');
    jest.dontMock('@/lib/egressGuard');
    jest.dontMock('../services/authSession');
    jest.dontMock('../services/llmGate');
    jest.dontMock('../services/remoteChatGate');
    jest.dontMock('@/src/features/waitlist/store');
  });

  it('sends the goal as an agiwork turn and resolves as soon as the turn is accepted', async () => {
    const { startCloudWorkRun } = await loadStartWork();
    let finishSend: ((accepted: boolean) => void) | undefined;
    sendMessageMock.mockImplementation((_id, _content, _model, _attachments, options) => {
      options.onAccepted();
      return new Promise<boolean>((resolve) => {
        finishSend = resolve;
      });
    });

    const result = await startCloudWorkRun({
      goal: '  Compare the top three CRMs  ',
      constraints: 'Public sources only',
      deliverable: '',
      projectId: 'project-9',
    });

    expect(result.conversationId).toBe('conversation-1');
    expect(createConversationMock).toHaveBeenCalledWith('Compare the top three CRMs', 'project-9');
    const [conversationId, content, model, attachments, options] = sendMessageMock.mock.calls[0];
    expect(conversationId).toBe('conversation-1');
    expect(content).toBe('Compare the top three CRMs');
    expect(model).toBe(requireMobileCloudModel().id);
    expect(attachments).toBeUndefined();
    expect(options.workMode).toBe('agiwork');
    expect(options.agiWorkGoal).toEqual({
      goal: 'Compare the top three CRMs',
      constraints: 'Public sources only',
    });
    finishSend?.(true);
  });

  it('refuses an empty goal before any conversation is created', async () => {
    const { startCloudWorkRun, START_WORK_EMPTY_GOAL_ERROR } = await loadStartWork();

    await expect(startCloudWorkRun({ goal: '   ' })).rejects.toThrow(START_WORK_EMPTY_GOAL_ERROR);
    expect(createConversationMock).not.toHaveBeenCalled();
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('reports a rejected send instead of claiming the task started', async () => {
    const { startCloudWorkRun, START_WORK_ERROR } = await loadStartWork();
    sendMessageMock.mockResolvedValue(false);

    await expect(startCloudWorkRun({ goal: 'Draft the launch plan' })).rejects.toThrow(
      START_WORK_ERROR,
    );
  });

  it('puts work_mode and agi_work_goal on the completions request', async () => {
    const { streamChat } = await loadStreamingService();

    await streamChat(
      {
        model: requireMobileCloudModel().id,
        messages: [{ role: 'user', content: 'Compare the top three CRMs' }],
        stream: true,
        operationId: '0190a000-0000-7000-8000-000000000041',
        work_mode: 'agiwork',
        agi_work_goal: { goal: 'Compare the top three CRMs', constraints: 'Public sources only' },
      },
      { onDelta: jest.fn(), onDone: jest.fn(), onError: jest.fn() },
    );

    const [, init] = guardedFetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.work_mode).toBe('agiwork');
    expect(body.agi_work_goal).toEqual({
      goal: 'Compare the top three CRMs',
      constraints: 'Public sources only',
    });
  });
});
