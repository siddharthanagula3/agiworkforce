/**
 * @vitest-environment jsdom
 *
 * The data and routing boundary for the side panel's Projects, Schedules and
 * Artifacts drawers: each client turns one hosted response into the rows the
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
import {
  listChromeArtifacts,
  type ChromeArtifactsDependencies,
} from '../src/features/cloud-bridge/artifactsClient';

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

function artifactsDependencies(
  response: Response,
  token: string | null = 'token-1',
): Partial<ChromeArtifactsDependencies> {
  return {
    getAuthToken: vi.fn(async () => token),
    fetchImpl: vi.fn(async () => response),
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
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
});

describe('artifacts drawer client', () => {
  it('maps the hosted artifact index into rows and drops rows it cannot identify', async () => {
    const response = jsonResponse({
      artifacts: [
        {
          id: 'artifact-1',
          conversationId: 'conversation-1',
          messageId: 'message-1',
          title: 'Pricing table',
          type: 'code',
          language: 'tsx',
          projectId: null,
          createdAt: '2026-09-12T00:00:00.000Z',
        },
        { id: 'artifact-2' },
      ],
    });
    const result = await listChromeArtifacts({}, artifactsDependencies(response));

    expect(result.status).toBe('success');
    if (result.status !== 'success') throw new Error('expected an artifact list');
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0]).toMatchObject({
      id: 'artifact-1',
      conversationId: 'conversation-1',
      messageId: 'message-1',
      title: 'Pricing table',
      language: 'tsx',
    });
  });

  it('turns a 401 into the signed-out state instead of an empty list', async () => {
    const result = await listChromeArtifacts(
      {},
      artifactsDependencies(jsonResponse({ error: 'Unauthorized' }, 401)),
    );

    expect(result).toMatchObject({ status: 'error', code: 'auth_required' });
  });
});
