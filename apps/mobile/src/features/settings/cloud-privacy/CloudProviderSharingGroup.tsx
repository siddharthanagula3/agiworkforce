import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { View } from 'react-native';
import { Share2 } from 'lucide-react-native';
import {
  MANAGED_CLOUD_SCHEDULES_MAX_PAGE_OFFSET,
  MANAGED_CLOUD_SCHEDULES_MAX_PAGE_SIZE,
  ManagedCloudAgentRunHttpError,
} from '@agiworkforce/cloud-contracts';
import { COMPANY_SITE_NAME } from '@agiworkforce/types';
import { Text } from '@/components/ui/Text';
import { TIMEOUTS } from '@/lib/constants';
import { FEATURES } from '@/lib/v1FeatureFlags';
import {
  CLOUD_PROVIDER_SHARING_LABEL,
  beginCloudProviderConsentWithdrawal,
  ensureCloudProviderConsent,
  hasCloudProviderConsentForCurrentAccount,
  hasCurrentCloudProviderConsent,
  markCloudProviderConsentWithdrawalStandingWorkPaused,
  withdrawCloudProviderConsent,
} from '@/services/providerConsent';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { SettingsGroup, SettingsSwitchRow } from '@/src/features/settings/Common';
import { SECURITY_LOGIN_SCREEN_TITLE } from '@/src/features/settings/screenTitles';
import { showToast } from '@/src/shared/components/Toast';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

export const CLOUD_PROVIDER_SHARING_TEST_ID = 'settings-cloud-provider-sharing';
export const CLOUD_PROVIDER_SHARING_CAPTION = 'AGI Cloud needs this. Off keeps Local Mode.';
export const STANDING_CLOUD_WORK_NOT_STOPPED = `Some tasks could not be paused, so pause them in ${COMPANY_SITE_NAME} on the web.`;
export const ASK_FROM_SIRI_STILL_ON = `Ask from Siri is still on, so turn it off in ${SECURITY_LOGIN_SCREEN_TITLE}.`;
export const STANDING_CLOUD_WORK_AND_ASK_FROM_SIRI_NOT_STOPPED = `Some tasks and Ask from Siri are still on, so turn them off on the web and in ${SECURITY_LOGIN_SCREEN_TITLE}.`;
export const SHARING_NOT_TURNED_OFF = 'Sharing with AI providers is still on, so try again.';

function counted(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function pausedPhrase(schedules: number, tasks: number): string {
  const paused = [
    ...(schedules > 0 ? [counted(schedules, 'schedule', 'schedules')] : []),
    ...(tasks > 0 ? [counted(tasks, 'running task', 'running tasks')] : []),
  ];
  return `Paused ${paused.join(' and ')}`;
}

export function standingCloudWorkPausedMessage(schedules: number, tasks: number): string {
  return `${pausedPhrase(schedules, tasks)}.`;
}

type Sharing = { allowed: boolean; recorded: boolean };

function readSharing(): Sharing {
  return {
    allowed: hasCurrentCloudProviderConsent(),
    recorded: hasCloudProviderConsentForCurrentAccount(),
  };
}

const RUN_NO_LONGER_WORKING: ReadonlySet<number> = new Set([404, 409]);
const WITHDRAWAL_CONTROL = { withdrawalControl: true } as const;

// Loaded on withdrawal only, so the Privacy page never imports the Cloud clients.
/* eslint-disable @typescript-eslint/no-require-imports */
function schedulesService(): typeof import('@/src/features/schedules/service') {
  return require('@/src/features/schedules/service') as typeof import('@/src/features/schedules/service');
}

function tasksService(): typeof import('@/src/features/tasks/service') {
  return require('@/src/features/tasks/service') as typeof import('@/src/features/tasks/service');
}

function runFilters(): typeof import('@/src/features/tasks/runPresentation') {
  return require('@/src/features/tasks/runPresentation') as typeof import('@/src/features/tasks/runPresentation');
}

function askFromSiri(): typeof import('@/src/features/siri/askIntentToken') {
  return require('@/src/features/siri/askIntentToken') as typeof import('@/src/features/siri/askIntentToken');
}

function cloudModeDoor(): typeof import('@/src/features/chat/store/cloudModeDoor') {
  return require('@/src/features/chat/store/cloudModeDoor') as typeof import('@/src/features/chat/store/cloudModeDoor');
}

function liveVoice(): typeof import('@/src/features/voice/hooks/useLiveVoiceSession') {
  return require('@/src/features/voice/hooks/useLiveVoiceSession') as typeof import('@/src/features/voice/hooks/useLiveVoiceSession');
}

function chatExecution(): typeof import('@/stores/chat/chatExecutionStore') {
  return require('@/stores/chat/chatExecutionStore') as typeof import('@/stores/chat/chatExecutionStore');
}
/* eslint-enable @typescript-eslint/no-require-imports */

async function countPaused(work: readonly Promise<boolean>[]): Promise<number> {
  const results = await Promise.allSettled(work);
  if (results.some((result) => result.status === 'rejected'))
    throw new Error('Some Cloud work was not paused');
  return results.filter((result) => result.status === 'fulfilled' && result.value).length;
}

async function pauseActiveSchedules(): Promise<number> {
  if (!FEATURES.schedules) return 0;
  const { fetchSchedulePage, toggleSchedule } = schedulesService();
  let paused = 0;
  for (let offset = 0; ;) {
    if (offset > MANAGED_CLOUD_SCHEDULES_MAX_PAGE_OFFSET)
      throw new Error('Some Cloud work was not paused');
    const page = await fetchSchedulePage(offset, WITHDRAWAL_CONTROL);
    paused += await countPaused(
      page
        .filter((schedule) => schedule.isActive)
        .map((schedule) => toggleSchedule(schedule.id, false, WITHDRAWAL_CONTROL).then(() => true)),
    );
    if (page.length < MANAGED_CLOUD_SCHEDULES_MAX_PAGE_SIZE) return paused;
    offset += page.length;
  }
}

function pauseRun(runId: string): Promise<boolean> {
  return tasksService()
    .pauseCloudRun(runId, undefined, WITHDRAWAL_CONTROL)
    .then(
      () => true,
      (error: unknown) => {
        if (
          error instanceof ManagedCloudAgentRunHttpError &&
          RUN_NO_LONGER_WORKING.has(error.status)
        ) {
          return false;
        }
        throw error;
      },
    );
}

async function pauseRunningTasks(): Promise<number> {
  const { listCloudRuns } = tasksService();
  const states = runFilters().cloudRunFilterStates('running');
  let paused = 0;
  let cursor: string | undefined;
  do {
    const page = await listCloudRuns({
      states,
      ...(cursor ? { cursor } : {}),
      ...WITHDRAWAL_CONTROL,
    });
    paused += await countPaused(page.runs.map((run) => pauseRun(run.id)));
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return paused;
}

function withinCleanupWindow<T>(work: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Cloud work did not stop in time')),
      TIMEOUTS.SIGN_OUT_CLEANUP,
    );
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function stopCloudAnswers(): readonly string[] {
  let stoppedRunIds: readonly string[] = [];
  try {
    liveVoice().endLiveVoiceSessions();
  } catch (error) {
    console.warn('[CloudProviderSharingGroup] live voice could not be ended:', error);
  }
  try {
    stoppedRunIds = chatExecution().stopEveryCloudStream();
  } catch (error) {
    console.warn('[CloudProviderSharingGroup] an answer could not be stopped:', error);
  }
  return stoppedRunIds;
}

async function pauseStoppedRuns(runIds: readonly string[]): Promise<void> {
  if (runIds.length === 0) return;
  try {
    await withinCleanupWindow(Promise.all(runIds.map(pauseRun)));
  } catch (error) {
    console.warn(
      '[CloudProviderSharingGroup] a run this device was driving was not paused:',
      error,
    );
  }
}

type StandingWork = 'not-paused' | { schedules: number; tasks: number };

async function pauseStandingCloudWork(): Promise<StandingWork> {
  try {
    const [schedules, tasks] = await withinCleanupWindow(
      Promise.all([pauseActiveSchedules(), pauseRunningTasks()]),
    );
    return { schedules, tasks };
  } catch {
    return 'not-paused';
  }
}

function askFromSiriStillOn(): boolean {
  try {
    return askFromSiri().isAskFromSiriEnabled();
  } catch {
    return true;
  }
}

function withdrawalMessage(standingWork: StandingWork): string | null {
  const siriOn = askFromSiriStillOn();
  if (standingWork === 'not-paused') {
    return siriOn
      ? STANDING_CLOUD_WORK_AND_ASK_FROM_SIRI_NOT_STOPPED
      : STANDING_CLOUD_WORK_NOT_STOPPED;
  }
  const paused =
    standingWork.schedules + standingWork.tasks > 0
      ? pausedPhrase(standingWork.schedules, standingWork.tasks)
      : null;
  if (siriOn) return paused ? `${paused}, but ${ASK_FROM_SIRI_STILL_ON}` : ASK_FROM_SIRI_STILL_ON;
  return paused ? `${paused}.` : null;
}

const NOTHING_TO_PAUSE: StandingWork = { schedules: 0, tasks: 0 };

export type SharingWithdrawalScope = 'account' | 'this-device';

export async function withdrawSharingWithProviders(
  scope: SharingWithdrawalScope = 'account',
): Promise<void> {
  const reachesStandingWork = scope === 'account' && hasCloudProviderConsentForCurrentAccount();
  let standingWork: StandingWork = reachesStandingWork ? 'not-paused' : NOTHING_TO_PAUSE;
  try {
    beginCloudProviderConsentWithdrawal();
    const stoppedRunIds = stopCloudAnswers();
    const drivenRunsPaused = scope === 'this-device' ? pauseStoppedRuns(stoppedRunIds) : null;
    await withinCleanupWindow(cloudModeDoor().askFromSiriTokenForgotten()).catch(() => undefined);
    if (reachesStandingWork) standingWork = await pauseStandingCloudWork();
    await drivenRunsPaused;
    if (standingWork !== 'not-paused') markCloudProviderConsentWithdrawalStandingWorkPaused();
  } finally {
    withdrawCloudProviderConsent();
  }
  await withinCleanupWindow(cloudModeDoor().askFromSiriTurnedOff()).catch(() => undefined);
  if (scope === 'this-device') return;
  const message = withdrawalMessage(standingWork);
  if (message) showToast(message);
}

function sharingStillAllowed(): boolean {
  try {
    return hasCurrentCloudProviderConsent();
  } catch {
    return true;
  }
}

export function CloudProviderSharingGroup() {
  const colors = useThemeColors();
  const isCloud = useChatAppModeStore((s) => s.appMode) === 'cloud';
  const [sharing, setSharing] = useState<Sharing>(readSharing);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setSharing(readSharing());
    }, []),
  );

  const follow = useCallback(() => {
    setSharing((current) => {
      const next = readSharing();
      return { allowed: next.allowed, recorded: current.recorded || next.recorded };
    });
  }, []);

  const allow = useCallback(async () => {
    setBusy(true);
    await ensureCloudProviderConsent().catch(() => false);
    setBusy(false);
    follow();
  }, [follow]);

  const withdraw = useCallback(async () => {
    setBusy(true);
    setSharing((current) => ({ ...current, allowed: false }));
    try {
      await withdrawSharingWithProviders();
    } catch (error) {
      console.warn('[CloudProviderSharingGroup] the withdrawal did not finish:', error);
      if (sharingStillAllowed()) showToast(SHARING_NOT_TURNED_OFF);
    } finally {
      setBusy(false);
      follow();
    }
  }, [follow]);

  const onValueChange = useCallback(
    (next: boolean) => {
      void (next ? allow() : withdraw());
    },
    [allow, withdraw],
  );

  if (!isCloud && !sharing.recorded) return null;

  return (
    <View style={{ marginBottom: 18 }}>
      <Text
        accessibilityRole="header"
        style={{
          color: colors.textMuted,
          fontSize: typeScale.caption,
          fontWeight: '700',
          textTransform: 'uppercase',
          marginBottom: 8,
          paddingHorizontal: 2,
        }}
      >
        AI providers
      </Text>
      <SettingsGroup>
        <SettingsSwitchRow
          testID={CLOUD_PROVIDER_SHARING_TEST_ID}
          label={CLOUD_PROVIDER_SHARING_LABEL}
          icon={Share2}
          value={sharing.allowed}
          onValueChange={onValueChange}
          disabled={busy}
          isLast
        />
      </SettingsGroup>
      <Text
        style={{
          color: colors.textMuted,
          fontSize: typeScale.caption,
          lineHeight: 17,
          marginTop: 8,
          paddingHorizontal: 2,
        }}
      >
        {CLOUD_PROVIDER_SHARING_CAPTION}
      </Text>
    </View>
  );
}
