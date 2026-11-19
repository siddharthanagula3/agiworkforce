import * as Haptics from 'expo-haptics';
import { useSettingsStore } from '@/stores/settingsStore';

export function preferredImpactHaptic(style: Haptics.ImpactFeedbackStyle): void {
  if (!useSettingsStore.getState().hapticsEnabled) return;
  void Haptics.impactAsync(style);
}

export function preferredNotificationHaptic(type: Haptics.NotificationFeedbackType): void {
  if (!useSettingsStore.getState().hapticsEnabled) return;
  void Haptics.notificationAsync(type);
}
