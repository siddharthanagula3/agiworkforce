import { useCallback, useEffect, useRef, useState } from 'react';

import { FEATURES } from '@/lib/v1FeatureFlags';
import { fetchPreferenceNamespace, patchPreferenceNamespace } from '@/services/preferences';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
  subscribeCloudAccountEpochChange,
  type CloudAccountEpoch,
} from '@/src/features/auth/services/cloudAccountSession';
import { useAuthStore } from '@/src/features/auth/store';
import { useTierStore } from '@/src/features/billing/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useScheduleStore } from '@/src/features/schedules/store';
import { deviceTimezone, useNotificationPrefsStore } from '@/stores/notificationPrefsStore';
import { ACCOUNT_PUSH_PREFERENCE_GROUP } from './categories';
import {
  DAILY_BRIEF_OFF,
  DAILY_BRIEF_PAUSE_FAILED,
  DAILY_BRIEF_SCHEDULE_PREFERENCE_KEY,
  DAILY_BRIEF_SETUP_FAILED,
  DAILY_BRIEF_TIME_FAILED,
  dailyBriefAvailable,
  readDailyBrief,
  readDailyBriefScheduleId,
  turnOffDailyBrief,
  turnOnDailyBrief,
  type DailyBriefState,
} from './dailyBrief';
import { ACCOUNT_NOTIFICATION_PREFERENCES_NAMESPACE } from './useAgentActivityPushSync';

/**
 * Read by `apps/web/lib/workflows/usage-reset-reminder-preference.ts` before a
 * reset reminder is scheduled and again before it is sent; only `false` stops it.
 */
export const USAGE_RESET_PUSH_PREFERENCE_KEY = 'pushUsageReset';

export const CLOUD_REMINDERS_LOAD_FAILED =
  'Could not load your reminder settings. Check your connection and retry.';
export const USAGE_RESET_SAVE_FAILED = 'Could not save usage limit reset alerts. Try again.';
export const DAILY_BRIEF_LOAD_FAILED =
  'Could not load your daily brief. Check your connection and retry.';

export type CloudRemindersStatus = 'local' | 'signed_out' | 'loading' | 'ready' | 'error';

export interface CloudReminders {
  status: CloudRemindersStatus;
  retry: () => void;
  usageReset: {
    enabled: boolean;
    saving: boolean;
    error: string | null;
    setEnabled: (value: boolean) => void;
  };
  dailyBrief: {
    shown: boolean;
    loaded: boolean;
    state: DailyBriefState;
    saving: boolean;
    error: string | null;
    turnOn: (timeOfDay: string) => void;
    turnOff: () => void;
    changeTime: (timeOfDay: string) => void;
  };
}

interface ReminderSession {
  account: CloudAccountEpoch;
  controller: AbortController;
}

function currentCloudAccount(): CloudAccountEpoch | null {
  if (useChatAppModeStore.getState().appMode !== 'cloud') return null;
  const auth = useAuthStore.getState();
  if (!auth.isClerkLoaded || !auth.isClerkSignedIn) return null;
  const account = captureCloudAccountEpoch();
  return account && account.ownerId === auth.clerkUserId ? account : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function mirrorUsageResetOnDevice(enabled: boolean): void {
  useNotificationPrefsStore.getState().setCategoryEnabled(ACCOUNT_PUSH_PREFERENCE_GROUP, enabled);
}

export function useCloudReminders(): CloudReminders {
  const appMode = useChatAppModeStore((s) => s.appMode);
  const isClerkLoaded = useAuthStore((s) => s.isClerkLoaded);
  const isClerkSignedIn = useAuthStore((s) => s.isClerkSignedIn);
  const clerkUserId = useAuthStore((s) => s.clerkUserId);
  const tier = useTierStore((s) => s.tier);
  const [accountVersion, setAccountVersion] = useState(0);
  const [loadKey, setLoadKey] = useState(0);
  const sessionRef = useRef<ReminderSession | null>(null);

  const [status, setStatus] = useState<CloudRemindersStatus>('loading');
  const [usageEnabled, setUsageEnabled] = useState(true);
  const [usageSaving, setUsageSaving] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [brief, setBrief] = useState<DailyBriefState>(DAILY_BRIEF_OFF);
  const [briefLoaded, setBriefLoaded] = useState(false);
  const [briefSaving, setBriefSaving] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);

  const live = useCallback(
    (session: ReminderSession) =>
      sessionRef.current === session &&
      !session.controller.signal.aborted &&
      isCloudAccountEpochCurrent(session.account),
    [],
  );

  useEffect(() => subscribeCloudAccountEpochChange(() => setAccountVersion((v) => v + 1)), []);

  useEffect(() => {
    setUsageSaving(false);
    setUsageError(null);
    setBriefSaving(false);
    setBriefError(null);
    setBriefLoaded(false);
    setBrief(DAILY_BRIEF_OFF);
    if (appMode !== 'cloud') {
      sessionRef.current = null;
      setStatus('local');
      return;
    }
    const account = currentCloudAccount();
    if (!account) {
      sessionRef.current = null;
      setStatus(isClerkLoaded && isClerkSignedIn ? 'loading' : 'signed_out');
      return;
    }
    const session: ReminderSession = { account, controller: new AbortController() };
    sessionRef.current = session;
    setStatus('loading');
    void (async () => {
      let settings: Record<string, unknown>;
      try {
        settings = asRecord(
          await fetchPreferenceNamespace(ACCOUNT_NOTIFICATION_PREFERENCES_NAMESPACE, {
            accountEpoch: account,
            signal: session.controller.signal,
          }),
        );
      } catch {
        if (live(session)) setStatus('error');
        return;
      }
      if (!live(session)) return;
      const usage = settings[USAGE_RESET_PUSH_PREFERENCE_KEY] !== false;
      setUsageEnabled(usage);
      mirrorUsageResetOnDevice(usage);
      setStatus('ready');
      try {
        const briefState = await readDailyBrief(
          readDailyBriefScheduleId(settings),
          session.controller.signal,
        );
        if (!live(session)) return;
        setBrief(briefState);
        setBriefLoaded(true);
      } catch {
        if (!live(session)) return;
        setBriefError(DAILY_BRIEF_LOAD_FAILED);
      }
    })();
    return () => {
      session.controller.abort();
      if (sessionRef.current === session) sessionRef.current = null;
    };
  }, [appMode, isClerkLoaded, isClerkSignedIn, clerkUserId, accountVersion, loadKey, live]);

  const retry = useCallback(() => setLoadKey((key) => key + 1), []);

  const setUsageReset = useCallback(
    (value: boolean) => {
      const session = sessionRef.current;
      if (!session || status !== 'ready' || usageSaving) return;
      const previous = usageEnabled;
      setUsageEnabled(value);
      setUsageSaving(true);
      setUsageError(null);
      patchPreferenceNamespace(
        ACCOUNT_NOTIFICATION_PREFERENCES_NAMESPACE,
        { [USAGE_RESET_PUSH_PREFERENCE_KEY]: value },
        { accountEpoch: session.account, signal: session.controller.signal },
      ).then(
        () => {
          if (!live(session)) return;
          setUsageSaving(false);
          mirrorUsageResetOnDevice(value);
        },
        () => {
          if (!live(session)) return;
          setUsageSaving(false);
          setUsageEnabled(previous);
          setUsageError(USAGE_RESET_SAVE_FAILED);
        },
      );
    },
    [live, status, usageEnabled, usageSaving],
  );

  const writeBrief = useCallback(
    (
      optimistic: DailyBriefState,
      write: (session: ReminderSession) => Promise<DailyBriefState>,
      failure: string,
    ) => {
      const session = sessionRef.current;
      if (!session || status !== 'ready' || !briefLoaded || briefSaving) return;
      const previous = brief;
      setBrief(optimistic);
      setBriefSaving(true);
      setBriefError(null);
      write(session).then(
        (next) => {
          if (!live(session)) return;
          setBrief(next);
          setBriefSaving(false);
          void useScheduleStore.getState().fetchSchedules();
        },
        () => {
          if (!live(session)) return;
          setBrief(previous);
          setBriefSaving(false);
          setBriefError(failure);
        },
      );
    },
    [brief, briefLoaded, briefSaving, live, status],
  );

  const rememberScheduleId = useCallback(
    (session: ReminderSession) => (scheduleId: string) =>
      patchPreferenceNamespace(
        ACCOUNT_NOTIFICATION_PREFERENCES_NAMESPACE,
        { [DAILY_BRIEF_SCHEDULE_PREFERENCE_KEY]: scheduleId },
        { accountEpoch: session.account, signal: session.controller.signal },
      ),
    [],
  );

  const turnOn = useCallback(
    (timeOfDay: string) =>
      writeBrief(
        { ...brief, enabled: true, timeOfDay },
        (session) =>
          turnOnDailyBrief(brief, timeOfDay, deviceTimezone(), {
            rememberScheduleId: rememberScheduleId(session),
          }),
        DAILY_BRIEF_SETUP_FAILED,
      ),
    [brief, rememberScheduleId, writeBrief],
  );

  const turnOff = useCallback(
    () =>
      writeBrief(
        { ...brief, enabled: false },
        () => turnOffDailyBrief(brief),
        DAILY_BRIEF_PAUSE_FAILED,
      ),
    [brief, writeBrief],
  );

  const changeTime = useCallback(
    (timeOfDay: string) => {
      if (!brief.enabled) return;
      writeBrief(
        { ...brief, timeOfDay },
        (session) =>
          turnOnDailyBrief(brief, timeOfDay, deviceTimezone(), {
            rememberScheduleId: rememberScheduleId(session),
          }),
        DAILY_BRIEF_TIME_FAILED,
      );
    },
    [brief, rememberScheduleId, writeBrief],
  );

  const signedInCloud = status === 'loading' || status === 'ready' || status === 'error';

  return {
    status,
    retry,
    usageReset: {
      enabled: usageEnabled,
      saving: usageSaving,
      error: usageError,
      setEnabled: setUsageReset,
    },
    dailyBrief: {
      shown: signedInCloud ? dailyBriefAvailable(tier) : FEATURES.schedules,
      loaded: briefLoaded,
      state: brief,
      saving: briefSaving,
      error: briefError,
      turnOn,
      turnOff,
      changeTime,
    },
  };
}
