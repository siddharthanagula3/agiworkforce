import { useEffect, useCallback, useRef, useState } from 'react';
import { useAuthStore } from '@shared/stores/authentication-store';
import { useUserSettings } from '@features/settings/hooks/use-settings-queries';
import { logger } from '@shared/lib/logger';

const ACTIVITY_STORAGE_KEY = 'agi_last_activity';
const WARNING_TIME_BEFORE_TIMEOUT_MS = 2 * 60 * 1000;
const ACTIVITY_CHECK_INTERVAL_MS = 30 * 1000;
const ACTIVITY_THROTTLE_MS = 5 * 1000;
const DEFAULT_SESSION_TIMEOUT_MINUTES = 60;

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  'mousedown',
  'mousemove',
  'keydown',
  'scroll',
  'touchstart',
  'click',
  'focus',
];

export interface SessionTimeoutState {
  isTimedOut: boolean;
  isWarningActive: boolean;
  secondsUntilTimeout: number;
  timeoutMinutes: number;
  lastActivity: number;
}

export interface UseSessionTimeoutOptions {
  enabled?: boolean;
  onTimeout?: () => void;
  onWarning?: (secondsRemaining: number) => void;
  onSessionExtended?: () => void;
}

export interface UseSessionTimeoutReturn extends SessionTimeoutState {
  extendSession: () => void;
  forceLogout: () => void;
}

function getStoredActivity(): number | null {
  try {
    const stored = localStorage.getItem(ACTIVITY_STORAGE_KEY);
    if (stored) {
      const timestamp = parseInt(stored, 10);
      if (!isNaN(timestamp) && timestamp > 0) {
        return timestamp;
      }
    }
  } catch {
    // localStorage might not be available
  }
  return null;
}

function resolveLastActivity(inMemory: number, now: number): number {
  const stored = getStoredActivity();
  if (stored === null || stored > now) return inMemory;
  return Math.max(inMemory, stored);
}

function setLastActivity(timestamp: number): void {
  try {
    localStorage.setItem(ACTIVITY_STORAGE_KEY, timestamp.toString());
  } catch {
    // localStorage might not be available
  }
}

function clearLastActivity(): void {
  try {
    localStorage.removeItem(ACTIVITY_STORAGE_KEY);
  } catch {
    // localStorage might not be available
  }
}

/**
 * Signs the user out after the inactivity window from their `session_timeout`
 * setting, warning first. Activity is shared across tabs through localStorage.
 */
export function useSessionTimeout(options: UseSessionTimeoutOptions = {}): UseSessionTimeoutReturn {
  const { enabled = true, onTimeout, onWarning, onSessionExtended } = options;

  const { user, logout, isAuthenticated } = useAuthStore();
  const { data: settings } = useUserSettings();

  const [state, setState] = useState<SessionTimeoutState>(() => ({
    isTimedOut: false,
    isWarningActive: false,
    secondsUntilTimeout: 0,
    timeoutMinutes: settings?.session_timeout ?? DEFAULT_SESSION_TIMEOUT_MINUTES,
    lastActivity: getStoredActivity() ?? Date.now(),
  }));

  const checkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastActivityUpdateRef = useRef<number>(0);
  const lastActivityMemoryRef = useRef<number>(Date.now());
  const wasWarningActiveRef = useRef<boolean>(false);
  const hasLoggedOutRef = useRef<boolean>(false);
  const callbacksRef = useRef({ onTimeout, onWarning, onSessionExtended });

  useEffect(() => {
    callbacksRef.current = { onTimeout, onWarning, onSessionExtended };
  });

  const timeoutMs = (settings?.session_timeout ?? DEFAULT_SESSION_TIMEOUT_MINUTES) * 60 * 1000;

  const recordActivity = useCallback((now: number) => {
    lastActivityMemoryRef.current = now;
    lastActivityUpdateRef.current = now;
    setLastActivity(now);
  }, []);

  const updateActivity = useCallback(() => {
    const now = Date.now();

    if (now - lastActivityUpdateRef.current < ACTIVITY_THROTTLE_MS) {
      return;
    }

    recordActivity(now);

    setState((prev) => {
      if (prev.isWarningActive) {
        logger.debug('[SessionTimeout] User activity detected, extending session');
        callbacksRef.current.onSessionExtended?.();
        return {
          ...prev,
          lastActivity: now,
          isWarningActive: false,
          secondsUntilTimeout: 0,
        };
      }
      return {
        ...prev,
        lastActivity: now,
      };
    });
  }, [recordActivity]);

  const extendSession = useCallback(() => {
    const now = Date.now();
    recordActivity(now);
    hasLoggedOutRef.current = false;

    setState((prev) => ({
      ...prev,
      lastActivity: now,
      isWarningActive: false,
      isTimedOut: false,
      secondsUntilTimeout: 0,
    }));

    logger.debug('[SessionTimeout] Session extended manually');
    callbacksRef.current.onSessionExtended?.();
  }, [recordActivity]);

  const forceLogout = useCallback(async () => {
    if (hasLoggedOutRef.current) return;
    hasLoggedOutRef.current = true;

    logger.auth('[SessionTimeout] Force logout triggered');
    clearLastActivity();

    setState((prev) => ({
      ...prev,
      isTimedOut: true,
      isWarningActive: false,
    }));

    callbacksRef.current.onTimeout?.();
    await logout();
  }, [logout]);

  const checkTimeout = useCallback(() => {
    if (!isAuthenticated || !user) {
      return;
    }

    const now = Date.now();
    const lastActivity = resolveLastActivity(lastActivityMemoryRef.current, now);
    lastActivityMemoryRef.current = lastActivity;
    const elapsed = now - lastActivity;
    const timeRemaining = timeoutMs - elapsed;

    if (timeRemaining <= 0) {
      if (!hasLoggedOutRef.current) {
        logger.auth('[SessionTimeout] Session timed out after inactivity');
        forceLogout();
      }
      return;
    }

    const shouldShowWarning = timeRemaining <= WARNING_TIME_BEFORE_TIMEOUT_MS;
    const secondsRemaining = Math.ceil(timeRemaining / 1000);

    if (shouldShowWarning && !wasWarningActiveRef.current) {
      wasWarningActiveRef.current = true;
      callbacksRef.current.onWarning?.(secondsRemaining);
    } else if (!shouldShowWarning) {
      wasWarningActiveRef.current = false;
    }

    setState((prev) => {
      const timeoutMinutes = settings?.session_timeout ?? DEFAULT_SESSION_TIMEOUT_MINUTES;
      const nextSeconds = shouldShowWarning ? secondsRemaining : 0;
      if (
        prev.lastActivity === lastActivity &&
        prev.timeoutMinutes === timeoutMinutes &&
        prev.isWarningActive === shouldShowWarning &&
        prev.secondsUntilTimeout === nextSeconds
      ) {
        return prev;
      }
      return {
        ...prev,
        lastActivity,
        timeoutMinutes,
        isWarningActive: shouldShowWarning,
        secondsUntilTimeout: nextSeconds,
      };
    });
  }, [isAuthenticated, user, timeoutMs, settings?.session_timeout, forceLogout]);

  useEffect(() => {
    if (!enabled || !isAuthenticated) {
      return;
    }

    const handleActivity = () => {
      updateActivity();
    };

    ACTIVITY_EVENTS.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === ACTIVITY_STORAGE_KEY && e.newValue) {
        const newTimestamp = parseInt(e.newValue, 10);
        if (!isNaN(newTimestamp) && newTimestamp > 0) {
          if (newTimestamp <= Date.now()) {
            lastActivityMemoryRef.current = Math.max(lastActivityMemoryRef.current, newTimestamp);
          }
          setState((prev) => ({
            ...prev,
            lastActivity: newTimestamp,
            isWarningActive: false,
            secondsUntilTimeout: 0,
          }));
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      ACTIVITY_EVENTS.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [enabled, isAuthenticated, updateActivity]);

  useEffect(() => {
    if (!enabled || !isAuthenticated) {
      return;
    }

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const now = Date.now();
      recordActivity(now);
      setState((prev) => ({ ...prev, lastActivity: now }));
    });

    return () => {
      cancelled = true;
    };
  }, [enabled, isAuthenticated, recordActivity]);

  useEffect(() => {
    if (!enabled || !isAuthenticated) {
      return;
    }

    queueMicrotask(() => {
      checkTimeout();
    });

    checkIntervalRef.current = setInterval(checkTimeout, ACTIVITY_CHECK_INTERVAL_MS);

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
    };
  }, [enabled, isAuthenticated, checkTimeout]);

  useEffect(() => {
    if (!state.isWarningActive) {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      return;
    }

    countdownIntervalRef.current = setInterval(() => {
      setState((prev) => {
        if (!prev.isWarningActive) return prev;

        const newSeconds = prev.secondsUntilTimeout - 1;

        if (newSeconds <= 0) {
          if (!hasLoggedOutRef.current) {
            forceLogout();
          }
          return {
            ...prev,
            secondsUntilTimeout: 0,
            isTimedOut: true,
          };
        }

        return {
          ...prev,
          secondsUntilTimeout: newSeconds,
        };
      });
    }, 1000);

    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
  }, [state.isWarningActive, forceLogout]);

  useEffect(() => {
    if (!isAuthenticated) {
      hasLoggedOutRef.current = false;
      wasWarningActiveRef.current = false;
      lastActivityMemoryRef.current = Date.now();
      clearLastActivity();
      queueMicrotask(() => {
        setState({
          isTimedOut: false,
          isWarningActive: false,
          secondsUntilTimeout: 0,
          timeoutMinutes: DEFAULT_SESSION_TIMEOUT_MINUTES,
          lastActivity: Date.now(),
        });
      });
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (settings?.session_timeout) {
      queueMicrotask(() => {
        setState((prev) => ({
          ...prev,
          timeoutMinutes: settings.session_timeout!,
        }));
      });
    }
  }, [settings?.session_timeout]);

  return {
    ...state,
    extendSession,
    forceLogout,
  };
}

export default useSessionTimeout;
