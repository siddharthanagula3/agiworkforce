import { useEffect } from 'react';
import { Pressable } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useSettingsStore } from '@/stores/settingsStore';

interface SwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
}

export function Switch({ value, onValueChange }: SwitchProps) {
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const translateX = useSharedValue(value ? 20 : 2);

  // Sync thumb position when the `value` prop changes externally
  // (e.g. when the parent re-renders with a new value from a store).
  useEffect(() => {
    translateX.value = withSpring(value ? 20 : 2, { damping: 15, stiffness: 200 });
  }, [value, translateX]);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const handleToggle = () => {
    const newValue = !value;
    translateX.value = withSpring(newValue ? 20 : 2, { damping: 15, stiffness: 200 });
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onValueChange(newValue);
  };

  return (
    <Pressable
      onPress={handleToggle}
      className={`w-[44px] h-[24px] rounded-full justify-center ${
        value ? 'bg-teal-500' : 'bg-white/20'
      }`}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
    >
      <Animated.View style={thumbStyle} className="w-5 h-5 rounded-full bg-white shadow-sm" />
    </Pressable>
  );
}
