/**
 * Workforce Store Unit Tests
 * Tests for the workforce management store (hired employees).
 *
 * The store now calls /api/workforce (GET, POST, DELETE) via fetch()
 * instead of direct Supabase queries. Tests mock global fetch and the
 * CSRF header helper accordingly.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock auth store first (before any imports)
const mockUser = { id: 'test-user-123', email: 'test@example.com' };
let currentUser: typeof mockUser | null = mockUser;

vi.mock('./authentication-store', () => ({
  useAuthStore: {
    getState: vi.fn(() => ({
      user: currentUser,
    })),
    subscribe: vi.fn(() => () => {}), // Return unsubscribe function
  },
}));

// Mock CSRF helper — returns headers with a fake token
vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: vi.fn(async (headers: Record<string, string> = {}) => ({
    ...headers,
    'x-csrf-token': 'mock-csrf-token',
  })),
}));

// Mock Supabase client (still needed for realtime subscription code)
vi.mock('@shared/lib/supabase-client', () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn(() => ({
      on: vi.fn(() => ({
        subscribe: vi.fn(),
      })),
    })),
    removeChannel: vi.fn(),
  },
}));

// Helper to create a mock fetch Response
function mockFetchResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn(async () => body),
    headers: new Headers({ 'content-type': 'application/json' }),
  } as unknown as Response;
}

// Import after mocks are set up
import { useWorkforceStore } from './workforce-store';

describe('Workforce Store', () => {
  const mockEmployee = {
    id: 'emp-1',
    user_id: 'test-user-123',
    employee_id: 'code-reviewer',
    employee_name: 'Code Reviewer',
    hired_at: '2025-01-01T00:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset the store
    useWorkforceStore.getState().reset();

    // Reset user to authenticated state
    currentUser = mockUser;

    // Suppress console logs in tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initial State', () => {
    it('should start with empty state', () => {
      useWorkforceStore.getState().reset();
      const state = useWorkforceStore.getState();

      expect(state.hiredEmployees).toEqual([]);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe('fetchHiredEmployees', () => {
    it('should fetch employees for authenticated user', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockFetchResponse({
          success: true,
          data: {
            employees: [
              {
                id: 'emp-1',
                employeeId: 'code-reviewer',
                name: 'Code Reviewer',
                hiredAt: '2025-01-01T00:00:00Z',
              },
            ],
            stats: { totalHired: 1, activeEmployees: 1, totalTasksCompleted: 0 },
          },
        }),
      );

      await useWorkforceStore.getState().fetchHiredEmployees();

      const state = useWorkforceStore.getState();
      expect(state.hiredEmployees).toHaveLength(1);
      expect(state.hiredEmployees[0]!.employee_name).toBe('Code Reviewer');
      expect(state.hiredEmployees[0]!.employee_id).toBe('code-reviewer');
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();

      // Verify fetch was called with correct URL and method
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/workforce',
        expect.objectContaining({
          method: 'GET',
        }),
      );
    });

    it('should handle no authenticated user', async () => {
      currentUser = null;

      await useWorkforceStore.getState().fetchHiredEmployees();

      const state = useWorkforceStore.getState();
      expect(state.hiredEmployees).toEqual([]);
      expect(state.error).toBeNull();

      // fetch should not have been called
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('should handle fetch errors', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockFetchResponse(
          { success: false, error: { code: 'INTERNAL_ERROR', message: 'Database error' } },
          500,
        ),
      );

      await useWorkforceStore.getState().fetchHiredEmployees();

      const state = useWorkforceStore.getState();
      expect(state.error).toBe('Database error');
      expect(state.isLoading).toBe(false);
    });

    it('should set loading state during fetch', async () => {
      let loadingDuringFetch = false;

      vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async () => {
        loadingDuringFetch = useWorkforceStore.getState().isLoading;
        return mockFetchResponse({
          success: true,
          data: {
            employees: [],
            stats: { totalHired: 0, activeEmployees: 0, totalTasksCompleted: 0 },
          },
        });
      });

      await useWorkforceStore.getState().fetchHiredEmployees();

      expect(loadingDuringFetch).toBe(true);
      expect(useWorkforceStore.getState().isLoading).toBe(false);
    });
  });

  describe('addHiredEmployee', () => {
    it('should add employee to state', () => {
      useWorkforceStore.getState().addHiredEmployee(mockEmployee);

      const state = useWorkforceStore.getState();
      expect(state.hiredEmployees).toHaveLength(1);
      expect(state.hiredEmployees[0]).toEqual(mockEmployee);
    });

    it('should add employee at the beginning of the list', () => {
      const employee1 = { ...mockEmployee, id: 'emp-1', employee_name: 'Employee 1' };
      const employee2 = { ...mockEmployee, id: 'emp-2', employee_name: 'Employee 2' };

      useWorkforceStore.getState().addHiredEmployee(employee1);
      useWorkforceStore.getState().addHiredEmployee(employee2);

      const state = useWorkforceStore.getState();
      expect(state.hiredEmployees[0]!.employee_name).toBe('Employee 2');
      expect(state.hiredEmployees[1]!.employee_name).toBe('Employee 1');
    });
  });

  describe('hireEmployee', () => {
    it('should hire employee successfully', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockFetchResponse(
          {
            success: true,
            data: {
              id: 'new-emp-id',
              employeeId: 'new-employee',
              name: 'New Employee',
              hiredAt: '2025-01-01T00:00:00Z',
            },
            message: 'New Employee has been hired successfully',
          },
          201,
        ),
      );

      const result = await useWorkforceStore.getState().hireEmployee({
        employee_id: 'new-employee',
        employee_name: 'New Employee',
      });

      expect(result).toEqual({
        id: 'new-emp-id',
        user_id: 'test-user-123',
        employee_id: 'new-employee',
        employee_name: 'New Employee',
        hired_at: '2025-01-01T00:00:00Z',
      });

      const state = useWorkforceStore.getState();
      expect(state.hiredEmployees).toContainEqual(result);
      expect(state.isLoading).toBe(false);

      // Verify fetch was called with POST and CSRF header
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/workforce',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ employeeId: 'new-employee' }),
          headers: expect.objectContaining({ 'x-csrf-token': 'mock-csrf-token' }),
        }),
      );
    });

    it('should handle hire failure', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockFetchResponse(
          { success: false, error: { code: 'INTERNAL_ERROR', message: 'Hire failed' } },
          500,
        ),
      );

      const result = await useWorkforceStore.getState().hireEmployee({
        employee_id: 'emp-1',
        employee_name: 'Employee',
      });

      expect(result).toBeNull();
      expect(useWorkforceStore.getState().error).toBe('Hire failed');
    });

    it('should not add duplicate employees', async () => {
      // First, add an employee to the store
      useWorkforceStore.getState().addHiredEmployee({
        ...mockEmployee,
        employee_id: 'existing-employee',
      });

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockFetchResponse(
          {
            success: true,
            data: {
              id: 'emp-1',
              employeeId: 'existing-employee',
              name: 'Employee',
              hiredAt: '2025-01-01T00:00:00Z',
            },
          },
          201,
        ),
      );

      await useWorkforceStore.getState().hireEmployee({
        employee_id: 'existing-employee',
        employee_name: 'Employee',
      });

      const state = useWorkforceStore.getState();
      // Should not have duplicates
      const matchingEmployees = state.hiredEmployees.filter(
        (e) => e.employee_id === 'existing-employee',
      );
      expect(matchingEmployees).toHaveLength(1);
    });

    it('should require authentication', async () => {
      currentUser = null;

      const result = await useWorkforceStore.getState().hireEmployee({
        employee_id: 'emp-1',
        employee_name: 'Employee',
      });

      expect(result).toBeNull();
      expect(useWorkforceStore.getState().error).toBe('User not authenticated');
    });
  });

  describe('removeHiredEmployee', () => {
    it('should remove employee from state', () => {
      useWorkforceStore.getState().addHiredEmployee(mockEmployee);
      expect(useWorkforceStore.getState().hiredEmployees).toHaveLength(1);

      useWorkforceStore.getState().removeHiredEmployee(mockEmployee.employee_id);

      expect(useWorkforceStore.getState().hiredEmployees).toHaveLength(0);
    });

    it('should handle non-existent employee', () => {
      useWorkforceStore.getState().addHiredEmployee(mockEmployee);

      // Should not throw
      expect(() => {
        useWorkforceStore.getState().removeHiredEmployee('non-existent');
      }).not.toThrow();

      // Original employee should still be there
      expect(useWorkforceStore.getState().hiredEmployees).toHaveLength(1);
    });
  });

  describe('fireEmployee', () => {
    it('should fire employee successfully', async () => {
      useWorkforceStore.getState().addHiredEmployee(mockEmployee);

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockFetchResponse({ success: true, message: 'Employee removed from workforce' }),
      );

      const result = await useWorkforceStore.getState().fireEmployee(mockEmployee.employee_id);

      expect(result).toBe(true);
      expect(useWorkforceStore.getState().hiredEmployees).toHaveLength(0);

      // Verify fetch was called with DELETE, correct query param, and CSRF header
      expect(globalThis.fetch).toHaveBeenCalledWith(
        `/api/workforce?employeeId=${encodeURIComponent(mockEmployee.employee_id)}`,
        expect.objectContaining({
          method: 'DELETE',
          headers: expect.objectContaining({ 'x-csrf-token': 'mock-csrf-token' }),
        }),
      );
    });

    it('should handle fire failure', async () => {
      useWorkforceStore.getState().addHiredEmployee(mockEmployee);

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockFetchResponse(
          { success: false, error: { code: 'INTERNAL_ERROR', message: 'Fire failed' } },
          500,
        ),
      );

      const result = await useWorkforceStore.getState().fireEmployee(mockEmployee.employee_id);

      expect(result).toBe(false);
      expect(useWorkforceStore.getState().error).toBe('Fire failed');
      // Employee should still be in the list
      expect(useWorkforceStore.getState().hiredEmployees).toHaveLength(1);
    });

    it('should require authentication', async () => {
      currentUser = null;

      const result = await useWorkforceStore.getState().fireEmployee('emp-1');

      expect(result).toBe(false);
      expect(useWorkforceStore.getState().error).toBe('User not authenticated');
    });
  });

  describe('clearError', () => {
    it('should clear error state', () => {
      // Set an error first
      useWorkforceStore.setState({ error: 'Some error' });
      expect(useWorkforceStore.getState().error).toBe('Some error');

      useWorkforceStore.getState().clearError();

      expect(useWorkforceStore.getState().error).toBeNull();
    });
  });

  describe('reset', () => {
    it('should reset to initial state', () => {
      // Set some state
      useWorkforceStore.getState().addHiredEmployee(mockEmployee);
      useWorkforceStore.setState({ error: 'Error', isLoading: true });

      // Reset
      useWorkforceStore.getState().reset();

      const state = useWorkforceStore.getState();
      expect(state.hiredEmployees).toEqual([]);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty employee list', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockFetchResponse({
          success: true,
          data: {
            employees: [],
            stats: { totalHired: 0, activeEmployees: 0, totalTasksCompleted: 0 },
          },
        }),
      );

      await useWorkforceStore.getState().fetchHiredEmployees();

      expect(useWorkforceStore.getState().hiredEmployees).toEqual([]);
    });

    it('should handle null data from fetch', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockFetchResponse({
          success: true,
          data: { employees: null },
        }),
      );

      await useWorkforceStore.getState().fetchHiredEmployees();

      expect(useWorkforceStore.getState().hiredEmployees).toEqual([]);
    });

    it('should handle unexpected errors in fetchHiredEmployees', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Unexpected error'));

      await useWorkforceStore.getState().fetchHiredEmployees();

      expect(useWorkforceStore.getState().error).toBe('Unexpected error');
    });

    it('should handle unexpected errors in hireEmployee', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Unexpected hire error'));

      const result = await useWorkforceStore.getState().hireEmployee({
        employee_id: 'emp-1',
        employee_name: 'Employee',
      });

      expect(result).toBeNull();
      expect(useWorkforceStore.getState().error).toBe('Unexpected hire error');
    });

    it('should handle unexpected errors in fireEmployee', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Unexpected fire error'));

      const result = await useWorkforceStore.getState().fireEmployee('emp-1');

      expect(result).toBe(false);
      expect(useWorkforceStore.getState().error).toBe('Unexpected fire error');
    });
  });

  describe('Performance', () => {
    it('should handle large employee lists', async () => {
      const largeList = Array.from({ length: 100 }, (_, i) => ({
        id: `emp-${i}`,
        employeeId: `employee-${i}`,
        name: `Employee ${i}`,
        hiredAt: '2025-01-01T00:00:00Z',
      }));

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockFetchResponse({
          success: true,
          data: {
            employees: largeList,
            stats: { totalHired: 100, activeEmployees: 100, totalTasksCompleted: 0 },
          },
        }),
      );

      const start = performance.now();
      await useWorkforceStore.getState().fetchHiredEmployees();
      const end = performance.now();

      expect(useWorkforceStore.getState().hiredEmployees).toHaveLength(100);
      expect(end - start).toBeLessThan(100); // Should be fast
    });
  });
});
