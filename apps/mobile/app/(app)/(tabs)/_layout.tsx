import { Tabs } from 'expo-router';
import { TimeFocusReminder } from '@/src/features/settings/notifications/TimeFocusReminder';

export default function TabsLayout() {
  return (
    <>
      <TimeFocusReminder />
      <Tabs
        tabBar={() => null}
        screenOptions={{
          headerShown: false,
          tabBarStyle: { display: 'none' },
        }}
      >
        <Tabs.Screen name="index" options={{ href: null }} />
        <Tabs.Screen name="chat" />
        <Tabs.Screen name="projects" />
        <Tabs.Screen name="settings" />
      </Tabs>
    </>
  );
}
