import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  sleep: vi.fn(async () => undefined),
  query: vi.fn(),
  execute: vi.fn(),
  closeStream: vi.fn(async () => undefined),
  fail: vi.fn(async () => undefined),
  ensurePlan: vi.fn(async () => undefined),
  settlePlan: vi.fn(async () => undefined),
}));

const db = {
  query: mocks.query,
  execute: mocks.execute,
  transaction: vi.fn(),
  withUser: vi.fn(),
  dispose: vi.fn(),
};

vi.mock('workflow', () => ({ sleep: mocks.sleep }));
vi.mock('../device-steps/device-clearance-step', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../device-steps/device-clearance-step')>();
  return { ...actual, clearCloudAgentDevice: vi.fn(actual.clearCloudAgentDevice) };
});
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => db }));
vi.mock('./steps/close-cloud-agent-stream', () => ({
  closeCloudAgentWorkflowStream: mocks.closeStream,
}));
vi.mock('./steps/fail-cloud-agent-workflow', () => ({ failCloudAgentWorkflow: mocks.fail }));
vi.mock('./steps/work-plan-steps', () => ({
  ensureWorkPlanForRun: mocks.ensurePlan,
  settleWorkPlanForRun: mocks.settlePlan,
}));

const executeInvocation = vi.hoisted(() => vi.fn());
vi.mock('./steps/execute-cloud-agent-invocation', () => ({
  executeCloudAgentWorkflowInvocation: executeInvocation,
}));

import { cloudAgentWorkflow } from './cloud-agent-workflow';
import { clearCloudAgentDevice } from '../device-steps/device-clearance-step';
import type { CloudAgentWorkflowInput } from './cloud-agent-workflow-input';

const RUN_ID = '0190a000-0000-7000-8000-000000000001';
const INSTALL_ID = 'install-abcdefgh';

const DEVICE_HOST = {
  deviceId: INSTALL_ID,
  deviceName: 'Work MacBook',
  platform: 'darwin',
  appVersion: '1.4.0',
  capabilities: ['computer.use'],
  roots: [{ id: 'root-1', name: 'Documents', path: '/Users/a/Documents' }],
};

function makeInput(withDevice = true): CloudAgentWorkflowInput {
  return {
    version: 1,
    runId: RUN_ID,
    userId: 'user-1',
    processed: {
      requestId: 'agi.chat.desktop.send.turn-1',
      chatRequest: { model: 'claude-test', messages: [], work_mode: 'chat' },
      requestedModel: 'claude-test',
      provider: 'anthropic',
      estimatedCostCents: 0,
      estimatedPromptTokens: 100,
      maxTokens: 4096,
      usedFallback: false,
      originalModel: 'claude-test',
      resolvedTaskType: 'coding',
      classifierConfidence: 1,
      resolvedSlot: null,
      quotaFeature: 'chat',
      quotaWarningHeader: null,
      isFlagshipRequest: false,
      indicResult: {},
      llmRequest: { model: 'claude-test', messages: [], max_tokens: 4096 },
      ...(withDevice ? { deviceHost: DEVICE_HOST } : {}),
    } as unknown as CloudAgentWorkflowInput['processed'],
    billing: {
      kind: 'managed',
      userId: 'user-1',
      idempotencyKey: 'agi.chat.desktop.send.turn-1',
      requestHash: 'hash-1',
      leaseToken: '0190a000-0000-7000-8000-000000000002',
      estimatedCostCents: 12,
    },
    mcpTools: [],
    approvalMode: 'manual',
  };
}

function registryRow(overrides: Record<string, unknown> = {}) {
  return {
    device_id: '0190a000-0000-7000-8000-0000000000aa',
    surface: 'desktop',
    name: 'Work MacBook',
    last_seen_at: new Date().toISOString(),
    remote_enabled: true,
    browser_available: true,
    computer_use_available: true,
    local_models_available: false,
    local_mcp_available: false,
    credential_family_id: 'family-1',
    identity_session_id: null,
    live_credential: true,
    ...overrides,
  };
}

function servedInput(call = 0): CloudAgentWorkflowInput {
  return executeInvocation.mock.calls[call]![0] as CloudAgentWorkflowInput;
}

describe('a durable run consults the device registry before offering device tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    executeInvocation.mockResolvedValue({ kind: 'done' });
  });

  it('serves the device host through when the paired device is online and authenticated', async () => {
    mocks.query.mockResolvedValue([registryRow()]);

    await cloudAgentWorkflow(makeInput());

    expect(servedInput().processed.deviceHost).toMatchObject({ deviceId: INSTALL_ID });
    expect(mocks.sleep).not.toHaveBeenCalled();
  });

  it('never reads the registry for a run that declared no device', async () => {
    await cloudAgentWorkflow(makeInput(false));

    expect(mocks.query).not.toHaveBeenCalled();
    expect(clearCloudAgentDevice).not.toHaveBeenCalled();
    expect(mocks.ensurePlan).not.toHaveBeenCalled();
    expect(mocks.settlePlan).not.toHaveBeenCalled();
    expect(executeInvocation).toHaveBeenCalledTimes(1);
  });

  it('preserves plan initialization and settlement for AGI Work', async () => {
    const input = makeInput(false);
    input.processed.chatRequest.work_mode = 'agiwork';

    await cloudAgentWorkflow(input);

    expect(mocks.ensurePlan).toHaveBeenCalledWith(input);
    expect(mocks.settlePlan).toHaveBeenCalledWith(input, 'completed');
    expect(mocks.closeStream).toHaveBeenCalledWith(RUN_ID);
  });

  it.each(['chat', 'agiwork'] as const)(
    'settles failed %s runs without losing stream cleanup',
    async (workMode) => {
      const input = makeInput(false);
      input.processed.chatRequest.work_mode = workMode;
      const failure = new Error('provider unavailable');
      executeInvocation.mockRejectedValueOnce(failure);

      await expect(cloudAgentWorkflow(input)).rejects.toThrow(failure);

      expect(mocks.fail).toHaveBeenCalledWith(input, failure);
      expect(mocks.closeStream).toHaveBeenCalledWith(RUN_ID);
      if (workMode === 'agiwork') {
        expect(mocks.settlePlan).toHaveBeenCalledWith(input, 'failed');
      } else {
        expect(mocks.settlePlan).not.toHaveBeenCalled();
      }
    },
  );

  it('waits for a sleeping device instead of failing the run', async () => {
    const asleep = new Date(Date.now() - 3 * 60 * 60_000).toISOString();
    mocks.query
      .mockResolvedValueOnce([registryRow({ last_seen_at: asleep })])
      .mockResolvedValueOnce([registryRow({ last_seen_at: asleep })])
      .mockResolvedValue([registryRow()]);

    await cloudAgentWorkflow(makeInput());

    expect(mocks.sleep).toHaveBeenCalledTimes(2);
    expect(mocks.fail).not.toHaveBeenCalled();
    expect(servedInput().processed.deviceHost).toMatchObject({ deviceId: INSTALL_ID });
  });

  it('withdraws the device tools and runs on when a device never comes back', async () => {
    mocks.query.mockResolvedValue([
      registryRow({ last_seen_at: new Date(Date.now() - 90 * 24 * 60 * 60_000).toISOString() }),
    ]);

    await cloudAgentWorkflow(makeInput());

    expect(mocks.fail).not.toHaveBeenCalled();
    expect(servedInput().processed.deviceHost).toBeUndefined();
  });

  it('withdraws the device tools when the declaration names an unregistered device', async () => {
    mocks.query.mockResolvedValue([]);

    await cloudAgentWorkflow(makeInput());

    expect(mocks.sleep).not.toHaveBeenCalled();
    expect(servedInput().processed.deviceHost).toBeUndefined();
  });

  it('withdraws the device tools when its credential was revoked', async () => {
    mocks.query.mockResolvedValue([registryRow({ live_credential: false })]);

    await cloudAgentWorkflow(makeInput());

    expect(servedInput().processed.deviceHost).toBeUndefined();
  });

  it('withdraws the device tools when remote work was switched off on the device', async () => {
    mocks.query.mockResolvedValue([registryRow({ remote_enabled: false })]);

    await cloudAgentWorkflow(makeInput());

    expect(servedInput().processed.deviceHost).toBeUndefined();
  });

  it('withdraws screen steps from a device that stopped reporting computer use', async () => {
    mocks.query.mockResolvedValue([registryRow({ computer_use_available: false })]);

    await cloudAgentWorkflow(makeInput());

    expect(servedInput().processed.deviceHost).toBeUndefined();
  });

  it('withdraws the device tools rather than dispatching when the registry cannot be read', async () => {
    mocks.query.mockRejectedValue(new Error('registry unreachable'));

    await cloudAgentWorkflow(makeInput());

    expect(servedInput().processed.deviceHost).toBeUndefined();
    expect(mocks.fail).not.toHaveBeenCalled();
  });

  it('re-clears the device on every invocation of a continuing run', async () => {
    mocks.query.mockResolvedValue([registryRow()]);
    executeInvocation
      .mockResolvedValueOnce({ kind: 'continue', input: makeInput() })
      .mockResolvedValueOnce({ kind: 'done' });

    await cloudAgentWorkflow(makeInput());

    expect(executeInvocation).toHaveBeenCalledTimes(2);
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });
});
