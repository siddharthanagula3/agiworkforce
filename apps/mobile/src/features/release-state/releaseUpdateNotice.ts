import { useEffect } from 'react';
import Constants from 'expo-constants';
import { storage, whenMmkvReady } from '@/lib/mmkv';
import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import { webContentPageUrl } from '@/src/platform/webContentPage';
import { showToast } from '@/src/shared/components/Toast';

const LAST_SEEN_VERSION_KEY = 'agi-last-seen-app-version';

export function releaseNotesUrl(): string {
  return webContentPageUrl('/release-notes');
}

export function noticeForVersion(lastSeen: string | undefined, current: string): string | null {
  if (lastSeen === undefined || lastSeen === current) return null;
  return `AGI Mobile updated to ${current}.`;
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
