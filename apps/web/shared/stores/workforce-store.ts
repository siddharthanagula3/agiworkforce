/**
 * Workforce Store
 * Manages hired AI employees.
 *
 * All mutations and queries go through the API routes (/api/workforce,
 * /api/marketplace) which provide server-side validation, rate limiting,
 * CSRF protection, and catalog enrichment. Realtime subscriptions
 * have been removed; the store now relies on API calls and window events.
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { useAuthStore } from './authentication-store';
import { logger } from '@shared/lib/logger';
import { addCsrfHeaders } from '@/lib/client/csrf';

export interface HiredEmployee {
  id: string;
  user_id: string;
  employee_id: string;
  employee_name: string | null;
  hired_at: string | null;
}

export interface HireEmployeeParams {
  employee_id: string;
  employee_name: string;
}

export interface WorkforceState {
  hiredEmployees: HiredEmployee[];
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchHiredEmployees: () => Promise<void>;
  addHiredEmployee: (employee: HiredEmployee) => void;
  hireEmployee: (params: HireEmployeeParams) => Promise<HiredEmployee | null>;
  removeHiredEmployee: (employeeId: string) => void;
  fireEmployee: (employeeId: string) => Promise<boolean>;
  clearError: () => void;
  reset: () => void;
}

/**
 * Parse a standard API error response, falling back to status text.
 */
async function parseApiError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      error?: { message?: string };
      message?: string;
    };
    return body.error?.message || body.message || `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

const enableDevtools = process.env.NODE_ENV !== 'production';

export const useWorkforceStore = create<WorkforceState>()(
  devtools(
    immer((set, get) => ({
      hiredEmployees: [],
      isLoading: false,
      error: null,

      fetchHiredEmployees: async () => {
        const { user } = useAuthStore.getState();
        if (!user) {
          set({ hiredEmployees: [], error: null });
          return;
        }

        set({ isLoading: true, error: null });

        try {
          const response = await fetch('/api/workforce', {
            method: 'GET',
            headers: { Accept: 'application/json' },
            credentials: 'same-origin',
          });

          if (!response.ok) {
            const errorMessage = await parseApiError(response);
            logger.error('[WorkforceStore] Error fetching hired employees:', errorMessage);
            set({ error: errorMessage, isLoading: false });
            return;
          }

          const body = (await response.json()) as {
            success: boolean;
            data: {
              employees: Array<{
                id: string;
                employeeId: string;
                name: string;
                hiredAt: string | null;
              }>;
            };
          };

          // Map the enriched API response back to the HiredEmployee shape
          // expected by the rest of the store and its consumers.
          const employees: HiredEmployee[] = (body.data?.employees || []).map((emp) => ({
            id: emp.id,
            user_id: user.id,
            employee_id: emp.employeeId,
            employee_name: emp.name,
            hired_at: emp.hiredAt,
          }));

          set({ hiredEmployees: employees, isLoading: false });
        } catch (error) {
          logger.error('[WorkforceStore] Unexpected error:', error);
          set({
            error: error instanceof Error ? error.message : 'Unknown error',
            isLoading: false,
          });
        }
      },

      addHiredEmployee: (employee: HiredEmployee) => {
        set((state) => ({
          hiredEmployees: [employee, ...state.hiredEmployees],
        }));
      },

      /**
       * Hire an employee - calls POST /api/workforce and updates local state.
       * The API validates the employee against the catalog, performs an upsert,
       * and returns the enriched record.
       */
      hireEmployee: async (params: HireEmployeeParams) => {
        const { user } = useAuthStore.getState();
        if (!user) {
          set({ error: 'User not authenticated' });
          return null;
        }

        set({ isLoading: true, error: null });

        try {
          const headers = await addCsrfHeaders({
            'Content-Type': 'application/json',
            Accept: 'application/json',
          });

          const response = await fetch('/api/workforce', {
            method: 'POST',
            headers,
            credentials: 'same-origin',
            body: JSON.stringify({ employeeId: params.employee_id }),
          });

          if (!response.ok) {
            const errorMessage = await parseApiError(response);
            logger.error('[WorkforceStore] Error hiring employee:', errorMessage);
            set({ error: errorMessage, isLoading: false });
            return null;
          }

          const body = (await response.json()) as {
            success: boolean;
            data: {
              id: string;
              employeeId: string;
              name: string;
              hiredAt: string | null;
            };
          };

          if (body.data) {
            const hired: HiredEmployee = {
              id: body.data.id,
              user_id: user.id,
              employee_id: body.data.employeeId,
              employee_name: body.data.name,
              hired_at: body.data.hiredAt,
            };

            // Add to local state optimistically
            const exists = get().hiredEmployees.some(
              (emp) => emp.employee_id === params.employee_id,
            );
            if (!exists) {
              set((state) => ({
                hiredEmployees: [hired, ...state.hiredEmployees],
                isLoading: false,
              }));
            } else {
              set({ isLoading: false });
            }
            return hired;
          }

          set({ isLoading: false });
          return null;
        } catch (error) {
          logger.error('[WorkforceStore] Unexpected error hiring employee:', error);
          set({
            error: error instanceof Error ? error.message : 'Unknown error',
            isLoading: false,
          });
          return null;
        }
      },

      removeHiredEmployee: (employeeId: string) => {
        set((state) => ({
          hiredEmployees: state.hiredEmployees.filter((emp) => emp.employee_id !== employeeId),
        }));
      },

      /**
       * Fire an employee - calls DELETE /api/workforce and updates local state.
       * The API deletes the record from the database.
       */
      fireEmployee: async (employeeId: string) => {
        const { user } = useAuthStore.getState();
        if (!user) {
          set({ error: 'User not authenticated' });
          return false;
        }

        set({ isLoading: true, error: null });

        try {
          const headers = await addCsrfHeaders({
            Accept: 'application/json',
          });

          const response = await fetch(
            `/api/workforce?employeeId=${encodeURIComponent(employeeId)}`,
            {
              method: 'DELETE',
              headers,
              credentials: 'same-origin',
            },
          );

          if (!response.ok) {
            const errorMessage = await parseApiError(response);
            logger.error('[WorkforceStore] Error firing employee:', errorMessage);
            set({ error: errorMessage, isLoading: false });
            return false;
          }

          // Remove from local state
          set((state) => ({
            hiredEmployees: state.hiredEmployees.filter((emp) => emp.employee_id !== employeeId),
            isLoading: false,
          }));

          return true;
        } catch (error) {
          logger.error('[WorkforceStore] Unexpected error firing employee:', error);
          set({
            error: error instanceof Error ? error.message : 'Unknown error',
            isLoading: false,
          });
          return false;
        }
      },

      clearError: () => {
        set({ error: null });
      },

      reset: () => {
        set({ hiredEmployees: [], isLoading: false, error: null });
      },
    })),
    { name: 'WorkforceStore', enabled: enableDevtools },
  ),
);

// ---------------------------------------------------------------------------
// Realtime subscription stubs
// ---------------------------------------------------------------------------

/**
 * Set up workforce change notifications.
 * Realtime has been removed; this is now a no-op. Callers should
 * rely on polling via fetchHiredEmployees() or window events.
 */
export const setupWorkforceSubscription = () => {
  logger.warn(
    '[WorkforceStore] setupWorkforceSubscription called but Realtime has been removed. Using API polling instead.',
  );
};

/**
 * Clean up workforce subscription (no-op stub).
 */
export const cleanupWorkforceSubscription = () => {};

/**
 * Check if subscription is active for the current user.
 * Always returns false since Realtime has been removed.
 */
export const isWorkforceSubscriptionActive = (): boolean => false;

// Listen for team refresh events
// HMR guard: Only add listener once per module load
if (typeof window !== 'undefined') {
  window.addEventListener('team:refresh', () => {
    useWorkforceStore.getState().fetchHiredEmployees();
  });
}

// Listen for auth state changes to refresh or reset store on login/logout
if (typeof window !== 'undefined') {
  useAuthStore.subscribe((state, prevState) => {
    const wasLoggedIn = !!prevState.user;
    const isLoggedIn = !!state.user;

    // User logged out - reset store
    if (wasLoggedIn && !isLoggedIn) {
      useWorkforceStore.getState().reset();
    }

    // User logged in - fetch current workforce
    if (!wasLoggedIn && isLoggedIn) {
      useWorkforceStore.getState().fetchHiredEmployees();
    }

    // User changed (different user logged in) - reset and re-fetch
    if (wasLoggedIn && isLoggedIn && prevState.user?.id !== state.user?.id) {
      useWorkforceStore.getState().reset();
      useWorkforceStore.getState().fetchHiredEmployees();
    }
  });
}
