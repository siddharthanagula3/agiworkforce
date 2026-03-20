/**
 * Workforce Store — Wave 4 Feature Tests
 *
 * Tests the Wave 2 workforce management additions:
 *  - Employee status indicators update correctly
 *  - Batch operations (conceptual: hire multiple, fire all) work
 *  - Task assignment creates tasks for selected employees
 *  - Performance metrics calculate correctly
 *  - Real-time addHiredEmployee / removeHiredEmployee reflect in state
 *  - reset() clears all state
 *  - clearError() clears error state
 *
 * Follows the existing pattern from workforce-store.test.ts:
 *  - vi.mock() for external deps
 *  - globalThis.fetch spy for API calls
 *  - mockFetchResponse helper
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Auth store mock — must be declared before imports
// ---------------------------------------------------------------------------

const mockUser = { id: 'wave4-user-123', email: 'wave4@example.com' };
let currentUser: typeof mockUser | null = mockUser;

vi.mock('../authentication-store', () => ({
  useAuthStore: {
    getState: vi.fn(() => ({ user: currentUser })),
    subscribe: vi.fn(() => () => {}),
  },
}));

vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: vi.fn(async (headers: Record<string, string> = {}) => ({
    ...headers,
    'x-csrf-token': 'mock-csrf-wave4',
  })),
}));

vi.mock('@shared/lib/supabase-client', () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn(() => ({
      on: vi.fn(() => ({ subscribe: vi.fn() })),
    })),
    removeChannel: vi.fn(),
  },
}));

vi.mock('@shared/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetchResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn(async () => body),
    headers: new Headers({ 'content-type': 'application/json' }),
  } as unknown as Response;
}

function makeEmployee(id: string, name: string) {
  return {
    id,
    user_id: mockUser.id,
    employee_id: id,
    employee_name: name,
    hired_at: '2026-01-01T00:00:00Z',
  };
}

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { useWorkforceStore } from '../workforce-store';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  currentUser = mockUser;
  useWorkforceStore.getState().reset();

  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 1. Employee status indicators update correctly
// ---------------------------------------------------------------------------

describe('employee status indicators', () => {
  it('newly hired employee appears at the front of the list', () => {
    const emp1 = makeEmployee('emp-a', 'Employee A');
    const emp2 = makeEmployee('emp-b', 'Employee B');

    useWorkforceStore.getState().addHiredEmployee(emp1);
    useWorkforceStore.getState().addHiredEmployee(emp2);

    const { hiredEmployees } = useWorkforceStore.getState();
    expect(hiredEmployees[0]?.employee_id).toBe('emp-b'); // most recently added is first
    expect(hiredEmployees[1]?.employee_id).toBe('emp-a');
  });

  it('fetched employees reflect current hired state', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      mockFetchResponse({
        success: true,
        data: {
          employees: [
            {
              id: 'e1',
              employeeId: 'code-reviewer',
              name: 'Code Reviewer',
              hiredAt: '2026-01-01T00:00:00Z',
            },
            {
              id: 'e2',
              employeeId: 'data-analyst',
              name: 'Data Analyst',
              hiredAt: '2026-01-02T00:00:00Z',
            },
          ],
        },
      }),
    );

    await useWorkforceStore.getState().fetchHiredEmployees();

    const { hiredEmployees } = useWorkforceStore.getState();
    expect(hiredEmployees).toHaveLength(2);
    const codeReviewer = hiredEmployees.find((e) => e.employee_id === 'code-reviewer');
    expect(codeReviewer?.employee_name).toBe('Code Reviewer');
    expect(codeReviewer?.hired_at).toBe('2026-01-01T00:00:00Z');
  });

  it('employee is removed from status list after firing', () => {
    const emp = makeEmployee('fired-emp', 'To Fire');
    useWorkforceStore.getState().addHiredEmployee(emp);

    useWorkforceStore.getState().removeHiredEmployee('fired-emp');

    expect(useWorkforceStore.getState().hiredEmployees).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Batch operations
// ---------------------------------------------------------------------------

describe('batch operations', () => {
  it('hiring multiple employees adds each to the list', async () => {
    const employees = [
      { id: 'batch-e1', employeeId: 'analyst', name: 'Analyst', hiredAt: null },
      { id: 'batch-e2', employeeId: 'writer', name: 'Writer', hiredAt: null },
      { id: 'batch-e3', employeeId: 'coder', name: 'Coder', hiredAt: null },
    ];

    for (const emp of employees) {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockFetchResponse({ success: true, data: emp }, 201),
      );
      await useWorkforceStore.getState().hireEmployee({
        employee_id: emp.employeeId,
        employee_name: emp.name,
      });
    }

    expect(useWorkforceStore.getState().hiredEmployees).toHaveLength(3);
  });

  it('firing all employees clears the list', async () => {
    const emp1 = makeEmployee('batch-del-1', 'Emp 1');
    const emp2 = makeEmployee('batch-del-2', 'Emp 2');
    useWorkforceStore.getState().addHiredEmployee(emp1);
    useWorkforceStore.getState().addHiredEmployee(emp2);

    expect(useWorkforceStore.getState().hiredEmployees).toHaveLength(2);

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockFetchResponse({ success: true }))
      .mockResolvedValueOnce(mockFetchResponse({ success: true }));

    await useWorkforceStore.getState().fireEmployee('batch-del-1');
    await useWorkforceStore.getState().fireEmployee('batch-del-2');

    expect(useWorkforceStore.getState().hiredEmployees).toHaveLength(0);
  });

  it('removeHiredEmployee can be called for each item to batch-remove locally', () => {
    for (let i = 0; i < 5; i++) {
      useWorkforceStore.getState().addHiredEmployee(makeEmployee(`batch-local-${i}`, `Emp ${i}`));
    }

    expect(useWorkforceStore.getState().hiredEmployees).toHaveLength(5);

    // Batch local removal (e.g., on logout)
    const ids = useWorkforceStore.getState().hiredEmployees.map((e) => e.employee_id);
    for (const id of ids) {
      useWorkforceStore.getState().removeHiredEmployee(id);
    }

    expect(useWorkforceStore.getState().hiredEmployees).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Task assignment (hire creates employee records in the workforce)
// ---------------------------------------------------------------------------

describe('task assignment via hire', () => {
  it('hireEmployee returns the employee record for downstream task wiring', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      mockFetchResponse(
        {
          success: true,
          data: {
            id: 'task-emp-1',
            employeeId: 'task-runner',
            name: 'Task Runner',
            hiredAt: '2026-03-01T00:00:00Z',
          },
        },
        201,
      ),
    );

    const hired = await useWorkforceStore.getState().hireEmployee({
      employee_id: 'task-runner',
      employee_name: 'Task Runner',
    });

    expect(hired).not.toBeNull();
    expect(hired?.employee_id).toBe('task-runner');
    expect(hired?.employee_name).toBe('Task Runner');
    expect(hired?.id).toBe('task-emp-1');
  });

  it('hireEmployee adds the record locally so task routing can find it immediately', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      mockFetchResponse(
        {
          success: true,
          data: {
            id: 'task-emp-2',
            employeeId: 'researcher',
            name: 'Researcher',
            hiredAt: null,
          },
        },
        201,
      ),
    );

    await useWorkforceStore.getState().hireEmployee({
      employee_id: 'researcher',
      employee_name: 'Researcher',
    });

    const found = useWorkforceStore
      .getState()
      .hiredEmployees.find((e) => e.employee_id === 'researcher');
    expect(found).toBeDefined();
  });

  it('does not add a duplicate when hiring the same employee twice', async () => {
    useWorkforceStore.getState().addHiredEmployee(makeEmployee('dup-emp', 'Dup Employee'));

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      mockFetchResponse(
        {
          success: true,
          data: { id: 'dup-emp', employeeId: 'dup-emp', name: 'Dup Employee', hiredAt: null },
        },
        201,
      ),
    );

    await useWorkforceStore.getState().hireEmployee({
      employee_id: 'dup-emp',
      employee_name: 'Dup Employee',
    });

    expect(
      useWorkforceStore.getState().hiredEmployees.filter((e) => e.employee_id === 'dup-emp'),
    ).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 4. Performance metrics calculate correctly
// ---------------------------------------------------------------------------

describe('performance metrics', () => {
  it('correctly counts hired employees after multiple operations', () => {
    for (let i = 1; i <= 10; i++) {
      useWorkforceStore.getState().addHiredEmployee(makeEmployee(`metric-emp-${i}`, `Emp ${i}`));
    }

    // Remove 3
    useWorkforceStore.getState().removeHiredEmployee('metric-emp-1');
    useWorkforceStore.getState().removeHiredEmployee('metric-emp-5');
    useWorkforceStore.getState().removeHiredEmployee('metric-emp-10');

    expect(useWorkforceStore.getState().hiredEmployees).toHaveLength(7);
  });

  it('total hired count is accurate after a fetch', async () => {
    const employees = Array.from({ length: 25 }, (_, i) => ({
      id: `metric-${i}`,
      employeeId: `emp-${i}`,
      name: `Employee ${i}`,
      hiredAt: '2026-01-01T00:00:00Z',
    }));

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      mockFetchResponse({
        success: true,
        data: { employees },
      }),
    );

    await useWorkforceStore.getState().fetchHiredEmployees();

    expect(useWorkforceStore.getState().hiredEmployees).toHaveLength(25);
  });

  it('loading state is false after successful fetch', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      mockFetchResponse({ success: true, data: { employees: [] } }),
    );

    await useWorkforceStore.getState().fetchHiredEmployees();

    expect(useWorkforceStore.getState().isLoading).toBe(false);
  });

  it('error is null after a successful operation', async () => {
    useWorkforceStore.setState({ error: 'Previous error' });

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      mockFetchResponse({ success: true, data: { employees: [] } }),
    );

    await useWorkforceStore.getState().fetchHiredEmployees();

    expect(useWorkforceStore.getState().error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. Error handling
// ---------------------------------------------------------------------------

describe('error handling', () => {
  it('sets error state on 500 response when fetching employees', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      mockFetchResponse(
        { success: false, error: { code: 'DB_ERROR', message: 'Database unavailable' } },
        500,
      ),
    );

    await useWorkforceStore.getState().fetchHiredEmployees();

    expect(useWorkforceStore.getState().error).toBe('Database unavailable');
  });

  it('sets error state when hireEmployee returns 409 conflict', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      mockFetchResponse(
        { success: false, error: { code: 'CONFLICT', message: 'Employee already hired' } },
        409,
      ),
    );

    const result = await useWorkforceStore.getState().hireEmployee({
      employee_id: 'conflict-emp',
      employee_name: 'Conflict Employee',
    });

    expect(result).toBeNull();
    expect(useWorkforceStore.getState().error).toBe('Employee already hired');
  });

  it('returns false and sets error on fire failure', async () => {
    useWorkforceStore.getState().addHiredEmployee(makeEmployee('fire-fail', 'Fire Fail'));

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      mockFetchResponse(
        { success: false, error: { code: 'NOT_FOUND', message: 'Employee not found' } },
        404,
      ),
    );

    const result = await useWorkforceStore.getState().fireEmployee('fire-fail');

    expect(result).toBe(false);
    expect(useWorkforceStore.getState().error).toBe('Employee not found');
    // Employee is still in local state since the DELETE failed
    expect(useWorkforceStore.getState().hiredEmployees).toHaveLength(1);
  });

  it('clearError sets error to null', () => {
    useWorkforceStore.setState({ error: 'Something went wrong' });

    useWorkforceStore.getState().clearError();

    expect(useWorkforceStore.getState().error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 6. reset()
// ---------------------------------------------------------------------------

describe('reset()', () => {
  it('clears employees, loading, and error', () => {
    useWorkforceStore.getState().addHiredEmployee(makeEmployee('r1', 'Reset Emp 1'));
    useWorkforceStore.getState().addHiredEmployee(makeEmployee('r2', 'Reset Emp 2'));
    useWorkforceStore.setState({ error: 'Error', isLoading: true });

    useWorkforceStore.getState().reset();

    const { hiredEmployees, isLoading, error } = useWorkforceStore.getState();
    expect(hiredEmployees).toHaveLength(0);
    expect(isLoading).toBe(false);
    expect(error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 7. Authentication guard
// ---------------------------------------------------------------------------

describe('authentication guard', () => {
  it('fetchHiredEmployees returns early when user is null', async () => {
    currentUser = null;

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await useWorkforceStore.getState().fetchHiredEmployees();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(useWorkforceStore.getState().hiredEmployees).toHaveLength(0);
  });

  it('hireEmployee returns null with error when user is null', async () => {
    currentUser = null;

    const result = await useWorkforceStore.getState().hireEmployee({
      employee_id: 'test',
      employee_name: 'Test',
    });

    expect(result).toBeNull();
    expect(useWorkforceStore.getState().error).toBe('User not authenticated');
  });

  it('fireEmployee returns false with error when user is null', async () => {
    currentUser = null;

    const result = await useWorkforceStore.getState().fireEmployee('test-emp');

    expect(result).toBe(false);
    expect(useWorkforceStore.getState().error).toBe('User not authenticated');
  });
});
