import { View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Settings, Smartphone } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { SidebarHeader } from './SidebarHeader';
import { ConversationList } from './ConversationList';
import { colors } from '@/lib/theme';

/**
 * Full sidebar drawer content: header + conversation list + footer nav.
 * Renders inside expo-router Drawer as the drawerContent prop.
 */
export function SidebarContent() {
  return (
    <View className="flex-1" style={{ backgroundColor: '#131514' }}>
      <SidebarHeader />
      <ConversationList />
      <SidebarFooter />
    </View>
  );
}

function SidebarFooter() {
  const router = useRouter();

  return (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingVertical: 8,
        paddingHorizontal: 8,
        gap: 2,
      }}
    >
      <FooterItem
        icon={<Smartphone size={16} color={colors.textMuted} />}
        label="Desktop Companion"
        onPress={() => router.push('/(app)/companion')}
      />
      <FooterItem
        icon={<Settings size={16} color={colors.textMuted} />}
        label="Settings"
        onPress={() => router.push('/(app)/settings')}
      />
    </View>
  );
}

interface FooterItemProps {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
}

function FooterItem({ icon, label, onPress }: FooterItemProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 8,
        backgroundColor: pressed ? 'rgba(255,255,255,0.05)' : 'transparent',
      })}
      accessibilityRole="button"
    >
      {icon}
      <Text style={{ fontSize: 14, color: colors.textSecondary }}>{label}</Text>
    </Pressable>
  );
}
