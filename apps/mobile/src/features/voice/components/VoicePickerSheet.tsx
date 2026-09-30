import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Modal, View, useWindowDimensions } from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Square, Volume2, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Stop, Circle } from 'react-native-svg';
import { Text } from '@/components/ui/text';
import { colors, motion } from '@/src/ui/theme';
import { dialogPadding, typeScale } from '@/src/ui/theme/tokens';
import { useSheetSlideIn } from '@/src/shared/hooks/useSheetSlideIn';
import { LIVE_VOICES } from '@agiworkforce/types/live-voices';
import { useSettingsStore } from '@/stores/settingsStore';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { liveVoiceModeUnavailableReason } from '../services/liveVoiceAvailability';
import { VOICE_PRESETS } from '../voicePresets';
import {
  loadVoiceSamples,
  playVoiceSample,
  stopVoiceSample,
} from '@/src/features/voice/services/voiceSamples';

const ORB_SIZE = 176;

interface VoiceChoice {
  id: string;
  name: string;
  description: string;
}

const LIVE_CHOICES: readonly VoiceChoice[] = LIVE_VOICES.map((voice) => ({
  id: voice.voiceURI,
  name: voice.name,
  description: voice.lang,
}));

function VoiceSampleButton({ voiceId, voiceName }: { voiceId: string; voiceName: string }) {
  const [file, setFile] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let active = true;
    setFile(null);
    void loadVoiceSamples().then((samples) => {
      if (active) setFile(samples[voiceId] ?? null);
    });
    return () => {
      active = false;
      stopVoiceSample();
      setPlaying(false);
    };
  }, [voiceId]);

  if (!file) return null;
  const Icon = playing ? Square : Volume2;
  return (
    <PressableBox
      onPress={() => {
        if (playing) {
          stopVoiceSample();
          setPlaying(false);
          return;
        }
        setPlaying(true);
        playVoiceSample(file, () => setPlaying(false));
      }}
      accessibilityRole="button"
      accessibilityLabel={
        playing ? `Stop the ${voiceName} sample` : `Play a sample of ${voiceName}`
      }
      style={{
        marginTop: 16,
        minHeight: 44,
        paddingHorizontal: 16,
        borderRadius: 999,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Icon size={16} color={colors.textPrimary} />
      <Text style={{ color: colors.textPrimary, fontSize: typeScale.body, fontWeight: '600' }}>
        {playing ? 'Stop sample' : 'Play sample'}
      </Text>
    </PressableBox>
  );
}

function Orb({ size = ORB_SIZE }: { size?: number }) {
  const r = size / 2;
  return (
    <Svg width={size} height={size} accessibilityRole="image" accessibilityLabel="">
      <Defs>
        <LinearGradient id="voicePickerOrb" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor={colors.voiceOrbStart} stopOpacity="1" />
          <Stop offset="55%" stopColor={colors.voiceOrbMid} stopOpacity="1" />
          <Stop offset="100%" stopColor={colors.voiceOrbEnd} stopOpacity="1" />
        </LinearGradient>
      </Defs>
      <Circle cx={r} cy={r} r={r} fill="url(#voicePickerOrb)" />
    </Svg>
  );
}

const PILL = {
  backgroundColor: colors.white,
  borderRadius: 999,
  paddingVertical: 17,
  alignItems: 'center' as const,
};
const PILL_LABEL = {
  color: colors.black,
  fontSize: typeScale.headline,
  fontWeight: '600' as const,
  textAlign: 'center' as const,
};

export interface VoicePickerSheetProps {
  visible: boolean;
  onStart: () => void;
  onDismiss: () => void;
}

export function VoicePickerSheet({ visible, onStart, onDismiss }: VoicePickerSheetProps) {
  const insets = useSafeAreaInsets();
  const sheetSlideIn = useSheetSlideIn({ visible });
  const { width } = useWindowDimensions();
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const selectedPresetId = useSettingsStore((s) => s.selectedPresetId);
  const setSelectedPresetId = useSettingsStore((s) => s.setSelectedPresetId);
  const liveVoice = useSettingsStore((s) => s.liveVoice);
  const setLiveVoice = useSettingsStore((s) => s.setLiveVoice);
  const appMode = useChatAppModeStore((s) => s.appMode);
  const isClerkSignedIn = useAuthStore((s) => s.isClerkSignedIn);
  const live =
    liveVoiceModeUnavailableReason({
      executionMode: appMode === 'cloud' ? 'cloud' : 'local',
      signedIn: isClerkSignedIn,
    }) === null;
  const choices: readonly VoiceChoice[] = live ? LIVE_CHOICES : VOICE_PRESETS;
  const selectedId = live ? liveVoice : selectedPresetId;

  const initialIndex = Math.max(
    0,
    choices.findIndex((choice) => choice.id === selectedId),
  );
  const [index, setIndex] = useState(initialIndex);
  const listRef = useRef<FlatList<VoiceChoice>>(null);

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
    const choice = choices[index];
    if (choice) {
      if (live) setLiveVoice(choice.id);
      else setSelectedPresetId(choice.id);
    }
    if (hapticsEnabled) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onStart();
  }, [choices, index, live, setLiveVoice, setSelectedPresetId, hapticsEnabled, onStart]);

  const active = choices[index];

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent
      onRequestClose={onDismiss}
      statusBarTranslucent
      accessibilityViewIsModal
    >
      <Animated.View
        entering={FadeIn.duration(motion.quick)}
        style={{ flex: 1, backgroundColor: colors.scrim }}
      >
        <Animated.View
          style={[
            {
              flex: 1,
              marginTop: insets.top + 8,
              backgroundColor: colors.surfaceElevated,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              paddingBottom: insets.bottom + 20,
            },
            sheetSlideIn,
          ]}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: dialogPadding,
              paddingTop: 16,
            }}
          >
            <View style={{ width: 36 }} />
            <Text
              style={{ color: colors.textPrimary, fontSize: typeScale.headline, fontWeight: '600' }}
              accessibilityRole="header"
            >
              Choose your voice
            </Text>
            <PressableBox
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
            </PressableBox>
          </View>

          <View style={{ flex: 1, minHeight: 200, justifyContent: 'center' }}>
            <FlatList
              ref={listRef}
              data={choices}
              keyExtractor={(choice) => choice.id}
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
                      fontSize: typeScale.title1,
                      fontWeight: '700',
                      marginTop: 48,
                    }}
                  >
                    {item.name}
                  </Text>
                  <Text
                    style={{ color: colors.textMuted, fontSize: typeScale.headline, marginTop: 6 }}
                  >
                    {item.description}
                  </Text>
                  {live ? <VoiceSampleButton voiceId={item.id} voiceName={item.name} /> : null}
                </View>
              )}
            />
          </View>

          {/* Page dots. Decorative, the list itself carries the accessible
              names, so announcing a dot per voice would just duplicate them. */}
          <View
            style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 28 }}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {choices.map((choice, i) => (
              <View
                key={choice.id}
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
            <PressableBox
              onPress={handleStart}
              accessibilityRole="button"
              accessibilityLabel={active ? `Start voice with ${active.name}` : 'Start voice'}
              style={{ flexShrink: 0 }}
            >
              <View style={PILL}>
                <Text style={PILL_LABEL}>Start Voice</Text>
              </View>
            </PressableBox>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
