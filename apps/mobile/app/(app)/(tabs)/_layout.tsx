import { Tabs } from 'expo-router';
import { Home, MessageSquare, Bot, Settings } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';

/**
 * Bottom tab navigator for the main app screens.
 * Four tabs: Home, Chat, Agents, Settings.
 * Each tab has its own stack navigator for drill-down screens.
 */
export default function TabsLayout() {
  const { colors: themeColors } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: themeColors.surfaceElevated,
          borderTopColor: themeColors.border,
          borderTopWidth: 1,
          height: 84,
          paddingBottom: 28,
          paddingTop: 8,
        },
        tabBarActiveTintColor: themeColors.teal,
        tabBarInactiveTintColor: themeColors.textMuted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Home size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: ({ color, size }) => <MessageSquare size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="agents"
        options={{
          title: 'Agents',
          tabBarIcon: ({ color, size }) => <Bot size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Settings size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
