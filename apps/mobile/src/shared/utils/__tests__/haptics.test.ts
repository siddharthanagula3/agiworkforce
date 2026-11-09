const mockImpactAsync = jest.fn().mockResolvedValue(undefined);
const mockNotificationAsync = jest.fn().mockResolvedValue(undefined);

jest.mock('expo-haptics', () => ({
  impactAsync: (...args: unknown[]) => mockImpactAsync(...args),
  notificationAsync: (...args: unknown[]) => mockNotificationAsync(...args),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));

import * as Haptics from 'expo-haptics';
import { useSettingsStore } from '@/stores/settingsStore';
import { preferredImpactHaptic, preferredNotificationHaptic } from '../haptics';

describe('preferred haptics', () => {
  beforeEach(() => {
    mockImpactAsync.mockClear();
    mockNotificationAsync.mockClear();
  });

  afterAll(() => {
    useSettingsStore.setState({ hapticsEnabled: true });
  });

  it('does not reach the native haptic API when Haptic Feedback is off', () => {
    useSettingsStore.setState({ hapticsEnabled: false });

    preferredImpactHaptic(Haptics.ImpactFeedbackStyle.Light);
    preferredNotificationHaptic(Haptics.NotificationFeedbackType.Success);

    expect(mockImpactAsync).not.toHaveBeenCalled();
    expect(mockNotificationAsync).not.toHaveBeenCalled();
  });

  it('plays the requested feedback when Haptic Feedback is on', () => {
    useSettingsStore.setState({ hapticsEnabled: true });

    preferredImpactHaptic(Haptics.ImpactFeedbackStyle.Medium);
    preferredNotificationHaptic(Haptics.NotificationFeedbackType.Error);

    expect(mockImpactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Medium);
    expect(mockNotificationAsync).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Error);
  });
});
