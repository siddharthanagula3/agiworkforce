import { useEffect, useState, useCallback, forwardRef } from 'react';
import { View, Pressable, ActivityIndicator } from 'react-native';
import BottomSheet, { BottomSheetFlatList, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Play, Check } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useSettingsStore } from '@/stores/settingsStore';
import * as TTS from '@/services/tts';
import { colors } from '@/lib/theme';
import { VOICE_PRESETS, findVoiceForPreset } from '@/lib/voicePresets';
import type { VoiceInfo } from '@/services/tts';

/**
 * VoiceSelector bottom-sheet panel.
 * Shows branded voice presets at the top, followed by the raw system voice list.
 * Selecting a preset automatically applies its matched system voice, rate, and pitch.
 *
 * @example
 *   const ref = useRef<BottomSheet>(null);
 *   <VoiceSelector ref={ref} />
 *   // Open: ref.current?.snapToIndex(0)
 */
export const VoiceSelector = forwardRef<BottomSheet>(function VoiceSelector(_props, ref) {
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const selectedVoiceId = useSettingsStore((s) => s.selectedVoiceId);
  const setSelectedVoiceId = useSettingsStore((s) => s.setSelectedVoiceId);
  const speechRate = useSettingsStore((s) => s.speechRate);
  const setSpeechRate = useSettingsStore((s) => s.setSpeechRate);
  const setSpeechPitch = useSettingsStore((s) => s.setSpeechPitch);
  const selectedPresetId = useSettingsStore((s) => s.selectedPresetId);
  const setSelectedPresetId = useSettingsStore((s) => s.setSelectedPresetId);

  useEffect(() => {
    TTS.getEnglishVoices()
      .then((v) => {
        setVoices(v);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSelectPreset = useCallback(
    (presetId: string) => {
      const preset = VOICE_PRESETS.find((p) => p.id === presetId);
      if (!preset) return;

      setSelectedPresetId(preset.id);
      setSpeechRate(preset.rate);
      setSpeechPitch(preset.pitch);

      // Find matching system voice
      const matchedVoiceId = findVoiceForPreset(preset, voices);
      if (matchedVoiceId) {
        setSelectedVoiceId(matchedVoiceId);
      }

      // Play a sample with the preset settings
      TTS.speak('Hello! This is a sample of my voice.', {
        voice: matchedVoiceId ?? undefined,
        rate: preset.rate,
        pitch: preset.pitch,
      }).catch(() => undefined);
    },
    [voices, setSelectedPresetId, setSpeechRate, setSpeechPitch, setSelectedVoiceId],
  );

  const handlePlaySample = useCallback(
    async (voice: VoiceInfo) => {
      await TTS.speak('Hello! This is a sample of my voice.', {
        voice: voice.identifier,
        rate: speechRate,
      });
    },
    [speechRate],
  );

  const handleSelectSystemVoice = useCallback(
    (voice: VoiceInfo) => {
      // Selecting a raw system voice clears the preset
      setSelectedPresetId(null);
      setSelectedVoiceId(voice.identifier);
    },
    [setSelectedPresetId, setSelectedVoiceId],
  );

  const renderVoiceItem = useCallback(
    ({ item }: { item: VoiceInfo }) => {
      const isSelected = selectedVoiceId === item.identifier && selectedPresetId === null;
      return (
        <Pressable
          onPress={() => handleSelectSystemVoice(item)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            padding: 12,
            borderRadius: 8,
            backgroundColor: isSelected ? 'rgba(33, 128, 141, 0.15)' : 'transparent',
            borderWidth: isSelected ? 1 : 0,
            borderColor: isSelected ? 'rgba(33, 128, 141, 0.3)' : 'transparent',
            marginBottom: 4,
          }}
          accessibilityLabel={`${item.name} voice`}
          accessibilityRole="radio"
          accessibilityState={{ selected: isSelected }}
        >
          {isSelected ? (
            <Check size={18} color={colors.teal} style={{ marginRight: 10 }} />
          ) : (
            <View style={{ width: 18, marginRight: 10 }} />
          )}
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: isSelected ? colors.teal : colors.textPrimary,
                fontSize: 14,
                fontWeight: '500',
              }}
            >
              {item.name}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>
              {item.quality} · {item.language}
            </Text>
          </View>
          <Pressable
            onPress={() => handlePlaySample(item)}
            style={{
              padding: 8,
              borderRadius: 20,
              backgroundColor: 'rgba(255,255,255,0.08)',
            }}
            accessibilityLabel={`Play sample for ${item.name}`}
            accessibilityRole="button"
          >
            <Play size={16} color={colors.textSecondary} />
          </Pressable>
        </Pressable>
      );
    },
    [selectedVoiceId, selectedPresetId, handleSelectSystemVoice, handlePlaySample],
  );

  return (
    <BottomSheet
      ref={ref}
      index={-1}
      snapPoints={['50%', '85%']}
      enablePanDownToClose
      backgroundStyle={{ backgroundColor: colors.surfaceElevated }}
      handleIndicatorStyle={{ backgroundColor: colors.textMuted }}
    >
      <BottomSheetScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Sheet title */}
        <Text
          style={{
            fontSize: 16,
            fontWeight: '600',
            color: colors.textPrimary,
            marginBottom: 16,
          }}
        >
          Select Voice
        </Text>

        {/* Branded voice presets grid */}
        <Text
          style={{
            fontSize: 12,
            fontWeight: '600',
            color: colors.textMuted,
            textTransform: 'uppercase',
            letterSpacing: 0.8,
            marginBottom: 10,
          }}
        >
          Voice Presets
        </Text>
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 8,
            marginBottom: 24,
          }}
        >
          {VOICE_PRESETS.map((preset) => {
            const isSelected = selectedPresetId === preset.id;
            return (
              <Pressable
                key={preset.id}
                onPress={() => handleSelectPreset(preset.id)}
                style={{
                  width: '48%',
                  padding: 12,
                  borderRadius: 10,
                  backgroundColor: isSelected
                    ? 'rgba(33, 128, 141, 0.18)'
                    : 'rgba(255, 255, 255, 0.05)',
                  borderWidth: 1,
                  borderColor: isSelected ? 'rgba(33, 128, 141, 0.5)' : 'rgba(255, 255, 255, 0.08)',
                }}
                accessibilityLabel={`${preset.name} voice preset: ${preset.description}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 4,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: '600',
                      color: isSelected ? colors.teal : colors.textPrimary,
                    }}
                  >
                    {preset.name}
                  </Text>
                  {isSelected && <Check size={14} color={colors.teal} />}
                </View>
                <Text
                  style={{
                    fontSize: 11,
                    color: colors.textMuted,
                    lineHeight: 15,
                  }}
                >
                  {preset.description}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* System voices section */}
        <Text
          style={{
            fontSize: 12,
            fontWeight: '600',
            color: colors.textMuted,
            textTransform: 'uppercase',
            letterSpacing: 0.8,
            marginBottom: 10,
          }}
        >
          System Voices
        </Text>
        {loading ? (
          <ActivityIndicator color={colors.teal} style={{ marginTop: 24 }} />
        ) : voices.length === 0 ? (
          <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 24 }}>
            No English voices available
          </Text>
        ) : (
          voices.map((item) => <View key={item.identifier}>{renderVoiceItem({ item })}</View>)
        )}
      </BottomSheetScrollView>
    </BottomSheet>
  );
});
