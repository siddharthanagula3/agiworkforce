import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { Check, Play, Volume2 } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useSettingsStore } from '@/stores/settingsStore';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useLocalSettingsStore } from '@/stores/settings/localSettingsStore';
import { useCloudSettingsStore } from '@/stores/settings/cloudSettingsStore';
import { SettingsGroup, SettingsInfo, SettingsScreenShell } from '@/src/features/settings/common';
import { useThemeColors } from '@/src/ui/theme';
import * as TTS from '@/src/features/voice/services/tts';
import { VOICE_PRESETS, findVoiceForPreset } from '@/src/features/voice/voicePresets';
import type { VoiceInfo } from '@/src/features/voice/services/tts';

function PresetRow({
  id,
  name,
  description,
  selected,
  isLast,
  onSelect,
}: {
  id: string;
  name: string;
  description: string;
  selected: boolean;
  isLast?: boolean;
  onSelect: (id: string) => void;
}) {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={() => onSelect(id)}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${name} voice preset`}
      style={{
        minHeight: 60,
        paddingHorizontal: 14,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: colors.border,
      }}
    >
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '600' }}>{name}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 16 }}>{description}</Text>
      </View>
      {selected ? <Check size={18} color={colors.teal} /> : null}
    </Pressable>
  );
}

function SystemVoiceRow({
  voice,
  selected,
  isLast,
  onSelect,
  onPreview,
}: {
  voice: VoiceInfo;
  selected: boolean;
  isLast?: boolean;
  onSelect: (voice: VoiceInfo) => void;
  onPreview: (voice: VoiceInfo) => void;
}) {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={() => onSelect(voice)}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${voice.name} voice`}
      style={{
        minHeight: 60,
        paddingHorizontal: 14,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: colors.border,
      }}
    >
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '600' }}>
          {voice.name}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 16 }}>
          {voice.quality} · {voice.language}
        </Text>
      </View>
      <Pressable
        onPress={() => onPreview(voice)}
        accessibilityRole="button"
        accessibilityLabel={`Preview ${voice.name}`}
        hitSlop={8}
        style={({ pressed }) => ({
          width: 34,
          height: 34,
          borderRadius: 17,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed ? colors.surfaceHover : colors.inputSurface,
        })}
      >
        <Play size={15} color={colors.textSecondary} />
      </Pressable>
      {selected ? <Check size={18} color={colors.teal} /> : null}
    </Pressable>
  );
}

function SystemDefaultRow({
  selected,
  isLast,
  onSelect,
}: {
  selected: boolean;
  isLast?: boolean;
  onSelect: () => void;
}) {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={onSelect}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel="System default voice"
      style={{
        minHeight: 60,
        paddingHorizontal: 14,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: colors.border,
      }}
    >
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '600' }}>
          System default
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 16 }}>
          Use the default voice on this device
        </Text>
      </View>
      {selected ? <Check size={18} color={colors.teal} /> : null}
    </Pressable>
  );
}

export default function VoiceLanguageScreen() {
  const colors = useThemeColors();
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const isCloud = useChatAppModeStore((s) => s.appMode) === 'cloud';

  const selectedVoiceId = useSettingsStore((s) => s.selectedVoiceId);
  const setSelectedVoiceId = useSettingsStore((s) => s.setSelectedVoiceId);
  const speechRate = useSettingsStore((s) => s.speechRate);
  const speechPitch = useSettingsStore((s) => s.speechPitch);
  const setSpeechRate = useSettingsStore((s) => s.setSpeechRate);
  const setSpeechPitch = useSettingsStore((s) => s.setSpeechPitch);
  const selectedPresetId = useSettingsStore((s) => s.selectedPresetId);
  const setSelectedPresetId = useSettingsStore((s) => s.setSelectedPresetId);

  const localSpeechLanguage = useLocalSettingsStore((s) => s.speechLanguage);
  const cloudSpeechLanguage = useCloudSettingsStore((s) => s.speechLanguage);
  const speechLanguage = isCloud ? cloudSpeechLanguage : localSpeechLanguage;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    TTS.getVoicesForLanguage(speechLanguage)
      .then((items) => {
        if (!cancelled) setVoices(items);
      })
      .catch(() => {
        if (!cancelled) setVoices([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [speechLanguage]);

  const visibleSystemVoices = useMemo(() => voices.slice(0, 12), [voices]);

  const handleSelectPreset = useCallback(
    (presetId: string) => {
      const preset = VOICE_PRESETS.find((item) => item.id === presetId);
      if (!preset) return;
      setSelectedPresetId(preset.id);
      setSpeechRate(preset.rate);
      setSpeechPitch(preset.pitch);
      setSelectedVoiceId(findVoiceForPreset(preset, voices));
    },
    [setSelectedPresetId, setSelectedVoiceId, setSpeechPitch, setSpeechRate, voices],
  );

  const handleSelectSystemVoice = useCallback(
    (voice: VoiceInfo) => {
      setSelectedPresetId(null);
      setSelectedVoiceId(voice.identifier);
    },
    [setSelectedPresetId, setSelectedVoiceId],
  );

  const handleSelectSystemDefault = useCallback(() => {
    setSelectedPresetId(null);
    setSelectedVoiceId(null);
    setSpeechRate(1);
    setSpeechPitch(1);
  }, [setSelectedPresetId, setSelectedVoiceId, setSpeechPitch, setSpeechRate]);

  const handlePreview = useCallback(
    (voice: VoiceInfo) => {
      TTS.speak('This is how AGI will sound.', {
        voice: voice.identifier,
        rate: speechRate,
        pitch: speechPitch,
      }).catch(() => undefined);
    },
    [speechPitch, speechRate],
  );

  return (
    <SettingsScreenShell title="Voice & Language" backHref="/(app)/settings/voice">
      <SettingsInfo
        title="Speaking style"
        body="Choose an AGI voice preset or a system voice installed on this device."
        icon={Volume2}
      />

      <SettingsGroup>
        {VOICE_PRESETS.map((preset, index) => (
          <PresetRow
            key={preset.id}
            id={preset.id}
            name={preset.name}
            description={preset.description}
            selected={selectedPresetId === preset.id}
            isLast={index === VOICE_PRESETS.length - 1}
            onSelect={handleSelectPreset}
          />
        ))}
      </SettingsGroup>

      <Text
        style={{
          color: colors.textMuted,
          fontSize: 13,
          fontWeight: '700',
          marginBottom: 8,
          paddingHorizontal: 2,
        }}
      >
        System voices
      </Text>
      <SettingsGroup>
        <SystemDefaultRow
          selected={selectedVoiceId === null && selectedPresetId === null}
          isLast={!loading && visibleSystemVoices.length === 0}
          onSelect={handleSelectSystemDefault}
        />
        {loading ? (
          <View
            style={{
              minHeight: 72,
              alignItems: 'center',
              justifyContent: 'center',
              borderTopWidth: 1,
              borderTopColor: colors.border,
            }}
          >
            <ActivityIndicator color={colors.teal} />
          </View>
        ) : visibleSystemVoices.length === 0 ? (
          <View
            style={{
              minHeight: 72,
              padding: 14,
              justifyContent: 'center',
              borderTopWidth: 1,
              borderTopColor: colors.border,
            }}
          >
            <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '600' }}>
              No installed voices returned
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 16, marginTop: 3 }}>
              AGI will keep using the device default.
            </Text>
          </View>
        ) : (
          visibleSystemVoices.map((voice, index) => (
            <SystemVoiceRow
              key={voice.identifier}
              voice={voice}
              selected={selectedVoiceId === voice.identifier && selectedPresetId === null}
              isLast={index === visibleSystemVoices.length - 1}
              onSelect={handleSelectSystemVoice}
              onPreview={handlePreview}
            />
          ))
        )}
      </SettingsGroup>

      <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 17 }}>
        Speed {speechRate.toFixed(2)}x · Pitch {speechPitch.toFixed(2)}x
      </Text>
    </SettingsScreenShell>
  );
}
