/**
 * @vitest-environment jsdom
 *
 * The data and routing boundary for the side panel's Projects and Schedules
 * drawers: each client turns one hosted response into the rows the
 * drawer renders, and turns a 401 into the signed-out state rather than an
 * empty list, which would state "you have none" over "we could not ask".
 */
import { describe, expect, it, vi } from 'vitest';
import {
  ManagedCloudProjectsHttpError,
  ManagedCloudSchedulesHttpError,
  type ManagedCloudProject,
  type ManagedCloudProjectsClient,
  type ManagedCloudScheduleTask,
  type ManagedCloudSchedulesClient,
} from '@agiworkforce/cloud-contracts';
import {
  listChromeProjects,
  type ChromeProjectsDependencies,
} from '../src/features/cloud-bridge/projectsClient';
import {
  listChromeSchedules,
  type ChromeSchedulesDependencies,
} from '../src/features/cloud-bridge/schedulesClient';

function project(overrides: Partial<ManagedCloudProject> = {}): ManagedCloudProject {
  return {
    id: 'project-1',
    ownerUserId: 'user-1',
    name: 'Launch plan',
    description: 'Everything for the launch',
    instructions: 'Be terse',
    defaultPrivacyMode: 'managed',
    defaultProviderMode: 'ManagedGateway',
    allowedSurfaces: ['chrome'],
    conversationCount: 4,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-10T00:00:00.000Z',
    ...overrides,
  };
}

function projectsClient(
  overrides: Partial<ManagedCloudProjectsClient> = {},
): ManagedCloudProjectsClient {
  return {
    listProjects: vi.fn(),
    getProject: vi.fn(),
    createProject: vi.fn(),
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
    pullProjects: vi.fn(),
    pushProjects: vi.fn(),
    ...overrides,
  };
}

function projectsDependencies(
  client: ManagedCloudProjectsClient,
  token: string | null = 'token-1',
): Partial<ChromeProjectsDependencies> {
  return {
    getAuthToken: vi.fn(async () => token),
    createProjectsClient: vi.fn(() => client),
  };
}

function schedule(overrides: Partial<ManagedCloudScheduleTask> = {}): ManagedCloudScheduleTask {
  return {
    id: 'schedule-1',
    userId: 'user-1',
    name: 'Morning brief',
    description: null,
    scheduleType: 'cron',
    cronExpression: '0 9 * * *',
    executeAt: null,
    intervalMs: null,
    timezone: 'UTC',
    isEnabled: true,
    expiresAt: null,
    maxExecutions: null,
    executionCount: 12,
    actionType: 'agent',
    actionConfig: null,
    prompt: 'Summarise my inbox',
    model: null,
    status: 'active',
    lastExecutedAt: '2026-09-13T09:00:00.000Z',
    nextExecutionAt: '2026-09-15T09:00:00.000Z',
    lastError: null,
    metadata: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-13T09:00:00.000Z',
    ...overrides,
  };
}

function schedulesClient(
  overrides: Partial<ManagedCloudSchedulesClient> = {},
): ManagedCloudSchedulesClient {
  return {
    listSchedules: vi.fn(),
    getSchedule: vi.fn(),
    createSchedule: vi.fn(),
    updateSchedule: vi.fn(),
    setScheduleEnabled: vi.fn(),
    deleteSchedule: vi.fn(),
    listRuns: vi.fn(),
    runNow: vi.fn(),
    resolveRunApproval: vi.fn(),
    listRecentRuns: vi.fn(),
    shareSchedule: vi.fn(),
    unshareSchedule: vi.fn(),
    ...overrides,
  };
}

function schedulesDependencies(
  client: ManagedCloudSchedulesClient,
  token: string | null = 'token-1',
): Partial<ChromeSchedulesDependencies> {
  return {
    getAuthToken: vi.fn(async () => token),
    createClient: vi.fn(() => client),
    newIdempotencyKey: () => 'key-1',
  };
}

describe('projects drawer client', () => {
  it('maps the hosted project list into rows and hides archived projects', async () => {
    const listProjects = vi
      .fn()
      .mockResolvedValue([project(), project({ id: 'project-2', isArchived: true })]);
    const result = await listChromeProjects(
      {},
      projectsDependencies(projectsClient({ listProjects })),
    );

    expect(result.status).toBe('success');
    if (result.status !== 'success') throw new Error('expected a project list');
    expect(result.projects.map((entry) => entry.id)).toEqual(['project-1']);
    expect(result.projects[0]?.conversationCount).toBe(4);
  });

  it('turns a 401 into the signed-out state instead of an empty list', async () => {
    const listProjects = vi
      .fn()
      .mockRejectedValue(new ManagedCloudProjectsHttpError('Unauthorized', 401));
    const result = await listChromeProjects(
      {},
      projectsDependencies(projectsClient({ listProjects })),
    );

    expect(result).toMatchObject({ status: 'error', code: 'auth_required' });
  });

  it.each([
    [
      'a workspace policy',
      403,
      {
        error: {
          type: 'organization_policy',
          code: 'feature_disabled',
          message: 'Your workspace administrator has turned off Projects for your account.',
        },
      },
      {
        code: 'policy_blocked',
        message: 'Your workspace administrator has turned off Projects for your account.',
      },
    ],
    [
      'an incident lockdown',
      403,
      {
        error: {
          code: 'FORBIDDEN',
          message:
            'This workspace is locked down while an incident is investigated. Contact support.',
        },
      },
      {
        code: 'policy_blocked',
        message:
          'This workspace is locked down while an incident is investigated. Contact support.',
      },
    ],
    [
      'a 403 without a reason it may show',
      403,
      { error: { code: 'insufficient_scope', message: 'scope projects:read missing' } },
      { code: 'refused', message: 'Projects are not available for this account.' },
    ],
  ])(
    'shows %s by its reason code, never as a sign-in prompt',
    async (_label, status, body, expected) => {
      const fetchImpl = vi.fn(async () => Response.json(body, { status }));
      const result = await listChromeProjects(
        {},
        { getAuthToken: vi.fn(async () => 'token-1'), fetchImpl },
      );

      expect(result).toEqual({ status: 'error', ...expected });
      expect(fetchImpl).toHaveBeenCalled();
    },
  );

  it('treats a slow server as a temporary failure with its retry hint, never a sign-out', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json(
        { error: { code: 'SERVICE_UNAVAILABLE', message: 'Service temporarily unavailable' } },
        { status: 503, headers: { 'retry-after': '5' } },
      ),
    );
    const result = await listChromeProjects(
      {},
      { getAuthToken: vi.fn(async () => 'token-1'), fetchImpl },
    );

    expect(result).toEqual({
      status: 'error',
      code: 'unavailable',
      message: 'Projects are temporarily unavailable. Try again in 5 seconds.',
      retryAfterSeconds: 5,
    });
  });

  it('reports the signed-out state when no account token is held at all', async () => {
    const result = await listChromeProjects({}, projectsDependencies(projectsClient(), null));

    expect(result).toMatchObject({ status: 'error', code: 'auth_required' });
  });
});

describe('schedules section client', () => {
  it('maps the hosted schedule page into rows', async () => {
    const listSchedules = vi.fn().mockResolvedValue({
      schedules: [schedule()],
      pagination: { limit: 50, offset: 0 },
      hasMore: false,
    });
    const result = await listChromeSchedules(
      {},
      schedulesDependencies(schedulesClient({ listSchedules })),
    );

    expect(result.status).toBe('success');
    if (result.status !== 'success') throw new Error('expected a schedule list');
    expect(result.schedules).toHaveLength(1);
    expect(result.schedules[0]).toMatchObject({ name: 'Morning brief', isEnabled: true });
  });

  it('turns a 401 into the signed-out state instead of an empty list', async () => {
    const listSchedules = vi
      .fn()
      .mockRejectedValue(new ManagedCloudSchedulesHttpError('Unauthorized', 401));
    const result = await listChromeSchedules(
      {},
      schedulesDependencies(schedulesClient({ listSchedules })),
    );

    expect(result).toMatchObject({ status: 'error', code: 'auth_required' });
  });

  it('shows a plan limit as the server worded it, with the upgrade path, never a sign-in', async () => {
    const plan = 'Free plans do not include scheduled tasks. Upgrade to schedule unattended runs.';
    const fetchImpl = vi.fn(async () =>
      Response.json(
        {
          error: {
            code: 'SUBSCRIPTION_REQUIRED',
            message: plan,
            details: {
              code: 'schedules_not_in_plan',
              limit: 0,
              recovery: { action: 'upgrade', href: '/pricing' },
            },
          },
        },
        { status: 403 },
      ),
    );
    const result = await listChromeSchedules(
      {},
      { getAuthToken: vi.fn(async () => 'token-1'), fetchImpl, newIdempotencyKey: () => 'key-1' },
    );

    expect(result).toEqual({
      status: 'error',
      code: 'plan_required',
      message: plan,
      upgradePath: '/pricing',
    });
  });

  it.each([
    [
      'a workspace policy',
      403,
      {
        error: {
          type: 'organization_policy',
          code: 'surface_not_allowed',
          message:
            'Your workspace administrator does not allow access to this workspace from the Chrome extension.',
        },
      },
      {
        code: 'policy_blocked',
        message:
          'Your workspace administrator does not allow access to this workspace from the Chrome extension.',
      },
    ],
    [
      'an unreadable workspace policy',
      503,
      {
        error: {
          type: 'organization_policy',
          code: 'workspace_policy_unavailable',
          message: 'We could not confirm your workspace security settings. Try again in a moment.',
        },
      },
      {
        code: 'unavailable',
        message: 'We could not confirm your workspace security settings. Try again in a moment.',
        retryAfterSeconds: 5,
      },
    ],
    [
      'a slow account check',
      503,
      { error: { code: 'SERVICE_UNAVAILABLE', message: 'Service temporarily unavailable' } },
      {
        code: 'unavailable',
        message: 'Schedules are temporarily unavailable. Try again in 5 seconds.',
        retryAfterSeconds: 5,
      },
    ],
  ])(
    'shows %s by its reason code, never as a sign-in prompt',
    async (_label, status, body, expected) => {
      const fetchImpl = vi.fn(async () =>
        Response.json(body, { status, headers: status === 503 ? { 'retry-after': '5' } : {} }),
      );
      const result = await listChromeSchedules(
        {},
        { getAuthToken: vi.fn(async () => 'token-1'), fetchImpl, newIdempotencyKey: () => 'key-1' },
      );

      expect(result).toEqual({ status: 'error', ...expected });
    },
  );
});
