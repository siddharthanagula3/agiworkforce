/**
 * Workforce Store
 * Manages hired AI employees and provides real-time sync.
 *
 * All mutations and queries go through the API routes (/api/workforce,
 * /api/marketplace) which provide server-side validation, rate limiting,
 * CSRF protection, and catalog enrichment. The Supabase client import is
 * retained only for the real-time subscription (postgres_changes).
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { supabase } from '@shared/lib/supabase-client';
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

            // Add to local state (real-time subscription might also do this, but better to be responsive)
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
// Realtime payload validation
// ---------------------------------------------------------------------------

/**
 * Runtime type-guard for incoming realtime payloads.
 * Supabase Realtime delivers raw JSON — we must verify the shape before
 * merging into local state to prevent corrupted / spoofed data.
 */
function isValidHiredEmployeePayload(data: unknown, expectedUserId: string): data is HiredEmployee {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d['id'] === 'string' &&
    (d['id'] as string).length > 0 &&
    typeof d['user_id'] === 'string' &&
    d['user_id'] === expectedUserId &&
    typeof d['employee_id'] === 'string' &&
    (d['employee_id'] as string).length > 0 &&
    (d['employee_name'] === null || typeof d['employee_name'] === 'string') &&
    (d['hired_at'] === null || typeof d['hired_at'] === 'string')
  );
}

/**
 * Minimal guard for DELETE payloads — we only need employee_id from the old record.
 */
function isValidDeletePayload(
  data: unknown,
  expectedUserId: string,
): data is { employee_id: string; user_id: string } {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d['employee_id'] === 'string' &&
    (d['employee_id'] as string).length > 0 &&
    typeof d['user_id'] === 'string' &&
    d['user_id'] === expectedUserId
  );
}

// ---------------------------------------------------------------------------
// Set up real-time subscription
// ---------------------------------------------------------------------------

// Track both the subscription and the user ID it was created for
let subscription: ReturnType<typeof supabase.channel> | null = null;
let subscriptionUserId: string | null = null;

/**
 * Set up real-time subscription for workforce changes
 * Automatically cleans up stale subscriptions if user changes
 */
export const setupWorkforceSubscription = () => {
  const { user } = useAuthStore.getState();

  // No user - clean up any existing subscription and exit
  if (!user) {
    cleanupWorkforceSubscription();
    return;
  }

  // If subscription exists for a different user, clean it up first
  if (subscription && subscriptionUserId !== user.id) {
    cleanupWorkforceSubscription();
  }

  // If subscription already exists for this user, don't create a new one
  if (subscription && subscriptionUserId === user.id) {
    return;
  }

  // Create new subscription
  const channelName = `workforce-changes-${user.id}-${Date.now()}`;
  subscription = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'hired_employees',
        filter: `user_id=eq.${user.id}`,
      },
      (payload) => {
        // Verify subscription is still valid (user hasn't changed)
        const currentUser = useAuthStore.getState().user;
        if (!currentUser || currentUser.id !== subscriptionUserId) {
          logger.warn('[WorkforceStore] Ignoring stale subscription event');
          return;
        }

        const { eventType, new: newRecord, old: oldRecord } = payload;

        switch (eventType) {
          case 'INSERT':
            if (!isValidHiredEmployeePayload(newRecord, currentUser.id)) {
              logger.warn('[WorkforceStore] Invalid INSERT payload, ignoring', {
                hasRecord: !!newRecord,
              });
              return;
            }
            useWorkforceStore.getState().addHiredEmployee(newRecord);
            break;
          case 'UPDATE':
            // Verify the update payload belongs to the current user before
            // triggering a refetch. Reject null/missing records AND
            // cross-tenant events to prevent unauthorized data leaks.
            if (
              !newRecord ||
              typeof newRecord !== 'object' ||
              (newRecord as Record<string, unknown>)['user_id'] !== currentUser.id
            ) {
              logger.warn('[WorkforceStore] UPDATE payload missing or user_id mismatch, ignoring');
              return;
            }
            // Refresh the full list on updates to ensure consistency
            useWorkforceStore.getState().fetchHiredEmployees();
            break;
          case 'DELETE':
            if (!isValidDeletePayload(oldRecord, currentUser.id)) {
              logger.warn('[WorkforceStore] Invalid DELETE payload, ignoring', {
                hasRecord: !!oldRecord,
              });
              return;
            }
            useWorkforceStore.getState().removeHiredEmployee(oldRecord.employee_id);
            break;
        }
      },
    )
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR') {
        logger.error('[WorkforceStore] Subscription error, cleaning up');
        cleanupWorkforceSubscription();
      }
    });

  subscriptionUserId = user.id;
};

/**
 * Clean up workforce subscription
 * Safe to call multiple times - will only clean up if subscription exists
 */
export const cleanupWorkforceSubscription = () => {
  if (subscription) {
    try {
      supabase.removeChannel(subscription);
    } catch (_error) {
      // Subscription cleanup may fail if already disconnected
    }
    subscription = null;
    subscriptionUserId = null;
  }
};

/**
 * Check if subscription is active for the current user
 */
export const isWorkforceSubscriptionActive = (): boolean => {
  const { user } = useAuthStore.getState();
  return !!(subscription && user && subscriptionUserId === user.id);
};

// Listen for team refresh events
// HMR guard: Only add listener once per module load
if (typeof window !== 'undefined') {
  window.addEventListener('team:refresh', () => {
    useWorkforceStore.getState().fetchHiredEmployees();
  });
}

// CRITICAL FIX: Listen for auth state changes to clean up subscriptions on logout
// This prevents memory leaks and data leakage between users
if (typeof window !== 'undefined') {
  // Subscribe to auth store changes
  // When user logs out (user becomes null), clean up the realtime subscription
  useAuthStore.subscribe((state, prevState) => {
    const wasLoggedIn = !!prevState.user;
    const isLoggedIn = !!state.user;

    // User logged out - clean up subscription and reset store
    if (wasLoggedIn && !isLoggedIn) {
      cleanupWorkforceSubscription();
      useWorkforceStore.getState().reset();
    }

    // User logged in - set up new subscription
    if (!wasLoggedIn && isLoggedIn) {
      setupWorkforceSubscription();
      useWorkforceStore.getState().fetchHiredEmployees();
    }

    // User changed (different user logged in) - clean up and re-setup
    if (wasLoggedIn && isLoggedIn && prevState.user?.id !== state.user?.id) {
      cleanupWorkforceSubscription();
      useWorkforceStore.getState().reset();
      setupWorkforceSubscription();
      useWorkforceStore.getState().fetchHiredEmployees();
    }
  });
}
