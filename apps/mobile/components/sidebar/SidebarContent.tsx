import { useState } from 'react';
import { View, Pressable, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { Settings, Smartphone, Search } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { SidebarHeader } from './SidebarHeader';
import { ConversationList } from './ConversationList';
import { colors } from '@/lib/theme';

/**
 * Full sidebar drawer content: header + conversation list + footer nav.
 * Renders inside expo-router Drawer as the drawerContent prop.
 */
export function SidebarContent() {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <View className="flex-1" style={{ backgroundColor: '#131514' }}>
      <SidebarHeader />
      <View style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: 'rgba(255,255,255,0.06)',
            borderRadius: 10,
            paddingHorizontal: 10,
            paddingVertical: 8,
            gap: 8,
          }}
        >
          <Search size={15} color="rgba(255,255,255,0.3)" />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search conversations..."
            placeholderTextColor="rgba(255,255,255,0.25)"
            style={{ flex: 1, color: 'white', fontSize: 14 }}
          />
        </View>
      </View>
      <ConversationList searchQuery={searchQuery} />
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
      accessibilityLabel={label}
    >
      {icon}
      <Text style={{ fontSize: 14, color: colors.textSecondary }}>{label}</Text>
    </Pressable>
  );
}
