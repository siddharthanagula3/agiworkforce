import { useMemo } from 'react';
import { View } from 'react-native';
import Slider from '@react-native-community/slider';
import { useRouter } from 'expo-router';
import { Headphones, Lock, Mic, Play, Volume2 } from 'lucide-react-native';
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

export default function VoiceSettingsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const isCloud = useChatAppModeStore((s) => s.appMode) === 'cloud';

  const voiceEnabled = useSettingsStore((s) => s.voiceEnabled);
  const setVoiceEnabled = useSettingsStore((s) => s.setVoiceEnabled);
  const selectedPresetId = useSettingsStore((s) => s.selectedPresetId);
  const selectedVoiceId = useSettingsStore((s) => s.selectedVoiceId);
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
    </SettingsScreenShell>
  );
}
