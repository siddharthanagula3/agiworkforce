import { useCallback } from 'react';
import { View, TextInput, Pressable } from 'react-native';
import { Search, X } from 'lucide-react-native';
import { colors } from '@/lib/theme';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}

export function SearchBar({
  value,
  onChangeText,
  placeholder = 'Search conversations...',
}: SearchBarProps) {
  const handleClear = useCallback(() => {
    onChangeText('');
  }, [onChangeText]);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surfaceElevated,
        borderRadius: 10,
        paddingHorizontal: 10,
        marginHorizontal: 12,
        marginVertical: 8,
        height: 38,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Search size={16} color={colors.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        style={{
          flex: 1,
          marginLeft: 8,
          fontSize: 14,
          color: colors.textPrimary,
        }}
        selectionColor={colors.teal}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Search conversations"
      />
      {value.length > 0 && (
        <Pressable
          onPress={handleClear}
          style={{ padding: 4 }}
          accessibilityLabel="Clear search"
          accessibilityRole="button"
        >
          <X size={16} color={colors.textMuted} />
        </Pressable>
      )}
    </View>
  );
}
