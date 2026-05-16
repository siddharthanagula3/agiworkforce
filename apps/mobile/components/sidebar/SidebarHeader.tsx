import { useState, useCallback } from 'react';
import { View, Pressable, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { SquarePen, Search, X } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useChatStore } from '@/stores/chatStore';
import { colors } from '@/lib/theme';

interface SidebarHeaderProps {
  onSearchChange?: (query: string) => void;
}

export function SidebarHeader({ onSearchChange }: SidebarHeaderProps) {
  const router = useRouter();
  const createConversation = useChatStore((s) => s.createConversation);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const handleNewChat = useCallback(async () => {
    try {
      await createConversation('New Chat');
      router.push({ pathname: '/(app)' as const });
    } catch {
      // If creation fails, still navigate to home where the input is
      router.push({ pathname: '/(app)' as const });
    }
  }, [createConversation, router]);

  const handleSearchChange = useCallback(
    (text: string) => {
      setSearchQuery(text);
      onSearchChange?.(text);
    },
    [onSearchChange],
  );

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    onSearchChange?.('');
  }, [onSearchChange]);

  return (
    <View className="px-4 pt-14 pb-3 gap-3 border-b border-white/5">
      <View className="flex-row items-center justify-between">
        <Text variant="subheading">AGI Workforce</Text>
        <Pressable
          onPress={handleNewChat}
          className="p-2 rounded-lg active:bg-white/5"
          accessibilityLabel="New chat"
          accessibilityRole="button"
        >
          <SquarePen size={20} color={colors.teal} />
        </Pressable>
      </View>

      {/* Search bar */}
      <View className="flex-row items-center gap-2 h-9 px-3 rounded-lg bg-white/5">
        <Search size={14} color={colors.textMuted} />
        <TextInput
          value={searchQuery}
          onChangeText={handleSearchChange}
          onFocus={() => setIsSearchFocused(true)}
          onBlur={() => setIsSearchFocused(false)}
          placeholder="Search conversations..."
          placeholderTextColor="rgba(255,255,255,0.3)"
          style={{
            flex: 1,
            fontSize: 13,
            color: colors.textPrimary,
            paddingVertical: 0,
          }}
          returnKeyType="search"
          accessibilityLabel="Search conversations"
          accessibilityRole="search"
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={handleClearSearch} accessibilityLabel="Clear search">
            <X size={14} color={colors.textMuted} />
          </Pressable>
        )}
      </View>
    </View>
  );
}
