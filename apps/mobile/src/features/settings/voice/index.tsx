import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { useRouter } from 'expo-router';
import { Check, Globe, Headphones, Lock, Mic, Play, Volume2, X } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Switch } from '@/components/ui/switch';
import { useSettingsStore } from '@/stores/settingsStore';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useLocalSettingsStore } from '@/stores/settings/localSettingsStore';
import { useCloudSettingsStore } from '@/stores/settings/cloudSettingsStore';
import {
  SettingsGroup,
  SettingsInfo,
  SettingsRow,
  SettingsScreenShell,
} from '@/src/features/settings/common';
import { useThemeColors } from '@/src/ui/theme';
import { VOICE_PRESETS } from '@/src/features/voice/voicePresets';
import * as TTS from '@/src/features/voice/services/tts';

interface SpeechLanguageOption {
  code: string;
  label: string;
  locale: string;
}

function languageDisplayName(code: string): string {
  const DisplayNamesConstructor = Intl.DisplayNames;
  if (typeof DisplayNamesConstructor !== 'function') return code.toUpperCase();
  try {
    return new DisplayNamesConstructor(['en'], { type: 'language' }).of(code) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

function ToggleRow({
  label,
  description,
  value,
  onValueChange,
  isLast,
}: {
  label: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  isLast?: boolean;
}) {
  const colors = useThemeColors();

  return (
    <View
      style={{
        minHeight: 66,
        paddingHorizontal: 14,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: colors.border,
      }}
    >
      <Mic size={19} color={colors.textSecondary} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '600' }}>{label}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 16 }}>{description}</Text>
      </View>
      <Switch value={value} onValueChange={onValueChange} accessibilityLabel={label} />
    </View>
  );
}

function VoiceSlider({
  label,
  valueLabel,
  value,
  minimumValue,
  maximumValue,
  step,
  onValueChange,
}: {
  label: string;
  valueLabel: string;
  value: number;
  minimumValue: number;
  maximumValue: number;
  step: number;
  onValueChange: (value: number) => void;
}) {
  const colors = useThemeColors();

  return (
    <View style={{ gap: 8, paddingHorizontal: 14, paddingVertical: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '600' }}>{label}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>{valueLabel}</Text>
      </View>
      <Slider
        value={value}
        minimumValue={minimumValue}
        maximumValue={maximumValue}
        step={step}
        onValueChange={onValueChange}
        minimumTrackTintColor={colors.teal}
        maximumTrackTintColor={colors.progressTrack}
        thumbTintColor={colors.white}
        accessibilityLabel={label}
        accessibilityValue={{ text: valueLabel }}
        style={{ height: 36 }}
      />
    </View>
  );
}

function SpeechLanguageModal({
  visible,
  options,
  loading,
  selectedCode,
  onSelect,
  onClose,
}: {
  visible: boolean;
  options: SpeechLanguageOption[];
  loading: boolean;
  selectedCode: string;
  onSelect: (code: string) => void;
  onClose: () => void;
}) {
  const colors = useThemeColors();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        accessible={false}
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.scrim }}
        onPress={onClose}
      >
        <Pressable accessible={false} onPress={(e) => e.stopPropagation()}>
          <View
            accessibilityViewIsModal
            style={{
              backgroundColor: colors.surfaceOverlay,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingTop: 16,
              paddingBottom: 24,
              maxHeight: '75%',
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 18,
                paddingBottom: 12,
              }}
            >
              <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '700' }}>
                Speech language
              </Text>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close speech language picker"
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={16} color={colors.textMuted} />
              </Pressable>
            </View>

            {loading ? (
              <View style={{ paddingVertical: 32, alignItems: 'center' }}>
                <ActivityIndicator color={colors.teal} />
              </View>
            ) : options.length === 0 ? (
              <View style={{ paddingHorizontal: 18, paddingVertical: 24 }}>
                <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '600' }}>
                  No speech languages returned
                </Text>
                <Text
                  style={{ color: colors.textMuted, fontSize: 12, lineHeight: 16, marginTop: 4 }}
                >
                  Install a voice in your device settings, then reopen this list.
                </Text>
              </View>
            ) : (
              <ScrollView>
                {options.map((option, index) => {
                  const selected = option.code === selectedCode;
                  return (
                    <Pressable
                      key={option.code}
                      onPress={() => onSelect(option.code)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`${option.label} speech language`}
                      style={({ pressed }) => ({
                        minHeight: 52,
                        paddingHorizontal: 18,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        borderTopWidth: index === 0 ? 0 : 1,
                        borderTopColor: colors.border,
                        backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
                      })}
                    >
                      <Text style={{ flex: 1, color: colors.textPrimary, fontSize: 15 }}>
                        {option.label}
                      </Text>
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>{option.locale}</Text>
                      {selected ? <Check size={17} color={colors.teal} /> : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function VoiceSettingsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const isCloud = useChatAppModeStore((s) => s.appMode) === 'cloud';

  const voiceEnabled = useSettingsStore((s) => s.voiceEnabled);
  const setVoiceEnabled = useSettingsStore((s) => s.setVoiceEnabled);
  const selectedPresetId = useSettingsStore((s) => s.selectedPresetId);
  const setSelectedPresetId = useSettingsStore((s) => s.setSelectedPresetId);
  const selectedVoiceId = useSettingsStore((s) => s.selectedVoiceId);
  const setSelectedVoiceId = useSettingsStore((s) => s.setSelectedVoiceId);
  const speechRate = useSettingsStore((s) => s.speechRate);
  const setSpeechRate = useSettingsStore((s) => s.setSpeechRate);
  const speechPitch = useSettingsStore((s) => s.speechPitch);
  const setSpeechPitch = useSettingsStore((s) => s.setSpeechPitch);

  const localAutoListenEnabled = useLocalSettingsStore((s) => s.autoListenEnabled);
  const localSetAutoListenEnabled = useLocalSettingsStore((s) => s.setAutoListenEnabled);
  const cloudAutoListenEnabled = useCloudSettingsStore((s) => s.autoListenEnabled);
  const cloudSetAutoListenEnabled = useCloudSettingsStore((s) => s.setAutoListenEnabled);
  const autoListenEnabled = isCloud ? cloudAutoListenEnabled : localAutoListenEnabled;
  const setAutoListenEnabled = isCloud ? cloudSetAutoListenEnabled : localSetAutoListenEnabled;

  const localSpeechLanguage = useLocalSettingsStore((s) => s.speechLanguage);
  const localSetSpeechLanguage = useLocalSettingsStore((s) => s.setSpeechLanguage);
  const cloudSpeechLanguage = useCloudSettingsStore((s) => s.speechLanguage);
  const cloudSetSpeechLanguage = useCloudSettingsStore((s) => s.setSpeechLanguage);
  const speechLanguage = isCloud ? cloudSpeechLanguage : localSpeechLanguage;
  const setSpeechLanguage = isCloud ? cloudSetSpeechLanguage : localSetSpeechLanguage;

  const [languageOptions, setLanguageOptions] = useState<SpeechLanguageOption[]>([]);
  const [languagesLoading, setLanguagesLoading] = useState(false);
  const [languagePickerOpen, setLanguagePickerOpen] = useState(false);

  useEffect(() => {
    if (!languagePickerOpen) return;
    let cancelled = false;
    setLanguagesLoading(true);
    TTS.getAvailableLanguages()
      .then((items) => {
        if (!cancelled) setLanguageOptions(items);
      })
      .catch(() => {
        if (!cancelled) setLanguageOptions([]);
      })
      .finally(() => {
        if (!cancelled) setLanguagesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [languagePickerOpen]);

  const speechLanguageLabel = useMemo(
    () =>
      languageOptions.find((option) => option.code === speechLanguage)?.label ??
      languageDisplayName(speechLanguage),
    [languageOptions, speechLanguage],
  );

  const handleSelectSpeechLanguage = useCallback(
    (code: string) => {
      setSpeechLanguage(code);
      setSelectedVoiceId(null);
      setSelectedPresetId(null);
      setLanguagePickerOpen(false);
    },
    [setSelectedPresetId, setSelectedVoiceId, setSpeechLanguage],
  );

  const selectedVoiceLabel = useMemo(() => {
    const preset = VOICE_PRESETS.find((item) => item.id === selectedPresetId);
    if (preset) return preset.name;
    if (selectedVoiceId) return 'System voice';
    return 'System default';
  }, [selectedPresetId, selectedVoiceId]);

  return (
    <SettingsScreenShell title="Voice">
      <SettingsInfo
        title="Voice on this device"
        body="Choose how AGI listens and speaks on this device."
        icon={Headphones}
      />
      <SettingsInfo
        title="Foreground conversations only"
        body="Voice listening and speech stop when AGI moves to the background or the device locks. The microphone does not stay active in other apps."
        icon={Lock}
      />

      <SettingsGroup>
        <ToggleRow
          label="Voice Input"
          description="Use the microphone for dictation and voice conversations."
          value={voiceEnabled}
          onValueChange={setVoiceEnabled}
        />
        <ToggleRow
          label="Auto-listen"
          description="Start listening again after AGI finishes speaking."
          value={autoListenEnabled}
          onValueChange={setAutoListenEnabled}
          isLast
        />
      </SettingsGroup>

      <SettingsGroup>
        <SettingsRow
          label="Speech language"
          icon={Globe}
          value={speechLanguageLabel}
          onPress={() => setLanguagePickerOpen(true)}
        />
        <SettingsRow
          label="Voice"
          icon={Volume2}
          value={selectedVoiceLabel}
          onPress={() =>
            router.push('/(app)/settings/voice-language' as Parameters<typeof router.push>[0])
          }
          isLast
        />
        {/* The device speech engine is the only one that exists on mobile, so it
            is stated here as a caption instead of offered as a choice. */}
        <View style={{ paddingHorizontal: 14, paddingBottom: 12 }}>
          <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 16 }}>
            Spoken by the system speech engine, using voices installed on this device.
          </Text>
        </View>
      </SettingsGroup>

      <SettingsGroup>
        <VoiceSlider
          label="Speed"
          value={speechRate}
          valueLabel={`${speechRate.toFixed(2)}x`}
          minimumValue={0.5}
          maximumValue={2}
          step={0.05}
          onValueChange={setSpeechRate}
        />
        <View style={{ height: 1, backgroundColor: colors.border, marginHorizontal: 14 }} />
        <VoiceSlider
          label="Pitch"
          value={speechPitch}
          valueLabel={`${speechPitch.toFixed(2)}x`}
          minimumValue={0.5}
          maximumValue={2}
          step={0.05}
          onValueChange={setSpeechPitch}
        />
      </SettingsGroup>

      <SettingsGroup>
        <SettingsRow
          label="Open Voice Companion"
          icon={Play}
          onPress={() =>
            router.push({
              pathname: '/(app)/voice',
              params: { returnTo: '/(app)/settings/voice' },
            } as Parameters<typeof router.push>[0])
          }
          isLast
        />
      </SettingsGroup>

      <SpeechLanguageModal
        visible={languagePickerOpen}
        options={languageOptions}
        loading={languagesLoading}
        selectedCode={speechLanguage}
        onSelect={handleSelectSpeechLanguage}
        onClose={() => setLanguagePickerOpen(false)}
      />
    </SettingsScreenShell>
  );
}
