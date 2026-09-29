import { useCallback, useMemo, useState } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { useRouter } from 'expo-router';
import { SUPPORTED_LANGUAGES } from '@agiworkforce/i18n';
import {
  Bot,
  Check,
  Globe,
  Hand,
  Headphones,
  Lock,
  Mic,
  Play,
  Volume2,
  X,
} from 'lucide-react-native';
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
import { typeScale } from '@/src/ui/theme/tokens';
import { VOICE_PRESETS } from '@/src/features/voice/voicePresets';
import { SPEECH_LANGUAGE_AUTO } from '@/src/features/voice/speechLanguage';
import { useModelStore } from '@/src/features/model-picker/store';
import { useModelInstallStore } from '@/src/features/model-picker/installStore';
import { DEFAULT_LOCAL_MODEL_ID, getDisplayName } from '@/src/features/model-picker/service';
import { useTierStore } from '@/src/features/billing/store';
import { resolveNewConversationModel } from '@/src/features/chat/utils/newConversationModel';

const CONVERSATION_MODES = [
  {
    pushToTalk: false,
    label: 'Hands free',
    description: 'Listening restarts on its own. Best for quiet places.',
    icon: Mic,
    testID: 'voice-settings-mode-hands-free',
  },
  {
    pushToTalk: true,
    label: 'Push to talk',
    description: 'Hold the orb to speak, release to send.',
    icon: Hand,
    testID: 'voice-settings-mode-push-to-talk',
  },
] as const;

interface SpeechLanguageOption {
  code: string;
  label: string;
  name: string;
  detail: string | null;
}

const SPEECH_LANGUAGE_OPTIONS: readonly SpeechLanguageOption[] = [
  {
    code: SPEECH_LANGUAGE_AUTO,
    label: 'Automatic',
    name: 'Automatic',
    detail: 'Uses your device language',
  },
  ...SUPPORTED_LANGUAGES.map((language) => ({
    code: language.code,
    label: language.nativeName,
    name: language.name,
    detail: language.name === language.nativeName ? null : language.name,
  })),
];

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
        <Text style={{ color: colors.textPrimary, fontSize: typeScale.body, fontWeight: '600' }}>
          {label}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: typeScale.caption, lineHeight: 16 }}>
          {description}
        </Text>
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
        <Text style={{ color: colors.textPrimary, fontSize: typeScale.body, fontWeight: '600' }}>
          {label}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: typeScale.footnote }}>{valueLabel}</Text>
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
  selectedCode,
  onSelect,
  onClose,
}: {
  visible: boolean;
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
              <Text
                style={{
                  color: colors.textPrimary,
                  fontSize: typeScale.callout,
                  fontWeight: '700',
                }}
              >
                Speech language
              </Text>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close speech language picker"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={16} color={colors.textMuted} />
              </Pressable>
            </View>

            <ScrollView>
              {SPEECH_LANGUAGE_OPTIONS.map((option, index) => {
                const selected = option.code === selectedCode;
                return (
                  <Pressable
                    key={option.code}
                    onPress={() => onSelect(option.code)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${option.name} speech language`}
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
                    <Text style={{ flex: 1, color: colors.textPrimary, fontSize: typeScale.body }}>
                      {option.label}
                    </Text>
                    {option.detail ? (
                      <Text style={{ color: colors.textMuted, fontSize: typeScale.caption }}>
                        {option.detail}
                      </Text>
                    ) : null}
                    {selected ? <Check size={17} color={colors.teal} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function VoiceSettingsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const appMode = useChatAppModeStore((s) => s.appMode);
  const isCloud = appMode === 'cloud';
  const selectedModel = useModelStore((s) => s.selectedModel);
  const subscriptionTier = useTierStore((s) => s.tier);
  const installedModelIds = useModelInstallStore((s) => s.installedModelIds);
  const readySystemModelIds = useModelInstallStore((s) => s.readySystemModelIds);
  const defaultLocalModelDownloading = useModelInstallStore(
    (s) => s.jobs[DEFAULT_LOCAL_MODEL_ID]?.status === 'downloading',
  );
  const answerModel = resolveNewConversationModel({
    selectedModel,
    mode: appMode,
    subscriptionTier,
    installedModelIds,
    readySystemModelIds,
    defaultLocalModelDownloading,
  });

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
  const pushToTalk = useSettingsStore((s) => s.voicePushToTalk);
  const setPushToTalk = useSettingsStore((s) => s.setVoicePushToTalk);

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

  const [languagePickerOpen, setLanguagePickerOpen] = useState(false);

  const speechLanguageLabel = useMemo(
    () =>
      SPEECH_LANGUAGE_OPTIONS.find((option) => option.code === speechLanguage)?.label ??
      languageDisplayName(speechLanguage),
    [speechLanguage],
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
          label="Answer model"
          icon={Bot}
          value={answerModel ? getDisplayName(answerModel) : 'Unavailable'}
          onPress={() => router.push('/(app)/models' as Parameters<typeof router.push>[0])}
        />
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
          <Text style={{ color: colors.textMuted, fontSize: typeScale.caption, lineHeight: 16 }}>
            Voice replies use the current chat model. Cloud Mode sends your transcript to AGI Cloud.
            Speech plays through voices installed on this device.
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

      <Text
        style={{
          color: colors.textMuted,
          fontSize: typeScale.footnote,
          fontWeight: '600',
          paddingHorizontal: 2,
          paddingBottom: 8,
        }}
      >
        Mode
      </Text>
      <SettingsGroup>
        {CONVERSATION_MODES.map((option, index) => {
          const selected = option.pushToTalk === pushToTalk;
          return (
            <Pressable
              key={option.label}
              testID={option.testID}
              onPress={() => setPushToTalk(option.pushToTalk)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Set voice mode to ${option.label}`}
              style={{
                minHeight: 60,
                paddingHorizontal: 14,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                borderBottomWidth: index === CONVERSATION_MODES.length - 1 ? 0 : 1,
                borderBottomColor: colors.border,
              }}
            >
              <option.icon size={19} color={selected ? colors.teal : colors.textSecondary} />
              <View style={{ flex: 1 }}>
                <Text
                  style={{ color: colors.textPrimary, fontSize: typeScale.body, fontWeight: '600' }}
                >
                  {option.label}
                </Text>
                <Text
                  style={{ color: colors.textMuted, fontSize: typeScale.caption, marginTop: 2 }}
                >
                  {option.description}
                </Text>
              </View>
              {selected ? <Check size={18} color={colors.teal} /> : null}
            </Pressable>
          );
        })}
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
        selectedCode={speechLanguage}
        onSelect={handleSelectSpeechLanguage}
        onClose={() => setLanguagePickerOpen(false)}
      />
    </SettingsScreenShell>
  );
}
