import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Platform, TextInput, View } from 'react-native';
import { ChevronRight, Search, X } from 'lucide-react-native';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import type { SettingsSearchEntry } from '@/src/features/settings/settingsSearchEntries';
import { cardRadius, useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

export const SETTINGS_SEARCH_LABEL = 'Search settings';
const CLEAR_SETTINGS_SEARCH_LABEL = 'Clear settings search';

export function SettingsSearchField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const colors = useThemeColors();

  return (
    <View
      style={{
        minHeight: 44,
        borderRadius: 14,
        paddingHorizontal: 13,
        paddingVertical: 8,
        marginBottom: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 9,
        backgroundColor: colors.inputSurface,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Search size={17} color={colors.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={SETTINGS_SEARCH_LABEL}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={SETTINGS_SEARCH_LABEL}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        maxFontSizeMultiplier={2}
        style={{ flex: 1, color: colors.textPrimary, fontSize: typeScale.body, paddingVertical: 0 }}
      />
      {value.length > 0 ? (
        <Pressable
          onPress={() => onChange('')}
          accessibilityRole="button"
          accessibilityLabel={CLEAR_SETTINGS_SEARCH_LABEL}
          hitSlop={8}
          style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}
        >
          <X size={16} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function SettingsSearchResults({
  query,
  results,
}: {
  query: string;
  results: SettingsSearchEntry[];
}) {
  const colors = useThemeColors();
  const isEmpty = results.length === 0;
  const emptyMessage = `No settings match "${query.trim()}"`;
  const emptyMessageRef = useRef(emptyMessage);
  emptyMessageRef.current = emptyMessage;

  useEffect(() => {
    if (isEmpty && Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(emptyMessageRef.current);
    }
  }, [isEmpty]);

  if (isEmpty) {
    return (
      <Text
        accessibilityLiveRegion="polite"
        style={{
          color: colors.textMuted,
          fontSize: typeScale.body,
          textAlign: 'center',
          paddingVertical: 32,
          paddingHorizontal: 16,
        }}
      >
        {emptyMessage}
      </Text>
    );
  }

  return (
    <View
      style={{
        borderRadius: cardRadius,
        backgroundColor: colors.surfaceElevated,
        overflow: 'hidden',
        marginBottom: 24,
      }}
    >
      {results.map((result, index) => (
        <Pressable
          key={result.key}
          onPress={result.onPress}
          accessibilityRole="button"
          accessibilityLabel={[result.title, result.subtitle, result.value]
            .filter(Boolean)
            .join('. ')}
          accessibilityHint={`Opens ${result.title}`}
          style={{
            minHeight: 56,
            paddingHorizontal: 14,
            paddingVertical: 8,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            borderBottomWidth: index === results.length - 1 ? 0 : 1,
            borderBottomColor: colors.border,
          }}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: colors.textPrimary, fontSize: typeScale.body }}>
              {result.title}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: typeScale.footnote }}>
              {result.subtitle}
            </Text>
          </View>
          {result.value ? (
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={2}
              style={{ color: colors.textMuted, fontSize: typeScale.footnote, flexShrink: 1 }}
            >
              {result.value}
            </Text>
          ) : null}
          <ChevronRight size={17} color={colors.textMuted} />
        </Pressable>
      ))}
    </View>
  );
}
