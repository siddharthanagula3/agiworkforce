import { useCallback, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { Bluetooth, Check, Headphones, Volume2, Waves } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  AUDIO_ROUTES,
  AUDIO_ROUTE_HINTS,
  AUDIO_ROUTE_LABELS,
  applyAudioRoute,
  audioRouteSwitchingSupported,
  type AudioRoute,
} from '@/src/features/voice/services/audioRoute';

const ROUTE_ICON = {
  auto: Waves,
  speaker: Volume2,
  bluetooth: Bluetooth,
  headset: Headphones,
} as const satisfies Record<AudioRoute, typeof Waves>;

export function AudioRoutePicker({ compact = false }: { compact?: boolean }) {
  const colors = useThemeColors();
  const route = useSettingsStore((s) => s.audioRoute);
  const setAudioRoute = useSettingsStore((s) => s.setAudioRoute);
  const [open, setOpen] = useState(false);

  const choose = useCallback(
    (next: AudioRoute) => {
      setAudioRoute(next);
      applyAudioRoute(next);
      setOpen(false);
    },
    [setAudioRoute],
  );

  if (!audioRouteSwitchingSupported()) return null;

  const ActiveIcon = ROUTE_ICON[route];

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Audio route, ${AUDIO_ROUTE_LABELS[route]}`}
        accessibilityHint="Choose where this call plays and records"
        testID="audio-route-trigger"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          minWidth: 48,
          height: 48,
          paddingHorizontal: compact ? 0 : 16,
          borderRadius: 999,
          backgroundColor: colors.inputSurface,
        }}
      >
        <ActiveIcon size={20} color={colors.textSecondary} />
        {compact ? null : (
          <Text style={{ color: colors.textMuted, fontSize: 16 }}>{AUDIO_ROUTE_LABELS[route]}</Text>
        )}
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
        accessibilityViewIsModal
      >
        <Pressable
          onPress={() => setOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="Close audio route picker"
          style={{ flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' }}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            accessibilityRole="menu"
            accessibilityLabel="Audio route"
            testID="audio-route-sheet"
            style={{
              backgroundColor: colors.surfaceElevated,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingHorizontal: 12,
              paddingTop: 12,
              paddingBottom: 28,
            }}
          >
            <Text
              style={{
                color: colors.textMuted,
                fontSize: 12,
                letterSpacing: 0.6,
                paddingHorizontal: 12,
                paddingBottom: 6,
              }}
            >
              AUDIO ROUTE
            </Text>
            {AUDIO_ROUTES.map((candidate) => {
              const Icon = ROUTE_ICON[candidate];
              const selected = candidate === route;
              return (
                <Pressable
                  key={candidate}
                  onPress={() => choose(candidate)}
                  accessibilityRole="menuitem"
                  accessibilityState={{ selected }}
                  accessibilityLabel={AUDIO_ROUTE_LABELS[candidate]}
                  accessibilityHint={AUDIO_ROUTE_HINTS[candidate]}
                  testID={`audio-route-${candidate}`}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    minHeight: 48,
                    paddingHorizontal: 12,
                    borderRadius: 14,
                  }}
                >
                  <Icon size={20} color={selected ? colors.textPrimary : colors.textSecondary} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textPrimary, fontSize: 16 }}>
                      {AUDIO_ROUTE_LABELS[candidate]}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                      {AUDIO_ROUTE_HINTS[candidate]}
                    </Text>
                  </View>
                  {selected ? <Check size={18} color={colors.textPrimary} /> : null}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
