import { AppState, Platform } from 'react-native';
import { storage } from '@/lib/mmkv';

export type PushPermissionStatus = 'granted' | 'denied' | 'undetermined';

export interface NativePushPermission {
  status: string;
  canAskAgain?: boolean;
  granted?: boolean;
}

const ANDROID_NOTIFICATION_PROMPT_API = 33;
const PUSH_PROMPT_RECORD_KEY = 'push.permission.prompt';

type PushPromptRecord = 'dismissed' | 'settled';

function readPromptRecord(): PushPromptRecord | undefined {
  const value = storage.getString(PUSH_PROMPT_RECORD_KEY);
  return value === 'dismissed' || value === 'settled' ? value : undefined;
}

function hasAndroidNotificationPrompt(): boolean {
  return Platform.OS === 'android' && Number(Platform.Version) >= ANDROID_NOTIFICATION_PROMPT_API;
}

// Expo reports canAskAgain false whenever a denied result came back with no
// rationale to show. Android gives no rationale both after a second refusal and
// after a first prompt closed with Back, which does not count as a refusal, so
// only our own record of how the prompt ended tells the two apart.
function statusFor(
  permission: NativePushPermission,
  promptRecord: () => PushPromptRecord | undefined,
): PushPermissionStatus {
  if (permission.status === 'granted') return 'granted';
  if (permission.status === 'undetermined') return 'undetermined';
  if (Platform.OS !== 'android' || permission.granted === true) return 'denied';
  if (permission.canAskAgain === true) return 'undetermined';
  if (!hasAndroidNotificationPrompt()) return 'denied';
  return promptRecord() === 'settled' ? 'denied' : 'undetermined';
}

export function toPushPermissionStatus(permission: NativePushPermission): PushPermissionStatus {
  return statusFor(permission, readPromptRecord);
}

// The Android prompt pauses the activity, so a request during which the app
// never left the foreground came back without the system showing anything. A
// second unanswered result in a row is read as final, so the turn-on control
// can never keep returning without a prompt.
function recordPromptOutcome(
  result: NativePushPermission,
  appLeftForeground: boolean,
): PushPromptRecord | undefined {
  if (result.status === 'undetermined') return readPromptRecord();
  const answered =
    result.status === 'granted' || result.granted === true || result.canAskAgain === true;
  const record: PushPromptRecord =
    !answered && appLeftForeground && readPromptRecord() === undefined ? 'dismissed' : 'settled';
  storage.set(PUSH_PROMPT_RECORD_KEY, record);
  return record;
}

let pendingRequests = 0;

export function isPushPermissionRequestPending(): boolean {
  return pendingRequests > 0;
}

export async function trackPushPermissionRequest(
  request: () => Promise<NativePushPermission>,
): Promise<PushPermissionStatus> {
  pendingRequests += 1;
  const observePrompt = hasAndroidNotificationPrompt();
  let appLeftForeground = false;
  const subscription = observePrompt
    ? AppState.addEventListener('change', (state) => {
        if (state !== 'active') appLeftForeground = true;
      })
    : null;
  try {
    const result = await request();
    if (!observePrompt) return toPushPermissionStatus(result);
    const record = recordPromptOutcome(result, appLeftForeground);
    return statusFor(result, () => record);
  } finally {
    subscription?.remove();
    pendingRequests -= 1;
  }
}
