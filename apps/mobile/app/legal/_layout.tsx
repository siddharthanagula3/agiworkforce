import { Stack } from 'expo-router';

export default function LegalLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#0f1012' },
        headerTintColor: '#ffffff',
        headerTitleStyle: { color: '#ffffff' },
        contentStyle: { backgroundColor: '#0f1012' },
      }}
    >
      <Stack.Screen name="article-50" options={{ title: 'EU AI Act — Article 50' }} />
    </Stack>
  );
}
