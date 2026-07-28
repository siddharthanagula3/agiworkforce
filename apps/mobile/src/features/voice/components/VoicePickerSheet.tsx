/**
 * Pre-flight voice picker — parity with
 * references-2/chatgpt-ios-voice-02-choose-spruce-voice.png.
 *
 * Distinct from `VoiceSelector`, which is the "Voice & Language" SETTINGS sheet
 * (a scrolling list of every option, reached from Settings). This is the step
 * between the intro and the live conversation: one voice at a time, swipeable,
 * with a single commit action. Same underlying VOICE_PRESETS, different job —
 * choosing before you start, rather than configuring after.
 */

import { useCallback, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, View, useWindowDimensions } from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import Animated, { FadeIn, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Stop, Circle } from 'react-native-svg';
import { Text } from '@/components/ui/text';
import { colors } from '@/src/ui/theme';
import { useSettingsStore } from '@/stores/settingsStore';
import { VOICE_PRESETS, type VoicePreset } from '../voicePresets';

const ORB_SIZE = 176;

function Orb({ size = ORB_SIZE }: { size?: number }) {
  const r = size / 2;
  return (
    <Svg width={size} height={size} accessibilityRole="image" accessibilityLabel="">
      <Defs>
        <RadialGradient id="voicePickerOrb" cx="50%" cy="35%" r="75%">
          <Stop offset="0%" stopColor={colors.voiceOrbStart} stopOpacity="1" />
          <Stop offset="55%" stopColor={colors.voiceOrbMid} stopOpacity="1" />
          <Stop offset="100%" stopColor={colors.voiceOrbEnd} stopOpacity="1" />
        </RadialGradient>
      </Defs>
      <Circle cx={r} cy={r} r={r} fill="url(#voicePickerOrb)" />
    </Svg>
  );
}

export interface VoicePickerSheetProps {
  visible: boolean;
  /** Commit the highlighted voice and enter the conversation. */
  onStart: () => void;
  onDismiss: () => void;
}

export function VoicePickerSheet({ visible, onStart, onDismiss }: VoicePickerSheetProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const selectedPresetId = useSettingsStore((s) => s.selectedPresetId);
  const setSelectedPresetId = useSettingsStore((s) => s.setSelectedPresetId);

  const initialIndex = Math.max(
    0,
    VOICE_PRESETS.findIndex((p) => p.id === selectedPresetId),
  );
  const [index, setIndex] = useState(initialIndex);
  const listRef = useRef<FlatList<VoicePreset>>(null);

  /**
   * Paging index from scroll offset. The store is written on commit, not on
   * every swipe — browsing past a voice is not choosing it, and writing here
   * would silently change the user's saved voice when they back out.
   */
  const handleMomentumEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = Math.round(event.nativeEvent.contentOffset.x / width);
      if (next !== index) {
        setIndex(next);
        if (hapticsEnabled) {
          void Haptics.selectionAsync();
        }
      }
    },
    [width, index, hapticsEnabled],
  );

  const handleStart = useCallback(() => {
    const preset = VOICE_PRESETS[index];
    if (preset) setSelectedPresetId(preset.id);
    if (hapticsEnabled) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onStart();
  }, [index, setSelectedPresetId, hapticsEnabled, onStart]);

  const active = VOICE_PRESETS[index];

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <Animated.View
        entering={FadeIn.duration(160)}
        style={{ flex: 1, backgroundColor: colors.scrim }}
      >
        <Animated.View
          entering={SlideInDown.springify().damping(22)}
          exiting={SlideOutDown.duration(180)}
          style={{
            flex: 1,
            marginTop: insets.top + 8,
            backgroundColor: colors.surfaceElevated,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingBottom: insets.bottom + 20,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 20,
              paddingTop: 16,
            }}
          >
            <View style={{ width: 36 }} />
            <Text
              style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '600' }}
              accessibilityRole="header"
            >
              Choose your voice
            </Text>
            <Pressable
              onPress={onDismiss}
              accessibilityRole="button"
              accessibilityLabel="Close voice picker"
              hitSlop={12}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.surfaceHover,
              }}
            >
              <X size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          <View style={{ flex: 1, minHeight: 200, justifyContent: 'center' }}>
            <FlatList
              ref={listRef}
              data={VOICE_PRESETS}
              keyExtractor={(p) => p.id}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              initialScrollIndex={initialIndex}
              getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
              onMomentumScrollEnd={handleMomentumEnd}
              renderItem={({ item }) => (
                <View style={{ width, alignItems: 'center', justifyContent: 'center' }}>
                  <Orb />
                  <Text
                    style={{
                      color: colors.textPrimary,
                      fontSize: 28,
                      fontWeight: '700',
                      marginTop: 48,
                    }}
                  >
                    {item.name}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 17, marginTop: 6 }}>
                    {item.description}
                  </Text>
                </View>
              )}
            />
          </View>

          {/* Page dots. Decorative — the list itself carries the accessible
              names, so announcing a dot per voice would just duplicate them. */}
          <View
            style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 28 }}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {VOICE_PRESETS.map((p, i) => (
              <View
                key={p.id}
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 4,
                  backgroundColor: i === index ? colors.textPrimary : colors.border,
                }}
              />
            ))}
          </View>

          <View style={{ paddingHorizontal: 28 }}>
            <Pressable
              onPress={handleStart}
              accessibilityRole="button"
              accessibilityLabel={active ? `Start voice with ${active.name}` : 'Start voice'}
              style={({ pressed }) => ({
                backgroundColor: colors.white,
                borderRadius: 999,
                paddingVertical: 17,
                alignItems: 'center',
                flexShrink: 0,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text
                style={{
                  color: colors.black,
                  fontSize: 17,
                  fontWeight: '600',
                  textAlign: 'center',
                }}
              >
                Start Voice
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
