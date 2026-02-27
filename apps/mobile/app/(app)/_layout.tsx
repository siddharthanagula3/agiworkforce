import { useWindowDimensions } from 'react-native';
import { Drawer } from 'expo-router/drawer';
import { MessageSquarePlus, Bot, Smartphone, Settings, MessageCircle, Calendar } from 'lucide-react-native';
import { colors } from '@/lib/theme';
import { SidebarContent } from '@/components/sidebar/SidebarContent';

export default function AppLayout() {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  return (
    <Drawer
      drawerContent={() => <SidebarContent />}
      screenOptions={{
        headerShown: false,
        drawerType: isTablet ? 'permanent' : 'front',
        drawerStyle: {
          backgroundColor: '#131514',
          width: isTablet ? 300 : 280,
          borderRightColor: colors.border,
          borderRightWidth: 1,
        },
        overlayColor: 'rgba(0,0,0,0.5)',
        swipeEnabled: !isTablet,
      }}
    >
      <Drawer.Screen
        name="index"
        options={{
          drawerLabel: 'New Chat',
          drawerIcon: ({ color, size }) => <MessageSquarePlus size={size} color={color} />,
        }}
      />
      <Drawer.Screen
        name="chat/[id]"
        options={{ drawerItemStyle: { display: 'none' } }}
      />
      <Drawer.Screen
        name="agents/index"
        options={{
          drawerLabel: 'Agents',
          drawerIcon: ({ color, size }) => <Bot size={size} color={color} />,
        }}
      />
      <Drawer.Screen
        name="companion/index"
        options={{
          drawerLabel: 'Desktop',
          drawerIcon: ({ color, size }) => <Smartphone size={size} color={color} />,
        }}
      />
      <Drawer.Screen
        name="messaging/index"
        options={{
          drawerLabel: 'Messaging',
          drawerIcon: ({ color, size }) => <MessageCircle size={size} color={color} />,
        }}
      />
      <Drawer.Screen
        name="schedules/index"
        options={{
          drawerLabel: 'Schedules',
          drawerIcon: ({ color, size }) => <Calendar size={size} color={color} />,
        }}
      />
      <Drawer.Screen
        name="settings/index"
        options={{
          drawerLabel: 'Settings',
          drawerIcon: ({ color, size }) => <Settings size={size} color={color} />,
        }}
      />
      {/* Hidden routes */}
      <Drawer.Screen
        name="schedules/create"
        options={{ drawerItemStyle: { display: 'none' } }}
      />
      <Drawer.Screen
        name="settings/memory"
        options={{ drawerItemStyle: { display: 'none' } }}
      />
    </Drawer>
  );
}
