import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { Check, Play, Square, Volume2 } from 'lucide-react-native';
import { LIVE_DEFAULT_VOICE, LIVE_VOICES } from '@agiworkforce/types/live-voices';
import { Text } from '@/components/ui/Text';
import { useSettingsStore } from '@/stores/settingsStore';
import { useAuthStore } from '@/src/features/auth/store';
import { liveVoiceModeUnavailableReason } from '@/src/features/voice/services/liveVoiceAvailability';
import { deviceSpeechLocale } from '@/src/features/voice/services/speechSettings';
import { chosenSpeechLanguage } from '@/src/features/voice/speechLanguage';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useLocalSettingsStore } from '@/stores/settings/localSettingsStore';
import { useCloudSettingsStore } from '@/stores/settings/cloudSettingsStore';
import { SettingsGroup, SettingsInfo, SettingsScreenShell } from '@/src/features/settings/Common';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import * as TTS from '@/src/features/voice/services/tts';
import { useVoiceOutputOwner } from '@/src/features/voice/hooks/useVoiceOutputOwner';
import { VOICE_PRESETS } from '@/src/features/voice/voicePresets';
import {
  applyVoicePreset,
  presetPreviewOptions,
  presetSpeakingStyleNote,
} from '@/src/features/voice/services/voicePresetSelection';
import { useVoicePreview } from '@/src/features/voice/hooks/useVoicePreview';
import type { VoiceInfo } from '@/src/features/voice/services/tts';

function PreviewButton({
  name,
  playing,
  onPress,
}: {
  name: string;
  playing: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const Icon = playing ? Square : Play;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={playing ? `Stop preview of ${name}` : `Preview ${name}`}
      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
    >
      <Icon size={typeScale.caption} color={playing ? colors.teal : colors.textSecondary} />
    </Pressable>
  );
}

function PresetRow({
  id,
  name,
  description,
  selected,
  isLast,
  accessibilityLabel,
  onSelect,
  onPreview,
  previewing = false,
}: {
  id: string;
  name: string;
  description: string;
  selected: boolean;
  isLast?: boolean;
  accessibilityLabel: string;
  onSelect: (id: string) => void;
  onPreview?: () => void;
  previewing?: boolean;
}) {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={() => onSelect(id)}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel}
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
        <Text style={{ color: colors.textPrimary, fontSize: typeScale.body, fontWeight: '600' }}>
          {name}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: typeScale.caption, lineHeight: 16 }}>
          {description}
        </Text>
      </View>
      {onPreview ? <PreviewButton name={name} playing={previewing} onPress={onPreview} /> : null}
      {selected ? <Check size={18} color={colors.teal} /> : null}
    </Pressable>
  );
}

function SystemVoiceRow({
  voice,
  selected,
  isLast,
  playing,
  onSelect,
  onPreview,
}: {
  voice: VoiceInfo;
  selected: boolean;
  isLast?: boolean;
  playing: boolean;
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
        <Text style={{ color: colors.textPrimary, fontSize: typeScale.body, fontWeight: '600' }}>
          {voice.name}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: typeScale.caption, lineHeight: 16 }}>
          {voice.quality} · {voice.language}
        </Text>
      </View>
      <PreviewButton name={voice.name} playing={playing} onPress={() => onPreview(voice)} />
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
        <Text style={{ color: colors.textPrimary, fontSize: typeScale.body, fontWeight: '600' }}>
          System default
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: typeScale.caption, lineHeight: 16 }}>
          Use the default voice on this device
        </Text>
      </View>
      {selected ? <Check size={18} color={colors.teal} /> : null}
    </Pressable>
  );
}

export default function VoiceLanguageScreen() {
  const colors = useThemeColors();
  const speechOwner = useVoiceOutputOwner('local', 'voice-preview');
  const { playingKey, toggle: togglePreview } = useVoicePreview(speechOwner);
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [inventory, setInventory] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [inventoryAttempt, setInventoryAttempt] = useState(0);
  const loading = inventory === 'loading';
  const isCloud = useChatAppModeStore((s) => s.appMode) === 'cloud';

  const selectedVoiceId = useSettingsStore((s) => s.selectedVoiceId);
  const setSelectedVoiceId = useSettingsStore((s) => s.setSelectedVoiceId);
  const speechRate = useSettingsStore((s) => s.speechRate);
  const speechPitch = useSettingsStore((s) => s.speechPitch);
  const setSpeechRate = useSettingsStore((s) => s.setSpeechRate);
  const setSpeechPitch = useSettingsStore((s) => s.setSpeechPitch);
  const selectedPresetId = useSettingsStore((s) => s.selectedPresetId);
  const setSelectedPresetId = useSettingsStore((s) => s.setSelectedPresetId);
  const liveVoice = useSettingsStore((s) => s.liveVoice);
  const setLiveVoice = useSettingsStore((s) => s.setLiveVoice);
  const isClerkSignedIn = useAuthStore((s) => s.isClerkSignedIn);
  const liveVoiceAvailable =
    liveVoiceModeUnavailableReason({
      executionMode: isCloud ? 'cloud' : 'local',
      signedIn: isClerkSignedIn,
    }) === null;

  const localSpeechLanguage = useLocalSettingsStore((s) => s.speechLanguage);
  const cloudSpeechLanguage = useCloudSettingsStore((s) => s.speechLanguage);
  const speechLanguage =
    chosenSpeechLanguage(isCloud ? cloudSpeechLanguage : localSpeechLanguage) ??
    deviceSpeechLocale().split('-')[0] ??
    '';

  useEffect(() => {
    let cancelled = false;
    setInventory('loading');
    TTS.getVoicesForLanguage(speechLanguage)
      .then((items) => {
        if (cancelled) return;
        setVoices(items);
        setInventory('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setVoices([]);
        setInventory('failed');
      });
    return () => {
      cancelled = true;
    };
  }, [speechLanguage, inventoryAttempt]);

  const retryInventory = useCallback(() => setInventoryAttempt((attempt) => attempt + 1), []);
  const keepsChosenVoice = selectedVoiceId !== null;
  const emptyInventoryTitle =
    inventory === 'failed' ? "Couldn't load installed voices" : 'No installed voices returned';
  const emptyInventoryDetail = keepsChosenVoice
    ? 'Your voice is kept but can’t be checked now. Choose System default to stop.'
    : 'AGI uses the device default.';

  const visibleSystemVoices = useMemo(() => voices.slice(0, 12), [voices]);

  const handleSelectPreset = useCallback(
    (presetId: string) => {
      applyVoicePreset(presetId, voices);
    },
    [voices],
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
      togglePreview(voice.identifier, {
        voice: voice.identifier,
        rate: speechRate,
        pitch: speechPitch,
      });
    },
    [togglePreview, speechPitch, speechRate],
  );

  const speakingStyleNote = presetSpeakingStyleNote(selectedPresetId);

  return (
    <SettingsScreenShell title="Voice & Language" backHref="/(app)/settings/voice">
      {liveVoiceAvailable ? (
        <>
          <SettingsInfo
            title="Voice mode"
            body="The voice AGI speaks with in live voice conversations."
            icon={Volume2}
          />
          <SettingsGroup>
            {LIVE_VOICES.map((voice, index) => (
              <PresetRow
                key={voice.voiceURI}
                id={voice.voiceURI}
                name={voice.name}
                description={voice.lang}
                selected={(liveVoice ?? LIVE_DEFAULT_VOICE) === voice.voiceURI}
                isLast={index === LIVE_VOICES.length - 1}
                accessibilityLabel={`${voice.name} voice for voice mode`}
                onSelect={setLiveVoice}
              />
            ))}
          </SettingsGroup>
        </>
      ) : null}

      <SettingsInfo
        title="Speaking style"
        body="An AGI preset or a voice installed on this device."
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
            accessibilityLabel={`${preset.name} voice preset`}
            onSelect={handleSelectPreset}
            previewing={playingKey === preset.id}
            onPreview={() => togglePreview(preset.id, presetPreviewOptions(preset, voices))}
          />
        ))}
      </SettingsGroup>

      {speakingStyleNote ? (
        <Text style={{ color: colors.textMuted, fontSize: typeScale.caption, lineHeight: 17 }}>
          {speakingStyleNote}
        </Text>
      ) : null}

      <Text
        style={{
          color: colors.textMuted,
          fontSize: typeScale.footnote,
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
            <LoadingIndicator />
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
            <Text
              style={{ color: colors.textPrimary, fontSize: typeScale.body, fontWeight: '600' }}
            >
              {emptyInventoryTitle}
            </Text>
            <Text
              style={{
                color: colors.textMuted,
                fontSize: typeScale.caption,
                lineHeight: 16,
                marginTop: 3,
              }}
            >
              {emptyInventoryDetail}
            </Text>
            {inventory === 'failed' ? (
              <Pressable
                onPress={retryInventory}
                accessibilityRole="button"
                accessibilityLabel="Try loading installed voices again"
                hitSlop={8}
                style={{ alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' }}
              >
                <Text style={{ color: colors.teal, fontSize: typeScale.body, fontWeight: '600' }}>
                  Try again
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          visibleSystemVoices.map((voice, index) => (
            <SystemVoiceRow
              key={voice.identifier}
              voice={voice}
              selected={selectedVoiceId === voice.identifier && selectedPresetId === null}
              isLast={index === visibleSystemVoices.length - 1}
              playing={playingKey === voice.identifier}
              onSelect={handleSelectSystemVoice}
              onPreview={handlePreview}
            />
          ))
        )}
      </SettingsGroup>

      <Text style={{ color: colors.textMuted, fontSize: typeScale.caption, lineHeight: 17 }}>
        Speed {speechRate.toFixed(2)}x · Pitch {speechPitch.toFixed(2)}x
      </Text>
    </SettingsScreenShell>
  );
}
