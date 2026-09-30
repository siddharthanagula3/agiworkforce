import { useMemo, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Modal, Platform, TextInput, View } from 'react-native';
import { Check, Globe, X } from 'lucide-react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { dialogPadding, useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

interface TimezonePickerFieldProps {
  value: string;
  deviceTimezone: string;
  onChange: (timezone: string) => void;
  error?: string;
}

function listTimezones(deviceTimezone: string, current: string): string[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: 'timeZone') => string[] };
  const zones =
    typeof intl.supportedValuesOf === 'function' ? intl.supportedValuesOf('timeZone') : [];
  return Array.from(new Set([deviceTimezone, current, ...zones].filter(Boolean)));
}

function zoneOffsetLabel(timezone: string): string {
  try {
    const part = new Intl.DateTimeFormat(undefined, { timeZone: timezone, timeZoneName: 'short' })
      .formatToParts(new Date())
      .find((entry) => entry.type === 'timeZoneName');
    return part?.value ?? '';
  } catch {
    return '';
  }
}

export function TimezonePickerField({
  value,
  deviceTimezone,
  onChange,
  error,
}: TimezonePickerFieldProps) {
  const colors = useThemeColors();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const zones = useMemo(() => listTimezones(deviceTimezone, value), [deviceTimezone, value]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase().replace(/\s+/g, '_');
    return needle ? zones.filter((zone) => zone.toLowerCase().includes(needle)) : zones;
  }, [query, zones]);

  const choose = (zone: string) => {
    onChange(zone);
    setOpen(false);
    setQuery('');
  };

  return (
    <View>
      <Text className="text-sm text-white/70 mb-2">Time zone</Text>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Time zone: ${value}`}
        accessibilityHint="Opens a list of time zones"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          minHeight: 44,
          paddingHorizontal: 12,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: error ? colors.agentError : colors.border,
          backgroundColor: colors.surfaceElevated,
        }}
      >
        <Globe size={16} color={colors.textMuted} />
        <Text style={{ flex: 1, color: colors.textPrimary, fontSize: typeScale.body }}>
          {value.replace(/_/g, ' ')}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: typeScale.footnote }}>
          {zoneOffsetLabel(value)}
        </Text>
      </Pressable>
      {error ? <Text className="text-xs text-red-400 mt-1">{error}</Text> : null}

      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        accessibilityViewIsModal
        onRequestClose={() => setOpen(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={{ flex: 1, backgroundColor: colors.surfaceBase, padding: dialogPadding }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <Text
                accessibilityRole="header"
                style={{
                  flex: 1,
                  color: colors.textPrimary,
                  fontSize: typeScale.headline,
                  fontWeight: '600',
                }}
              >
                Time zone
              </Text>
              <Pressable
                onPress={() => setOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Close time zones"
                style={{
                  minWidth: 44,
                  minHeight: 44,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={18} color={colors.textMuted} />
              </Pressable>
            </View>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search time zones"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Search time zones"
              style={{
                minHeight: 44,
                paddingHorizontal: 12,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: colors.border,
                color: colors.textPrimary,
                marginBottom: 8,
              }}
            />
            <FlatList
              data={filtered}
              keyExtractor={(zone) => zone}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => choose(item)}
                  accessibilityRole="button"
                  accessibilityLabel={item.replace(/_/g, ' ')}
                  accessibilityState={{ selected: item === value }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    minHeight: 44,
                    paddingVertical: 8,
                    gap: 8,
                  }}
                >
                  <Text style={{ flex: 1, color: colors.textPrimary, fontSize: typeScale.body }}>
                    {item.replace(/_/g, ' ')}
                    {item === deviceTimezone ? '  (this device)' : ''}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: typeScale.footnote }}>
                    {zoneOffsetLabel(item)}
                  </Text>
                  {item === value ? <Check size={16} color={colors.teal} /> : null}
                </Pressable>
              )}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
