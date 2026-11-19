import { Alert } from 'react-native';
import { checkContentFilter } from '@/lib/contentFilter';
import { isMinorMode } from '@/src/features/auth/services/ageGate';
import { useSettingsStore } from '@/stores/settingsStore';

export function refuseFilteredSend(content: string): boolean {
  const minorMode = isMinorMode();
  if (!minorMode && !useSettingsStore.getState().reduceSensitiveContent) return false;
  const verdict = checkContentFilter(
    content,
    true,
    minorMode ? 'minor-safe' : 'reduce-sensitive-content',
  );
  if (verdict.allowed) return false;
  Alert.alert('Content not available', verdict.refusal);
  return true;
}
