import { useEffect } from 'react';
import Constants from 'expo-constants';
import { API_URL } from '@/lib/constants';
import { storage, whenMmkvReady } from '@/lib/mmkv';
import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import { showToast } from '@/src/shared/components/Toast';

const LAST_SEEN_VERSION_KEY = 'agi-last-seen-app-version';

export function releaseNotesUrl(): string {
  return `${API_URL.replace(/\/+$/, '')}/release-notes?from=mobile`;
}

export function noticeForVersion(lastSeen: string | undefined, current: string): string | null {
  if (lastSeen === undefined || lastSeen === current) return null;
  return `AGI Workforce updated to ${current}.`;
}

export function useReleaseUpdateNotice(): void {
  useEffect(() => {
    const current = Constants.expoConfig?.version;
    if (!current) return;
    whenMmkvReady(() => {
      const lastSeen = storage.getString(LAST_SEEN_VERSION_KEY);
      storage.set(LAST_SEEN_VERSION_KEY, current);
      const message = noticeForVersion(lastSeen, current);
      if (!message) return;
      showToast(message, {
        label: "What's new",
        onPress: () => void openUntrustedUrlInAppBrowser(releaseNotesUrl()),
      });
    });
  }, []);
}
