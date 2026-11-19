import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ManagedCloudScheduleRunApproval } from '@agiworkforce/cloud-contracts';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

const mocks = vi.hoisted(() => ({
  claimSlackRunApproval: vi.fn(),
  settleSlackRun: vi.fn(),
  findSlackInstallationById: vi.fn(),
  findSlackTask: vi.fn(),
  slackTask: vi.fn(),
  runSlackAssistantTurn: vi.fn(),
  postSlackMessage: vi.fn(),
  postSlackEphemeral: vi.fn(),
  setSlackReaction: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule8>()),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule7>()),
  checkRateLimit: vi.fn(),
}));
vi.mock('@/lib/server/claimed-user-scope-db', () => ({
  createClaimedUserScopedDb: vi.fn(() => ({ scoped: true })),
}));
vi.mock('@/lib/services/notification-service', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule6>()),
  recordNotification: vi.fn(),
}));
vi.mock('./slack-config', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule5>()),
  SLACK_WORKING_REACTION: 'hourglass',
  slackAppOrigin: () => 'https://agi.invalid',
  slackLinkUrl: vi.fn(),
  slackSettingsUrl: vi.fn(),
}));
vi.mock('./slack-api', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule4>()),
  isSlackTokenRevoked: vi.fn(() => false),
  postSlackEphemeral: mocks.postSlackEphemeral,
  postSlackMessage: mocks.postSlackMessage,
  setSlackReaction: mocks.setSlackReaction,
}));
vi.mock('./slack-assistant-turn', () => ({ runSlackAssistantTurn: mocks.runSlackAssistantTurn }));
vi.mock('./slack-context', () => ({ buildSlackTurnContext: vi.fn() }));
vi.mock('./slack-installations', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule3>()),
  deleteSlackInstallationForTeam: vi.fn(),
  findSlackInstallation: vi.fn(),
  findSlackInstallationById: mocks.findSlackInstallationById,
}));
vi.mock('./slack-links', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule2>()),
  issueSlackLinkRequest: vi.fn(),
  resolveSlackAccountLink: vi.fn(),
}));
vi.mock('./slack-runs', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule1>()),
  SLACK_TASK_STOPPED_ERROR: 'stopped',
  claimSlackRunApproval: mocks.claimSlackRunApproval,
  parkSlackRunForApproval: vi.fn(),
  settleSlackRun: mocks.settleSlackRun,
  slackApprovalGeneration: vi.fn(),
  startSlackRun: vi.fn(),
}));
vi.mock('./slack-tasks', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  findSlackTask: mocks.findSlackTask,
  slackTask: mocks.slackTask,
  slackTaskAvailable: vi.fn(),
}));

import { SlackApprovalUnavailableError, claimSlackApproval } from './slack-assistant';

const INSTALLATION = '0190a000-0000-7000-8000-0000000000b1';
const RUN_ID = '0190a000-0000-7000-8000-0000000000e1';

function run(overrides: Record<string, unknown> = {}) {
  return {
    id: RUN_ID,
    userId: 'user_b',
    organizationId: null,
    installationId: INSTALLATION,
    slackUserId: 'U123',
    channelId: 'C111',
    messageTs: '1700000000.000100',
    threadTs: null,
    surface: 'channel',
    mode: 'answer',
    agentRunId: null,
    ...overrides,
  };
}

function policyDb(row: { mode: string; allowed_tools: unknown } | null) {
  return {
    query: vi.fn(async () => (row ? [row] : [])),
  } as unknown as DatabaseAdapter;
}

const approval: ManagedCloudScheduleRunApproval = { decision: 'approved', toolCallIds: ['call_1'] };
const checkpoint = { completedSteps: 1 };

async function claim(db: DatabaseAdapter) {
  return claimSlackApproval({
    serviceDb: db,
    scopedDb: {} as DatabaseAdapter,
    userId: 'user_b',
    runId: RUN_ID,
    approval,
  });
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.findSlackInstallationById.mockResolvedValue({ id: INSTALLATION, botToken: 'xoxb-test' });
  mocks.findSlackTask.mockResolvedValue(null);
  mocks.settleSlackRun.mockResolvedValue(undefined);
  mocks.runSlackAssistantTurn.mockResolvedValue({
    kind: 'answered',
    text: 'done',
    model: 'm',
  });
  mocks.claimSlackRunApproval.mockResolvedValue({ run: run(), checkpoint });
});

describe('resuming a parked Slack approval', () => {
  it('refuses to continue when the channel was turned off after the run parked', async () => {
    await expect(claim(policyDb({ mode: 'off', allowed_tools: null }))).rejects.toBeInstanceOf(
      SlackApprovalUnavailableError,
    );
    expect(mocks.settleSlackRun).toHaveBeenCalledTimes(1);
    expect(mocks.settleSlackRun).toHaveBeenCalledWith(
      { scoped: true },
      expect.objectContaining({ id: RUN_ID }),
      expect.objectContaining({ status: 'failed', error: expect.stringContaining('channel_off') }),
    );
    expect(mocks.runSlackAssistantTurn).not.toHaveBeenCalled();
    expect(mocks.postSlackMessage).not.toHaveBeenCalled();
  });

  it('settles the parked task as failed when the channel was turned off', async () => {
    const settle = vi.fn(async () => undefined);
    mocks.claimSlackRunApproval.mockResolvedValue({
      run: run({ mode: 'task', agentRunId: 'agent_1' }),
      checkpoint,
    });
    mocks.findSlackTask.mockResolvedValue({ agentRunId: 'agent_1', conversationId: 'c_1' });
    mocks.slackTask.mockReturnValue({ observer: {}, link: vi.fn(), settle });

    await expect(claim(policyDb({ mode: 'off', allowed_tools: null }))).rejects.toBeInstanceOf(
      SlackApprovalUnavailableError,
    );
    expect(settle).toHaveBeenCalledWith({ kind: 'failed' });
  });

  it('still resumes a channel that is on and passes its saved tools', async () => {
    const resume = await claim(policyDb({ mode: 'task', allowed_tools: ['web'] }));
    expect(mocks.settleSlackRun).not.toHaveBeenCalled();
    await resume();
    expect(mocks.runSlackAssistantTurn).toHaveBeenCalledWith(
      expect.objectContaining({ channelTools: ['web'], mode: 'answer' }),
    );
  });

  it('does not apply a channel policy to a direct message run', async () => {
    mocks.claimSlackRunApproval.mockResolvedValue({
      run: run({ surface: 'dm' }),
      checkpoint,
    });
    const db = policyDb({ mode: 'off', allowed_tools: null });
    const resume = await claim(db);
    expect(db.query).not.toHaveBeenCalled();
    expect(mocks.settleSlackRun).not.toHaveBeenCalled();
    await resume();
    expect(mocks.runSlackAssistantTurn).toHaveBeenCalledWith(
      expect.objectContaining({ channelTools: null }),
    );
  });
});

type ImportedModule8 = typeof import('@/lib/logger');
type ImportedModule7 = typeof import('@/lib/rate-limit');
type ImportedModule6 = typeof import('@/lib/services/notification-service');
type ImportedModule5 = typeof import('./slack-config');
type ImportedModule4 = typeof import('./slack-api');
type ImportedModule3 = typeof import('./slack-installations');
type ImportedModule2 = typeof import('./slack-links');
type ImportedModule1 = typeof import('./slack-runs');
type ImportedModule0 = typeof import('./slack-tasks');
