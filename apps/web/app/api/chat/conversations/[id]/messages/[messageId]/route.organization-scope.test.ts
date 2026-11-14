import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { AGI_WORK_MODE } from '@agiworkforce/types';
import { UPDATE_WORK_PLAN_REVIEW_SQL } from '../lib/work-plan-review';

const ORGANIZATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const MESSAGE_ID = '22222222-2222-4222-8222-222222222222';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: { query: mocks.query, execute: mocks.execute },
    userId: 'user-1',
    organizationId: ORGANIZATION_ID,
  })),
}));
vi.mock('@/lib/services/active-workspace-service', () => ({
  resolveActiveOrganizationId: vi.fn(async () => ORGANIZATION_ID),
  resolveOrganizationMembershipId: vi.fn(),
}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/cors', () => ({
  withCorsRoute: <T>(handler: T) => handler,
  handleCorsPreflightRequest: vi.fn(() => null),
}));

const { PATCH, DELETE } = await import('./route');
const context = {
  params: Promise.resolve({ id: CONVERSATION_ID, messageId: MESSAGE_ID }),
};

describe('message operations require an active-workspace parent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockResolvedValue([]);
  });

  it.each([
    ['PATCH', PATCH],
    ['DELETE', DELETE],
  ] as const)(
    '%s rejects a conversation outside the active organization',
    async (method, route) => {
      const request = new NextRequest(
        `https://agiworkforce.com/api/chat/conversations/${CONVERSATION_ID}/messages/${MESSAGE_ID}`,
        {
          method,
          ...(method === 'PATCH' ? { body: JSON.stringify({ reaction: 'thumbsUp' }) } : {}),
        },
      );

      const response = await route(request, context);

      expect(response.status).toBe(404);
      expect(mocks.query).toHaveBeenCalledOnce();
      expect(mocks.query).toHaveBeenCalledWith(
        expect.stringMatching(/user_id = \$2[\s\S]*organization_id is not distinct from \$3/),
        [CONVERSATION_ID, 'user-1', ORGANIZATION_ID],
      );
      expect(mocks.execute).not.toHaveBeenCalled();
    },
  );

  const plan = {
    reviewId: '33333333-3333-5333-8333-333333333333',
    planningMessageId: MESSAGE_ID,
    conversationId: CONVERSATION_ID,
    runId: '44444444-4444-4444-8444-444444444444',
    model: 'fixture-work-model',
    mode: AGI_WORK_MODE,
    goal: { goal: 'Prepare a report' },
    steps: [{ id: 'first', description: 'Read supplied information', status: 'pending' }],
    awaitingApproval: true,
    declined: false,
  };
  function reviewRequest(workPlanReview = plan, expectedWorkPlanReview: typeof plan | null = null) {
    return new NextRequest(
      `https://agiworkforce.com/api/chat/conversations/${CONVERSATION_ID}/messages/${MESSAGE_ID}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ workPlanReview, expectedWorkPlanReview }),
      },
    );
  }

  it('saves a plan decision by comparing its prior metadata without writing content or changing the active leaf', async () => {
    mocks.query
      .mockResolvedValueOnce([{ id: CONVERSATION_ID }])
      .mockResolvedValueOnce([{ id: MESSAGE_ID, review: plan }]);
    const response = await PATCH(reviewRequest(), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: MESSAGE_ID, review: plan });
    const [sql, params] = mocks.query.mock.calls.at(-1)!;
    expect(sql).toBe(UPDATE_WORK_PLAN_REVIEW_SQL);
    expect(JSON.parse(params[0])).toEqual({
      agiWorkPlan: plan.steps,
      agiWorkPlanReview: plan,
      agiWorkPlanDeclined: false,
    });
    expect(params.slice(1)).toEqual([MESSAGE_ID, CONVERSATION_ID, 'null']);
    expect(UPDATE_WORK_PLAN_REVIEW_SQL).toMatch(
      /metadata = coalesce\(metadata, '\{\}'::jsonb\) \|\|/,
    );
    expect(UPDATE_WORK_PLAN_REVIEW_SQL).toMatch(/role = 'assistant' and deleted_at is null/);
    expect(UPDATE_WORK_PLAN_REVIEW_SQL).not.toMatch(/set content|active_leaf|parent_id/);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('refuses a stale decision when the atomic metadata comparison does not match', async () => {
    mocks.query.mockResolvedValueOnce([{ id: CONVERSATION_ID }]).mockResolvedValueOnce([]);
    const response = await PATCH(
      reviewRequest({ ...plan, awaitingApproval: false }, plan),
      context,
    );
    expect(response.status).toBe(409);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it.each([
    { ...plan, conversationId: '55555555-5555-4555-8555-555555555555' },
    { ...plan, steps: [{ ...plan.steps[0]!, description: 'Different work' }] },
    { ...plan, declined: true },
  ])(
    'refuses changed identity, instructions or contradictory decisions before writing',
    async (changed) => {
      mocks.query.mockResolvedValueOnce([{ id: CONVERSATION_ID }]);
      const response = await PATCH(reviewRequest(changed, plan), context);
      expect(response.status).toBe(409);
      expect(mocks.query).toHaveBeenCalledOnce();
    },
  );
});
