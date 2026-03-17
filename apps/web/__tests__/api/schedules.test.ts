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

// Mock environment variables
vi.mock('@/utils/env', () => ({
  requireEnv: vi.fn((key: string) => {
    if (key === 'NEXT_PUBLIC_SUPABASE_URL') return 'https://test.supabase.co';
    if (key === 'NEXT_PUBLIC_SUPABASE_ANON_KEY') return 'test-anon-key';
    if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'test-service-role-key';
    return 'test-value';
  }),
}));

// Mock cookies
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    get: vi.fn((name: string) => {
      if (name === 'sb-test-auth-token') {
        return { value: 'mock-cookie-token' };
      }
      return undefined;
    }),
    set: vi.fn(),
  }),
}));

const mockUser = {
  id: 'user-abc',
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

// Mock Supabase SSR client (cookie-based auth)
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: mockUser },
        error: null,
      }),
    },
  })),
}));

// Chainable mock for service-role Supabase client
const mockSingle = vi.fn();
const mockSelectAfterInsert = vi.fn();
const mockInsert = vi.fn();
const mockLimit = vi.fn();
const mockOrder = vi.fn();
const mockEqUserId = vi.fn();
const mockSelectAll = vi.fn();
const mockFrom = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: mockUser },
        error: null,
      }),
    },
    from: mockFrom,
  })),
}));

// Import after all mocks are registered
import { GET, POST } from '@/app/api/schedules/route';

describe('Schedules API', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default GET chain: .select('*').eq('user_id').order().limit()
    mockLimit.mockResolvedValue({ data: [mockScheduleRow], error: null });
    mockOrder.mockReturnValue({ limit: mockLimit });
    mockEqUserId.mockReturnValue({ order: mockOrder });
    mockSelectAll.mockReturnValue({ eq: mockEqUserId });

    // Default POST chain: .insert().select().single()
    mockSingle.mockResolvedValue({ data: mockScheduleRow, error: null });
    mockSelectAfterInsert.mockReturnValue({ single: mockSingle });
    mockInsert.mockReturnValue({ select: mockSelectAfterInsert });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'scheduled_tasks') {
        return {
          select: mockSelectAll,
          insert: mockInsert,
        };
      }
      return {};
    });
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
      mockLimit.mockResolvedValue({ data: [], error: null });

      const request = new NextRequest('http://localhost/api/schedules', {
        method: 'GET',
      });

      const response = await GET(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.schedules).toEqual([]);
    });

    it('should return 200 with empty array when data is null', async () => {
      mockLimit.mockResolvedValue({ data: null, error: null });

      const request = new NextRequest('http://localhost/api/schedules', {
        method: 'GET',
      });

      const response = await GET(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.schedules).toEqual([]);
    });

    it('should return 401 when user is not authenticated via cookie', async () => {
      const { createServerClient } = await import('@supabase/ssr');
      vi.mocked(createServerClient).mockReturnValueOnce({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: null },
            error: { message: 'No session' },
          }),
        },
      } as never);

      const request = new NextRequest('http://localhost/api/schedules', {
        method: 'GET',
      });

      const response = await GET(request);
      expect(response.status).toBe(401);
    });

    it('should return 401 when Bearer token is invalid', async () => {
      const { createClient } = await import('@supabase/supabase-js');
      vi.mocked(createClient).mockReturnValueOnce({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: null },
            error: { message: 'Invalid token' },
          }),
        },
        from: mockFrom,
      } as never);

      const request = new NextRequest('http://localhost/api/schedules', {
        method: 'GET',
        headers: { Authorization: 'Bearer invalid-token' },
      });

      const response = await GET(request);
      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data.error.message).toMatch(/Invalid token|[Uu]nauthorized/);
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
      mockLimit.mockResolvedValue({
        data: null,
        error: { message: 'DB error' },
      });

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
      const { createServerClient } = await import('@supabase/ssr');
      vi.mocked(createServerClient).mockReturnValueOnce({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: null },
            error: { message: 'No session' },
          }),
        },
      } as never);

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

      const insertCall = mockInsert.mock.calls[0]![0]!;
      expect(insertCall.recurrence).toBe('once');
    });

    it('should accept all valid recurrence values', async () => {
      for (const recurrence of ['once', 'daily', 'weekly', 'monthly', 'custom']) {
        vi.clearAllMocks();
        // Re-wire mocks after clearAllMocks
        mockSingle.mockResolvedValue({ data: mockScheduleRow, error: null });
        mockSelectAfterInsert.mockReturnValue({ single: mockSingle });
        mockInsert.mockReturnValue({ select: mockSelectAfterInsert });
        mockFrom.mockImplementation(() => ({ select: mockSelectAll, insert: mockInsert }));

        const request = new NextRequest('http://localhost/api/schedules', {
          method: 'POST',
          body: JSON.stringify({ ...validBody, recurrence }),
          headers: { 'Content-Type': 'application/json' },
        });

        const response = await POST(request);
        expect(response.status).toBe(201);

        const insertCall = mockInsert.mock.calls[0]![0]!;
        expect(insertCall.recurrence).toBe(recurrence);
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

      const insertCall = mockInsert.mock.calls[0]![0]!;
      expect(insertCall.model).toBe('auto-balanced');
    });

    it('should default timeOfDay to "09:00" for an invalid time format', async () => {
      const request = new NextRequest('http://localhost/api/schedules', {
        method: 'POST',
        body: JSON.stringify({ ...validBody, timeOfDay: '25:99' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(201);

      const insertCall = mockInsert.mock.calls[0]![0]!;
      expect(insertCall.time_of_day).toBe('09:00');
    });

    it('should accept valid HH:MM time formats', async () => {
      for (const timeOfDay of ['00:00', '09:30', '23:59']) {
        vi.clearAllMocks();
        mockSingle.mockResolvedValue({ data: mockScheduleRow, error: null });
        mockSelectAfterInsert.mockReturnValue({ single: mockSingle });
        mockInsert.mockReturnValue({ select: mockSelectAfterInsert });
        mockFrom.mockImplementation(() => ({ select: mockSelectAll, insert: mockInsert }));

        const request = new NextRequest('http://localhost/api/schedules', {
          method: 'POST',
          body: JSON.stringify({ ...validBody, timeOfDay }),
          headers: { 'Content-Type': 'application/json' },
        });

        const response = await POST(request);
        expect(response.status).toBe(201);

        const insertCall = mockInsert.mock.calls[0]![0]!;
        expect(insertCall.time_of_day).toBe(timeOfDay);
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

      const insertCall = mockInsert.mock.calls[0]![0]!;
      expect(insertCall.timezone).toBe('UTC');
    });

    it('should include cronExpression in insert when provided', async () => {
      const request = new NextRequest('http://localhost/api/schedules', {
        method: 'POST',
        body: JSON.stringify({ ...validBody, recurrence: 'custom', cronExpression: '0 9 * * 1' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(201);

      const insertCall = mockInsert.mock.calls[0]![0]!;
      expect(insertCall.cron_expression).toBe('0 9 * * 1');
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

      const insertCall = mockInsert.mock.calls[0]![0]!;
      expect(insertCall.scheduled_at).toBe('2024-12-25T10:00:00Z');
    });

    it('should include valid daysOfWeek (0-6) in insert', async () => {
      const request = new NextRequest('http://localhost/api/schedules', {
        method: 'POST',
        body: JSON.stringify({ ...validBody, recurrence: 'weekly', daysOfWeek: [1, 3, 5] }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(201);

      const insertCall = mockInsert.mock.calls[0]![0]!;
      expect(insertCall.days_of_week).toEqual([1, 3, 5]);
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

      const insertCall = mockInsert.mock.calls[0]![0]!;
      expect(insertCall.days_of_week).toEqual([1, 5]);
    });

    it('should omit days_of_week from insert when all values are invalid', async () => {
      const request = new NextRequest('http://localhost/api/schedules', {
        method: 'POST',
        body: JSON.stringify({ ...validBody, daysOfWeek: [7, -1, 'monday'] }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(201);

      const insertCall = mockInsert.mock.calls[0]![0]!;
      expect(insertCall.days_of_week).toBeUndefined();
    });

    it('should include valid dayOfMonth (1-31) in insert', async () => {
      const request = new NextRequest('http://localhost/api/schedules', {
        method: 'POST',
        body: JSON.stringify({ ...validBody, recurrence: 'monthly', dayOfMonth: 15 }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(201);

      const insertCall = mockInsert.mock.calls[0]![0]!;
      expect(insertCall.day_of_month).toBe(15);
    });

    it('should omit day_of_month from insert when value is out of range', async () => {
      const request = new NextRequest('http://localhost/api/schedules', {
        method: 'POST',
        body: JSON.stringify({ ...validBody, dayOfMonth: 32 }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(201);

      const insertCall = mockInsert.mock.calls[0]![0]!;
      expect(insertCall.day_of_month).toBeUndefined();
    });

    it('should default isActive to true when not provided', async () => {
      const request = new NextRequest('http://localhost/api/schedules', {
        method: 'POST',
        body: JSON.stringify(validBody),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(201);

      const insertCall = mockInsert.mock.calls[0]![0]!;
      expect(insertCall.is_active).toBe(true);
    });

    it('should set isActive to false when explicitly provided as false', async () => {
      const request = new NextRequest('http://localhost/api/schedules', {
        method: 'POST',
        body: JSON.stringify({ ...validBody, isActive: false }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(201);

      const insertCall = mockInsert.mock.calls[0]![0]!;
      expect(insertCall.is_active).toBe(false);
    });

    it('should return 500 when database insert fails', async () => {
      mockSingle.mockResolvedValue({
        data: null,
        error: { message: 'Insert failed' },
      });

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

      const insertCall = mockInsert.mock.calls[0]![0]!;
      expect(insertCall.name).toBe('Padded Name');
      expect(insertCall.prompt).toBe('Padded Prompt');
    });
  });
});
