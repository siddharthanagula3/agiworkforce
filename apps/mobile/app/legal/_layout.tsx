import { Stack } from 'expo-router';
import { useThemeColors } from '@/src/ui/theme';

export default function LegalLayout() {
  const colors = useThemeColors();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surfaceBase },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { color: colors.textPrimary },
        contentStyle: { backgroundColor: colors.surfaceBase },
      }}
    >
      <Stack.Screen name="article-50" options={{ title: 'EU AI Act Article 50' }} />
    </Stack>
  );
}
