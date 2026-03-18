import { useEffect, useState, useCallback, forwardRef } from 'react';
import { View, Pressable, ActivityIndicator } from 'react-native';
import BottomSheet, { BottomSheetFlatList, BottomSheetView } from '@gorhom/bottom-sheet';
import { Play, Check } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useSettingsStore } from '@/stores/settingsStore';
import * as TTS from '@/services/tts';
import { colors } from '@/lib/theme';
import type { VoiceInfo } from '@/services/tts';

/**
 * VoiceSelector bottom-sheet panel.
 * Lists available English TTS voices from expo-speech, lets the user
 * preview each with a sample utterance, and persists the selection to
 * the settings store.
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

  useEffect(() => {
    TTS.getEnglishVoices()
      .then((v) => {
        setVoices(v);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handlePlaySample = useCallback(
    async (voice: VoiceInfo) => {
      await TTS.speak('Hello! This is a sample of my voice.', {
        voice: voice.identifier,
        rate: speechRate,
      });
    },
    [speechRate],
  );

  const handleSelect = useCallback(
    (voice: VoiceInfo) => {
      setSelectedVoiceId(voice.identifier);
    },
    [setSelectedVoiceId],
  );

  const renderVoiceItem = useCallback(
    ({ item }: { item: VoiceInfo }) => {
      const isSelected = selectedVoiceId === item.identifier;
      return (
        <Pressable
          onPress={() => handleSelect(item)}
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
    [selectedVoiceId, handleSelect, handlePlaySample],
  );

  return (
    <BottomSheet
      ref={ref}
      index={-1}
      snapPoints={['50%', '80%']}
      enablePanDownToClose
      backgroundStyle={{ backgroundColor: colors.surfaceElevated }}
      handleIndicatorStyle={{ backgroundColor: colors.textMuted }}
    >
      <BottomSheetView style={{ flex: 1, padding: 16 }}>
        <Text
          style={{
            fontSize: 16,
            fontWeight: '600',
            color: colors.textPrimary,
            marginBottom: 12,
          }}
        >
          Select Voice
        </Text>
        {loading ? (
          <ActivityIndicator color={colors.teal} style={{ marginTop: 24 }} />
        ) : voices.length === 0 ? (
          <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 24 }}>
            No English voices available
          </Text>
        ) : (
          <BottomSheetFlatList
            data={voices}
            renderItem={renderVoiceItem}
            keyExtractor={(item) => item.identifier}
            showsVerticalScrollIndicator={false}
          />
        )}
      </BottomSheetView>
    </BottomSheet>
  );
});
