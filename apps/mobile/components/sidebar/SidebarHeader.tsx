import { View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { SquarePen, Search } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { colors } from '@/lib/theme';

export function SidebarHeader() {
  const router = useRouter();

  return (
    <View className="px-4 pt-14 pb-3 gap-3">
      <View className="flex-row items-center justify-between">
        <Text variant="subheading">AGI Workforce</Text>
        <Pressable
          onPress={() => router.push('/(app)')}
          className="p-2 rounded-lg active:bg-white/5"
        >
          <SquarePen size={20} color={colors.teal} />
        </Pressable>
      </View>

      {/* Search bar placeholder */}
      <Pressable className="flex-row items-center gap-2 h-9 px-3 rounded-lg bg-white/5">
        <Search size={14} color={colors.textMuted} />
        <Text className="text-xs text-white/30">Search conversations...</Text>
      </Pressable>
    </View>
  );
}
