import { useCallback, useMemo } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Slider from '@react-native-community/slider';
import { useRouter } from 'expo-router';
import { ArrowLeft, Check, Headphones, Lock, Mic, Play, Volume2 } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Switch } from '@/components/ui/switch';
import { useSettingsStore, type TTSProvider } from '@/stores/settingsStore';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useLocalSettingsStore } from '@/stores/settings/localSettingsStore';
import { useCloudSettingsStore } from '@/stores/settings/cloudSettingsStore';
import { SettingsGroup, SettingsInfo, SettingsRow } from '@/src/features/settings/common';
import { useTheme, useThemeColors } from '@/src/ui/theme';
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

function ProviderOption({
  label,
  description,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  description: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={`${label} voice provider`}
      style={({ pressed }) => ({
        minHeight: 68,
        padding: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: selected ? colors.accentBorder : colors.border,
        backgroundColor: selected
          ? colors.accentSurface
          : pressed && !disabled
            ? colors.surfaceHover
            : colors.inputSurface,
        opacity: disabled ? 0.68 : 1,
        gap: 8,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text
          numberOfLines={1}
          style={{ flex: 1, color: colors.textPrimary, fontSize: 14, fontWeight: '700' }}
        >
          {label}
        </Text>
        {disabled ? (
          <Lock size={16} color={colors.textMuted} />
        ) : selected ? (
          <Check size={16} color={colors.teal} />
        ) : null}
      </View>
      <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 16, flexShrink: 1 }}>
        {description}
      </Text>
    </Pressable>
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
  const { colors, statusBarStyle } = useTheme();
  const isCloud = useChatAppModeStore((s) => s.appMode) === 'cloud';

  // Device-global voice settings (same across modes)
  const voiceEnabled = useSettingsStore((s) => s.voiceEnabled);
  const setVoiceEnabled = useSettingsStore((s) => s.setVoiceEnabled);
  const selectedPresetId = useSettingsStore((s) => s.selectedPresetId);
  const selectedVoiceId = useSettingsStore((s) => s.selectedVoiceId);
  const ttsProvider = useSettingsStore((s) => s.ttsProvider);
  const setTtsProvider = useSettingsStore((s) => s.setTtsProvider);
  const speechRate = useSettingsStore((s) => s.speechRate);
  const setSpeechRate = useSettingsStore((s) => s.setSpeechRate);
  const speechPitch = useSettingsStore((s) => s.speechPitch);
  const setSpeechPitch = useSettingsStore((s) => s.setSpeechPitch);

  // Mode-specific: autoListen is a cloud-synced preference
  const localAutoListenEnabled = useLocalSettingsStore((s) => s.autoListenEnabled);
  const localSetAutoListenEnabled = useLocalSettingsStore((s) => s.setAutoListenEnabled);
  const cloudAutoListenEnabled = useCloudSettingsStore((s) => s.autoListenEnabled);
  const cloudSetAutoListenEnabled = useCloudSettingsStore((s) => s.setAutoListenEnabled);
  const autoListenEnabled = isCloud ? cloudAutoListenEnabled : localAutoListenEnabled;
  const setAutoListenEnabled = isCloud ? cloudSetAutoListenEnabled : localSetAutoListenEnabled;

  const handleBack = useCallback(() => {
    router.navigate('/(app)/(tabs)/settings' as Parameters<typeof router.navigate>[0]);
  }, [router]);

  const selectedVoiceLabel = useMemo(() => {
    const preset = VOICE_PRESETS.find((item) => item.id === selectedPresetId);
    if (preset) return preset.name;
    if (selectedVoiceId) return 'System voice';
    return 'System default';
  }, [selectedPresetId, selectedVoiceId]);

  const handleProviderSelect = (provider: TTSProvider) => {
    if (provider === 'cloud') {
      return;
    }
    setTtsProvider(provider);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceBase }}>
      <StatusBar style={statusBarStyle} />
      <View
        style={{ height: 50, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 }}
      >
        <Pressable
          onPress={handleBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
          style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
        >
          <ArrowLeft size={21} color={colors.textPrimary} />
        </Pressable>
        <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '700' }}>Voice</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 36 }}
        showsVerticalScrollIndicator={false}
      >
        <SettingsInfo
          title="Voice on this device"
          body="Choose how AGI listens and speaks in Local Mode. Cloud voice remains separate from local voice settings."
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
          <View style={{ padding: 14, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Volume2 size={18} color={colors.textSecondary} />
              <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '700' }}>
                Speech
              </Text>
            </View>
            <View style={{ gap: 10 }}>
              <ProviderOption
                label="System"
                description="Uses voices installed on this device."
                selected={ttsProvider === 'system'}
                onPress={() => handleProviderSelect('system')}
              />
              <ProviderOption
                label="Cloud"
                description="Cloud voice isn't available on mobile yet."
                selected={ttsProvider === 'cloud'}
                disabled
                onPress={() => handleProviderSelect('cloud')}
              />
            </View>
          </View>
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
      </ScrollView>
    </SafeAreaView>
  );
}
