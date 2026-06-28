import { Stack } from 'expo-router';
import { useThemeColors } from '@/src/ui/theme';

export default function AuthLayout() {
  // Use the live theme hook so the auth background correctly tracks the
  // system dark/light mode rather than being frozen at the static default.
  const colors = useThemeColors();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'fade',
      }}
    />
  );
}
