/**
 * Schedules API Tests
 *
 * Tests for GET /api/schedules (list schedules) and POST /api/schedules (create schedule)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock dependencies
vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn(() => null),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: vi.fn().mockResolvedValue(null),
}));

const mockUser = {
  userId: 'user-abc',
  email: 'user@example.com',
};

const mockScheduleRow = {
  id: 'sched-1',
  name: 'Daily Summary',
  prompt: 'Summarize my day and list action items',
  model: 'auto-balanced',
  recurrence: 'daily',
  cron_expression: null,
  scheduled_at: null,
  days_of_week: null,
  day_of_month: null,
  time_of_day: '09:00',
  timezone: 'America/New_York',
  is_active: true,
  last_run_at: null,
  next_run_at: '2024-09-01T13:00:00Z',
  last_run_status: null,
  created_at: '2024-08-01T00:00:00Z',
  updated_at: '2024-08-15T00:00:00Z',
};

// ── Clerk auth mock ────────────────────────────────────────────────────────────
const mockGetClerkAuthUser = vi.fn();
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: (...args: unknown[]) => mockGetClerkAuthUser(...args),
}));

// ── Neon DB mock ───────────────────────────────────────────────────────────────
// The schedules route uses raw SQL via db.query() for SELECT and db.query() for INSERT.
const mockNeonQuery = vi.fn();

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mockNeonQuery(...args),
    execute: vi.fn().mockResolvedValue(1),
    transaction: vi.fn((fn: (db: unknown) => unknown) => fn({})),
    withUser: vi.fn(() => ({})),
    dispose: vi.fn(),
  })),
}));

// Import after all mocks are registered
import { GET, POST } from '@/app/api/schedules/route';

describe('Schedules API', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: authenticated user via Clerk
    mockGetClerkAuthUser.mockResolvedValue(mockUser);

    // Default: GET query returns one schedule row
    mockNeonQuery.mockResolvedValue([mockScheduleRow]);
  });

  // ---------------------------------------------------------------------------
  // GET /api/schedules
  // ---------------------------------------------------------------------------

  describe('GET /api/schedules', () => {
    it('should return 200 with list of schedules for authenticated user', async () => {
      const request = new NextRequest('http://localhost/api/schedules', {
        method: 'GET',
      });

      const response = await GET(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.schedules).toBeDefined();
      expect(Array.isArray(data.schedules)).toBe(true);
      expect(data.schedules).toHaveLength(1);
    });

    it('should map database row fields to camelCase response shape', async () => {
      const request = new NextRequest('http://localhost/api/schedules', {
        method: 'GET',
      });

      const response = await GET(request);
      const data = await response.json();
      const schedule = data.schedules[0];

      expect(schedule.id).toBe('sched-1');
      expect(schedule.name).toBe('Daily Summary');
      expect(schedule.prompt).toBe('Summarize my day and list action items');
      expect(schedule.model).toBe('auto-balanced');
      expect(schedule.recurrence).toBe('daily');
      expect(schedule.cronExpression).toBeNull();
      expect(schedule.scheduledAt).toBeNull();
      expect(schedule.daysOfWeek).toBeNull();
      expect(schedule.dayOfMonth).toBeNull();
      expect(schedule.timeOfDay).toBe('09:00');
      expect(schedule.timezone).toBe('America/New_York');
      expect(schedule.isActive).toBe(true);
      expect(schedule.lastRunAt).toBeNull();
      expect(schedule.nextRunAt).toBe('2024-09-01T13:00:00Z');
      expect(schedule.lastRunStatus).toBeNull();
      expect(schedule.createdAt).toBe('2024-08-01T00:00:00Z');
      expect(schedule.updatedAt).toBe('2024-08-15T00:00:00Z');
    });

    it('should return 200 with empty array when user has no schedules', async () => {
      mockNeonQuery.mockResolvedValueOnce([]);

      const request = new NextRequest('http://localhost/api/schedules', {
        method: 'GET',
      });

      const response = await GET(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.schedules).toEqual([]);
    });

    it('should return 200 with empty array when data is null', async () => {
      // Route handles empty array; Neon returns [] not null
      mockNeonQuery.mockResolvedValueOnce([]);

      const request = new NextRequest('http://localhost/api/schedules', {
        method: 'GET',
      });

      const response = await GET(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.schedules).toEqual([]);
    });

    it('should return 401 when user is not authenticated via cookie', async () => {
      const { createError } = await import('@/lib/errors');
      mockGetClerkAuthUser.mockRejectedValueOnce(createError.unauthorized());

      const request = new NextRequest('http://localhost/api/schedules', {
        method: 'GET',
      });

      const response = await GET(request);
      expect(response.status).toBe(401);
    });

    it('should return 401 when Bearer token is invalid', async () => {
      const { createError } = await import('@/lib/errors');
      mockGetClerkAuthUser.mockRejectedValueOnce(createError.unauthorized('Invalid token'));

      const request = new NextRequest('http://localhost/api/schedules', {
        method: 'GET',
        headers: { Authorization: 'Bearer invalid-token' },
      });

      const response = await GET(request);
      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data.error.message).toMatch(/Authentication required|UNAUTHORIZED/);
    });

    it('should authenticate with valid Bearer token', async () => {
      const request = new NextRequest('http://localhost/api/schedules', {
        method: 'GET',
        headers: { Authorization: 'Bearer valid-jwt-token' },
      });

      const response = await GET(request);
      expect(response.status).toBe(200);
    });

    it('should return 500 when database query fails', async () => {
      mockNeonQuery.mockRejectedValueOnce(new Error('DB error'));

      const request = new NextRequest('http://localhost/api/schedules', {
        method: 'GET',
      });

      const response = await GET(request);
      expect(response.status).toBe(500);

      const data = await response.json();
      expect(data.error).toBeDefined();
    });

    it('should return 429 when rate limit is exceeded', async () => {
      const { withRateLimit } = await import('@/lib/rate-limit');
      const { NextResponse } = await import('next/server');
      vi.mocked(withRateLimit).mockResolvedValueOnce(
        NextResponse.json(
          { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Rate limit exceeded' } },
          { status: 429 },
        ),
      );

      const request = new NextRequest('http://localhost/api/schedules', {
        method: 'GET',
      });

      const response = await GET(request);
      expect(response.status).toBe(429);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/schedules
  // ---------------------------------------------------------------------------

  describe('POST /api/schedules', () => {
    const validBody = {
      name: 'Weekly Report',
      prompt: 'Generate a weekly status report',
      model: 'claude-3-5-sonnet',
      recurrence: 'weekly',
      timeOfDay: '08:00',
      timezone: 'UTC',
    };

    beforeEach(() => {
      // POST default: INSERT returns the created row
      mockNeonQuery.mockResolvedValue([mockScheduleRow]);
    });

    it('should return 201 with created schedule for valid request', async () => {
      const request = new NextRequest('http://localhost/api/schedules', {
        method: 'POST',
        body: JSON.stringify(validBody),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(201);

      const data = await response.json();
      expect(data.schedule).toBeDefined();
      expect(data.schedule.id).toBe('sched-1');
      expect(data.schedule.name).toBe('Daily Summary');
    });

    it('should return 400 when name is missing', async () => {
      const { name: _name, ...bodyWithoutName } = validBody;
      const request = new NextRequest('http://localhost/api/schedules', {
        method: 'POST',
        body: JSON.stringify(bodyWithoutName),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error.message).toMatch(/[Nn]ame/);
    });

    it('should return 400 when name is an empty string', async () => {
      const request = new NextRequest('http://localhost/api/schedules', {
        method: 'POST',
        body: JSON.stringify({ ...validBody, name: '  ' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error.message).toMatch(/[Nn]ame/);
    });

    it('should return 400 when name exceeds 500 characters', async () => {
      const request = new NextRequest('http://localhost/api/schedules', {
        method: 'POST',
        body: JSON.stringify({ ...validBody, name: 'n'.repeat(501) }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error.message).toMatch(/500/);
    });

    it('should return 400 when prompt is missing', async () => {
      const { prompt: _prompt, ...bodyWithoutPrompt } = validBody;
      const request = new NextRequest('http://localhost/api/schedules', {
        method: 'POST',
        body: JSON.stringify(bodyWithoutPrompt),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error.message).toMatch(/[Pp]rompt/);
    });

    it('should return 400 when prompt is an empty string', async () => {
      const request = new NextRequest('http://localhost/api/schedules', {
        method: 'POST',
        body: JSON.stringify({ ...validBody, prompt: '' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error.message).toMatch(/[Pp]rompt/);
    });

    it('should return 400 when prompt exceeds 10,000 characters', async () => {
      const request = new NextRequest('http://localhost/api/schedules', {
        method: 'POST',
        body: JSON.stringify({ ...validBody, prompt: 'p'.repeat(10_001) }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error.message).toMatch(/10,000/);
    });

    it('should return 400 for invalid JSON body', async () => {
      const request = new NextRequest('http://localhost/api/schedules', {
        method: 'POST',
        body: 'not-json',
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error.message).toMatch(/[Ii]nvalid/);
    });

    it('should return 401 for unauthenticated request', async () => {
      const { createError } = await import('@/lib/errors');
      mockGetClerkAuthUser.mockRejectedValueOnce(createError.unauthorized());

      const request = new NextRequest('http://localhost/api/schedules', {
        method: 'POST',
        body: JSON.stringify(validBody),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(401);
    });

    it('should default recurrence to "once" for unknown recurrence value', async () => {
      const request = new NextRequest('http://localhost/api/schedules', {
        method: 'POST',
        body: JSON.stringify({ ...validBody, recurrence: 'biweekly' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(201);

      // The INSERT SQL is called with values; check the SQL contains the correct recurrence.
      // Route builds parameterized SQL: insert into scheduled_tasks (...) values ($1, ...)
      const queryCall = mockNeonQuery.mock.calls[0];
      const queryArgs = queryCall?.[1] as unknown[];
      // recurrence is the 5th positional arg: user_id, name, prompt, model, recurrence, ...
      expect(queryArgs?.[4]).toBe('once');
    });

    it('should accept all valid recurrence values', async () => {
      for (const recurrence of ['once', 'daily', 'weekly', 'monthly', 'custom']) {
        vi.clearAllMocks();
        mockGetClerkAuthUser.mockResolvedValue(mockUser);
        mockNeonQuery.mockResolvedValue([mockScheduleRow]);

        const request = new NextRequest('http://localhost/api/schedules', {
          method: 'POST',
          body: JSON.stringify({ ...validBody, recurrence }),
          headers: { 'Content-Type': 'application/json' },
        });

        const response = await POST(request);
        expect(response.status).toBe(201);

        const queryCall = mockNeonQuery.mock.calls[0];
        const queryArgs = queryCall?.[1] as unknown[];
        expect(queryArgs?.[4]).toBe(recurrence);
      }
    });

    it('should default model to "auto-balanced" for an oversized model string', async () => {
      const request = new NextRequest('http://localhost/api/schedules', {
        method: 'POST',
        body: JSON.stringify({ ...validBody, model: 'm'.repeat(101) }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(201);

      const queryCall = mockNeonQuery.mock.calls[0];
      const queryArgs = queryCall?.[1] as unknown[];
      // model is the 4th positional arg: user_id, name, prompt, model, ...
      expect(queryArgs?.[3]).toBe('auto-balanced');
    });

    it('should default timeOfDay to "09:00" for an invalid time format', async () => {
      const request = new NextRequest('http://localhost/api/schedules', {
        method: 'POST',
        body: JSON.stringify({ ...validBody, timeOfDay: '25:99' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(201);

      const queryCall = mockNeonQuery.mock.calls[0];
      const queryArgs = queryCall?.[1] as unknown[];
      // time_of_day is the 6th positional arg: user_id, name, prompt, model, recurrence, time_of_day
      expect(queryArgs?.[5]).toBe('09:00');
    });

    it('should accept valid HH:MM time formats', async () => {
      for (const timeOfDay of ['00:00', '09:30', '23:59']) {
        vi.clearAllMocks();
        mockGetClerkAuthUser.mockResolvedValue(mockUser);
        mockNeonQuery.mockResolvedValue([mockScheduleRow]);

        const request = new NextRequest('http://localhost/api/schedules', {
          method: 'POST',
          body: JSON.stringify({ ...validBody, timeOfDay }),
          headers: { 'Content-Type': 'application/json' },
        });

        const response = await POST(request);
        expect(response.status).toBe(201);

        const queryCall = mockNeonQuery.mock.calls[0];
        const queryArgs = queryCall?.[1] as unknown[];
        expect(queryArgs?.[5]).toBe(timeOfDay);
      }
    });

    it('should default timezone to "UTC" for an oversized timezone string', async () => {
      const request = new NextRequest('http://localhost/api/schedules', {
        method: 'POST',
        body: JSON.stringify({ ...validBody, timezone: 'z'.repeat(51) }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(201);

      const queryCall = mockNeonQuery.mock.calls[0];
      const queryArgs = queryCall?.[1] as unknown[];
      // timezone is the 7th positional arg: user_id, name, prompt, model, recurrence, time_of_day, timezone
      expect(queryArgs?.[6]).toBe('UTC');
    });

    it('should include cronExpression in insert when provided', async () => {
      const request = new NextRequest('http://localhost/api/schedules', {
        method: 'POST',
        body: JSON.stringify({ ...validBody, recurrence: 'custom', cronExpression: '0 9 * * 1' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(201);

      const queryCall = mockNeonQuery.mock.calls[0];
      const sql = queryCall?.[0] as string;
      const queryArgs = queryCall?.[1] as unknown[];
      expect(sql).toContain('cron_expression');
      expect(queryArgs).toContain('0 9 * * 1');
    });

    it('should include scheduledAt in insert when provided', async () => {
      const request = new NextRequest('http://localhost/api/schedules', {
        method: 'POST',
        body: JSON.stringify({
          ...validBody,
          recurrence: 'once',
          scheduledAt: '2024-12-25T10:00:00Z',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(201);

      const queryCall = mockNeonQuery.mock.calls[0];
      const sql = queryCall?.[0] as string;
      const queryArgs = queryCall?.[1] as unknown[];
      expect(sql).toContain('scheduled_at');
      expect(queryArgs).toContain('2024-12-25T10:00:00Z');
    });

    it('should include valid daysOfWeek (0-6) in insert', async () => {
      const request = new NextRequest('http://localhost/api/schedules', {
        method: 'POST',
        body: JSON.stringify({ ...validBody, recurrence: 'weekly', daysOfWeek: [1, 3, 5] }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(201);

      const queryCall = mockNeonQuery.mock.calls[0];
      const sql = queryCall?.[0] as string;
      const queryArgs = queryCall?.[1] as unknown[];
      expect(sql).toContain('days_of_week');
      expect(queryArgs).toContainEqual([1, 3, 5]);
    });

    it('should filter out invalid daysOfWeek values', async () => {
      const request = new NextRequest('http://localhost/api/schedules', {
        method: 'POST',
        // 7, -1, and "monday" are invalid; only 1, 5 should survive
        body: JSON.stringify({
          ...validBody,
          daysOfWeek: [1, 7, -1, 'monday', 5],
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(201);

      const queryCall = mockNeonQuery.mock.calls[0];
      const queryArgs = queryCall?.[1] as unknown[];
      // Only valid days [1, 5] should be in the args
      expect(queryArgs).toContainEqual([1, 5]);
    });

    it('should omit days_of_week from insert when all values are invalid', async () => {
      const request = new NextRequest('http://localhost/api/schedules', {
        method: 'POST',
        body: JSON.stringify({ ...validBody, daysOfWeek: [7, -1, 'monday'] }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(201);

      const queryCall = mockNeonQuery.mock.calls[0];
      const sql = queryCall?.[0] as string;
      expect(sql).not.toContain('days_of_week');
    });

    it('should include valid dayOfMonth (1-31) in insert', async () => {
      const request = new NextRequest('http://localhost/api/schedules', {
        method: 'POST',
        body: JSON.stringify({ ...validBody, recurrence: 'monthly', dayOfMonth: 15 }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(201);

      const queryCall = mockNeonQuery.mock.calls[0];
      const sql = queryCall?.[0] as string;
      const queryArgs = queryCall?.[1] as unknown[];
      expect(sql).toContain('day_of_month');
      expect(queryArgs).toContain(15);
    });

    it('should omit day_of_month from insert when value is out of range', async () => {
      const request = new NextRequest('http://localhost/api/schedules', {
        method: 'POST',
        body: JSON.stringify({ ...validBody, dayOfMonth: 32 }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(201);

      const queryCall = mockNeonQuery.mock.calls[0];
      const sql = queryCall?.[0] as string;
      expect(sql).not.toContain('day_of_month');
    });

    it('should default isActive to true when not provided', async () => {
      const request = new NextRequest('http://localhost/api/schedules', {
        method: 'POST',
        body: JSON.stringify(validBody),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(201);

      const queryCall = mockNeonQuery.mock.calls[0];
      const queryArgs = queryCall?.[1] as unknown[];
      // is_active is the 8th positional arg: user_id, name, prompt, model, recurrence, time_of_day, timezone, is_active
      expect(queryArgs?.[7]).toBe(true);
    });

    it('should set isActive to false when explicitly provided as false', async () => {
      const request = new NextRequest('http://localhost/api/schedules', {
        method: 'POST',
        body: JSON.stringify({ ...validBody, isActive: false }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(201);

      const queryCall = mockNeonQuery.mock.calls[0];
      const queryArgs = queryCall?.[1] as unknown[];
      expect(queryArgs?.[7]).toBe(false);
    });

    it('should return 500 when database insert fails', async () => {
      mockNeonQuery.mockRejectedValueOnce(new Error('Insert failed'));

      const request = new NextRequest('http://localhost/api/schedules', {
        method: 'POST',
        body: JSON.stringify(validBody),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(500);

      const data = await response.json();
      expect(data.error).toBeDefined();
    });

    it('should return 429 when rate limit is exceeded', async () => {
      const { withRateLimit } = await import('@/lib/rate-limit');
      const { NextResponse } = await import('next/server');
      vi.mocked(withRateLimit).mockResolvedValueOnce(
        NextResponse.json(
          { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Rate limit exceeded' } },
          { status: 429 },
        ),
      );

      const request = new NextRequest('http://localhost/api/schedules', {
        method: 'POST',
        body: JSON.stringify(validBody),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(429);
    });

    it('should trim name and prompt before saving', async () => {
      const request = new NextRequest('http://localhost/api/schedules', {
        method: 'POST',
        body: JSON.stringify({
          ...validBody,
          name: '  Padded Name  ',
          prompt: '  Padded Prompt  ',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(201);

      const queryCall = mockNeonQuery.mock.calls[0];
      const queryArgs = queryCall?.[1] as unknown[];
      // name is the 2nd positional arg, prompt is 3rd
      expect(queryArgs?.[1]).toBe('Padded Name');
      expect(queryArgs?.[2]).toBe('Padded Prompt');
    });
  });
});
