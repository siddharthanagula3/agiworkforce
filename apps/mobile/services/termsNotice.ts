import { Alert, Linking } from 'react-native';
import { API_URL } from '@/lib/constants';
import { storage } from '@/lib/mmkv';

export const TERMS_NOTICE_HEADER = 'X-AGI-Terms-Notice';
export const TERMS_REQUIRED_FROM_HEADER = 'X-AGI-Terms-Required-From';
const SEEN_KEY = 'terms.notice.seen';

/**
 * The gateway names a newer Terms of Service version on a turn from an account
 * that accepted an older one. Continued use accepts it, as with ChatGPT and
 * Claude, so this is told once per version, not asked; a pending material
 * revision also names the date after which it must be accepted.
 */
export function surfaceTermsNotice(headers: { get(name: string): string | null }): void {
  const version = headers.get(TERMS_NOTICE_HEADER)?.trim();
  if (!version) return;
  try {
    if (storage.getString(SEEN_KEY) === version) return;
    storage.set(SEEN_KEY, version);
  } catch {
    return;
  }
  const requiredFrom = Date.parse(headers.get(TERMS_REQUIRED_FROM_HEADER) ?? '');
  const message = Number.isFinite(requiredFrom)
    ? `Our Terms of Service were updated. Accept them by ${new Date(requiredFrom).toLocaleDateString()} to keep chatting.`
    : 'Our Terms of Service were updated. Using AGI Workforce means you accept them.';
  Alert.alert('Terms of Service updated', message, [
    { text: 'OK', style: 'cancel' },
    {
      text: 'Read terms',
      onPress: () => {
        Linking.openURL(`${new URL(API_URL).origin}/terms`).catch(() => undefined);
      },
    },
  ]);
}
