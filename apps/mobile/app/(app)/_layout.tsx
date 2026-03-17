import { Stack } from 'expo-router';
import { colors } from '@/lib/theme';

/**
 * App layout -- Stack navigator wrapping the entire authenticated section.
 *
 * Navigation structure:
 *   (tabs)/     -- Bottom tab bar (Home, Chat, Agents, Settings)
 *   chat/[id]   -- Full chat conversation (pushes on top of tabs)
 *   agents/[id] -- Agent detail view
 *   companion/  -- QR pairing + desktop companion
 *   profile/    -- User profile
 *   schedules/  -- Schedule management
 *   settings/memory -- Memory management
 *   messaging/  -- External messaging
 *
 * The drawer was replaced with bottom tabs for easier thumb-reach navigation
 * on mobile. The sidebar conversation list lives inside the Chat tab.
 */
export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'slide_from_right',
      }}
    >
      {/* Redirect index */}
      <Stack.Screen name="index" options={{ animation: 'none' }} />

      {/* Tab navigator */}
      <Stack.Screen name="(tabs)" options={{ animation: 'none' }} />

      {/* Stack screens pushed on top of tabs */}
      <Stack.Screen name="chat/[id]" />
      <Stack.Screen name="agents/[id]" />
      <Stack.Screen name="agents/index" />
      <Stack.Screen name="companion/index" />
      <Stack.Screen name="profile/index" />
      <Stack.Screen name="schedules/index" />
      <Stack.Screen name="schedules/create" />
      <Stack.Screen name="settings/index" />
      <Stack.Screen name="settings/memory" />
      <Stack.Screen name="messaging/index" />
    </Stack>
  );
}
