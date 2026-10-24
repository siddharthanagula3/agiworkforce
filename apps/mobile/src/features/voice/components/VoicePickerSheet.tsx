import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, View, useWindowDimensions } from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { Square, Volume2, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Stop, Circle } from 'react-native-svg';
import { Text } from '@/components/ui/Text';
import { useThemeColors, sheetRadius } from '@/src/ui/theme';
import { dialogPadding, typeScale } from '@/src/ui/theme/tokens';
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

const ORB_SIZE = 140;

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

export function voicePositionLabel(index: number, count: number): string {
  return `Voice ${index + 1} of ${count}`;
}

function VoiceSampleButton({ voiceId, voiceName }: { voiceId: string; voiceName: string }) {
  const colors = useThemeColors();
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
  const colors = useThemeColors();
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

export interface VoicePickerSheetProps {
  visible: boolean;
  onStart: () => void;
  onDismiss: () => void;
}

export function VoicePickerSheet({ visible, onStart, onDismiss }: VoicePickerSheetProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const sheetRef = useRef<BottomSheet>(null);
  const [opened, setOpened] = useState(visible);
  if (visible && !opened) setOpened(true);
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

  useEffect(() => {
    if (!visible) {
      sheetRef.current?.close();
      return;
    }
    setIndex(initialIndex);
    listRef.current?.scrollToOffset({ offset: initialIndex * width, animated: false });
    sheetRef.current?.snapToIndex(0);
  }, [visible, initialIndex, width]);

  const handleSheetChange = useCallback(
    (next: number) => {
      if (next === -1) onDismiss();
    },
    [onDismiss],
  );

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5}
        pressBehavior="close"
      />
    ),
    [],
  );

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

  if (!opened) return null;

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      accessible={false}
      enablePanDownToClose
      enableDynamicSizing
      topInset={insets.top}
      onChange={handleSheetChange}
      backdropComponent={renderBackdrop}
      backgroundStyle={{
        backgroundColor: colors.surfaceElevated,
        borderTopLeftRadius: sheetRadius,
        borderTopRightRadius: sheetRadius,
      }}
      handleIndicatorStyle={{ backgroundColor: colors.textMuted, width: 36, height: 5 }}
    >
      <BottomSheetView testID="voice-picker-sheet" style={{ paddingBottom: insets.bottom + 20 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: dialogPadding,
            paddingTop: 8,
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
            onPress={() => sheetRef.current?.close()}
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

        <View style={{ paddingTop: 24 }}>
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
            accessibilityLabel="Voices"
            accessibilityValue={{ text: voicePositionLabel(index, choices.length) }}
            renderItem={({ item }) => (
              <View style={{ width, alignItems: 'center', justifyContent: 'center' }}>
                <Orb />
                <Text
                  style={{
                    color: colors.textPrimary,
                    fontSize: typeScale.title1,
                    fontWeight: '700',
                    marginTop: 28,
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

        <View
          style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginVertical: 24 }}
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
            <View
              style={{
                backgroundColor: colors.textPrimary,
                borderRadius: 999,
                paddingVertical: 17,
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  color: colors.surfaceBase,
                  fontSize: typeScale.headline,
                  fontWeight: '600',
                  textAlign: 'center',
                }}
              >
                Start Voice
              </Text>
            </View>
          </PressableBox>
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
}
