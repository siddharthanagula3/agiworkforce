import { Tabs } from 'expo-router';

/**
 * Tab navigator -- hidden (no visible tab bar).
 *
 * The bottom tab bar has been replaced by the app-level drawer navigator.
 * This layout is retained for route compatibility so that existing routes
 * like /(app)/(tabs)/chat, /(app)/(tabs)/projects, and /(app)/(tabs)/settings
 * continue to resolve correctly. The tab bar is fully hidden.
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: 'none' },
      }}
    >
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="chat" />
      <Tabs.Screen name="projects" />
      <Tabs.Screen name="agents" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}
