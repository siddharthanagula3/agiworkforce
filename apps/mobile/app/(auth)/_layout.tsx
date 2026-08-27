import { Stack } from 'expo-router';
import { useThemeColors } from '@/src/ui/theme';

export { default as ErrorBoundary } from './error';

export default function AuthLayout() {
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
