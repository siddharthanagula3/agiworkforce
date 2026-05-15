/**
 * Personalization Settings Screen
 *
 * User profile fields (name, nickname, occupation, custom instructions)
 * plus 4 response-style sliders (warmth, enthusiasm, headers/lists, emoji).
 */
import { useCallback, useMemo, useState } from 'react';
import { View, ScrollView, Pressable, TextInput, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Slider from '@react-native-community/slider';
import { ArrowLeft, Check, Sun, Moon, Monitor } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { useSettingsStore, type ThemeMode } from '@/stores/settingsStore';
import { useThemeColors } from '@/hooks/useTheme';

// ---------------------------------------------------------------------------
// Slider config
// ---------------------------------------------------------------------------

interface SliderConfig {
  key: 'warmth' | 'enthusiasm' | 'headersLists' | 'emoji';
  label: string;
  leftLabel: string;
  rightLabel: string;
}

const SLIDERS: SliderConfig[] = [
  { key: 'warmth', label: 'Warmth', leftLabel: 'Cold', rightLabel: 'Warm' },
  { key: 'enthusiasm', label: 'Enthusiasm', leftLabel: 'Neutral', rightLabel: 'Enthusiastic' },
  { key: 'headersLists', label: 'Headers / Lists', leftLabel: 'Prose', rightLabel: 'Structured' },
  { key: 'emoji', label: 'Emoji', leftLabel: 'None', rightLabel: 'Frequent' },
];

// ---------------------------------------------------------------------------
// Labeled Input
// ---------------------------------------------------------------------------

function LabeledInput({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const c = useThemeColors();
  return (
    <View className="gap-1.5">
      <Text className="text-sm" style={{ color: c.textMuted }}>
        {label}
      </Text>
      <TextInput
        className={`px-4 rounded-xl text-[15px] ${multiline ? 'pt-3 pb-3 min-h-[100px]' : 'h-12'}`}
        style={{
          backgroundColor: c.surfaceElevated,
          borderWidth: 1,
          borderColor: c.border,
          color: c.textPrimary,
        }}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={c.textMuted}
        selectionColor={c.teal}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        autoCorrect={false}
        returnKeyType={multiline ? 'default' : 'done'}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Style Slider
// ---------------------------------------------------------------------------

function StyleSlider({
  config,
  value,
  onValueChange,
}: {
  config: SliderConfig;
  value: number;
  onValueChange: (v: number) => void;
}) {
  const c = useThemeColors();
  return (
    <View className="gap-1">
      <Text className="text-[13px] font-medium" style={{ color: c.textPrimary }}>
        {config.label}
      </Text>
      <Slider
        minimumValue={0}
        maximumValue={100}
        step={1}
        value={value}
        onValueChange={onValueChange}
        minimumTrackTintColor={c.teal}
        maximumTrackTintColor={c.charcoal700}
        thumbTintColor={Platform.OS === 'ios' ? c.white : c.teal}
        style={{ height: 36 }}
      />
      <View className="flex-row justify-between px-0.5">
        <Text className="text-[11px]" style={{ color: c.textMuted }}>
          {config.leftLabel}
        </Text>
        <Text className="text-[11px]" style={{ color: c.textMuted }}>
          Default
        </Text>
        <Text className="text-[11px]" style={{ color: c.textMuted }}>
          {config.rightLabel}
        </Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Theme segmented control
// ---------------------------------------------------------------------------

const THEME_OPTIONS: { mode: ThemeMode; label: string; Icon: typeof Sun }[] = [
  { mode: 'light', label: 'Light', Icon: Sun },
  { mode: 'dark', label: 'Dark', Icon: Moon },
  { mode: 'system', label: 'System', Icon: Monitor },
];

function ThemeSegmentedControl({
  value,
  onChange,
}: {
  value: ThemeMode;
  onChange: (mode: ThemeMode) => void;
}) {
  const c = useThemeColors();
  return (
    <View className="gap-2">
      <Text className="text-sm" style={{ color: c.textMuted }}>
        Appearance
      </Text>
      <View className="flex-row gap-2">
        {THEME_OPTIONS.map(({ mode, label, Icon }) => {
          const selected = value === mode;
          return (
            <Pressable
              key={mode}
              onPress={() => onChange(mode)}
              className="flex-1 items-center gap-1.5 py-2.5 rounded-xl"
              style={{
                backgroundColor: selected ? 'rgba(33,128,141,0.15)' : c.border,
                borderWidth: 1,
                borderColor: selected ? 'rgba(33,128,141,0.3)' : c.border,
              }}
              accessibilityLabel={label}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
            >
              <Icon size={16} color={selected ? c.teal : c.textMuted} />
              <Text className="text-xs" style={{ color: selected ? c.teal : c.textSecondary }}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text className="text-[11px] leading-4" style={{ color: c.textMuted }}>
        Light mode is coming soon — preference is saved but UI is currently dark only.
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function PersonalizationScreen() {
  const router = useRouter();
  const c = useThemeColors();
  const personalization = useSettingsStore((s) => s.personalization);
  const setPersonalization = useSettingsStore((s) => s.setPersonalization);
  const themeMode = useSettingsStore((s) => s.themeMode);
  const setThemeMode = useSettingsStore((s) => s.setThemeMode);

  // Local editing state — commit on Save
  const [fullName, setFullName] = useState(personalization.fullName);
  const [nickname, setNickname] = useState(personalization.nickname);
  const [occupation, setOccupation] = useState(personalization.occupation);
  const [instructions, setInstructions] = useState(personalization.instructions);
  const [warmth, setWarmth] = useState(personalization.warmth);
  const [enthusiasm, setEnthusiasm] = useState(personalization.enthusiasm);
  const [headersLists, setHeadersLists] = useState(personalization.headersLists);
  const [emoji, setEmoji] = useState(personalization.emoji);

  const sliderValues: Record<SliderConfig['key'], number> = {
    warmth,
    enthusiasm,
    headersLists,
    emoji,
  };

  const sliderSetters: Record<SliderConfig['key'], (v: number) => void> = {
    warmth: setWarmth,
    enthusiasm: setEnthusiasm,
    headersLists: setHeadersLists,
    emoji: setEmoji,
  };

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)' as Parameters<typeof router.replace>[0]);
  }, [router]);

  const hasChanges = useMemo(() => {
    return (
      fullName !== personalization.fullName ||
      nickname !== personalization.nickname ||
      occupation !== personalization.occupation ||
      instructions !== personalization.instructions ||
      warmth !== personalization.warmth ||
      enthusiasm !== personalization.enthusiasm ||
      headersLists !== personalization.headersLists ||
      emoji !== personalization.emoji
    );
  }, [
    fullName,
    nickname,
    occupation,
    instructions,
    warmth,
    enthusiasm,
    headersLists,
    emoji,
    personalization,
  ]);

  const handleBack = useCallback(() => {
    if (hasChanges) {
      Alert.alert('Discard changes?', 'You have unsaved changes.', [
        { text: 'Discard', style: 'destructive', onPress: goBack },
        { text: 'Keep Editing', style: 'cancel' },
      ]);
    } else {
      goBack();
    }
  }, [hasChanges, goBack]);

  const handleSave = useCallback(() => {
    setPersonalization({
      fullName: fullName.trim(),
      nickname: nickname.trim(),
      occupation: occupation.trim(),
      instructions: instructions.trim(),
      warmth,
      enthusiasm,
      headersLists,
      emoji,
    });
    goBack();
  }, [
    fullName,
    nickname,
    occupation,
    instructions,
    warmth,
    enthusiasm,
    headersLists,
    emoji,
    setPersonalization,
    goBack,
  ]);

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: c.surfaceBase }}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-3 h-12">
        <View className="flex-row items-center">
          <Pressable
            onPress={handleBack}
            className="p-2 rounded-lg active:bg-white/5"
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <ArrowLeft size={20} color={c.textSecondary} />
          </Pressable>
          <Text variant="subheading" className="ml-2" style={{ color: c.textPrimary }}>
            Personalization
          </Text>
        </View>
        <Pressable
          onPress={handleSave}
          className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-lg active:bg-white/5"
          accessibilityLabel="Save personalization settings"
          accessibilityRole="button"
        >
          <Check size={16} color={c.teal} />
          <Text className="text-sm font-medium" style={{ color: c.teal }}>
            Save
          </Text>
        </Pressable>
      </View>

      <ScrollView
        className="flex-1 px-4"
        contentContainerStyle={{ paddingBottom: 40, gap: 16 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Theme */}
        <View>
          <Text
            className="text-[11px] uppercase tracking-wider font-semibold mb-3 px-1"
            style={{ color: c.textMuted }}
          >
            Theme
          </Text>
          <Card>
            <ThemeSegmentedControl value={themeMode} onChange={setThemeMode} />
          </Card>
        </View>

        {/* Text Fields */}
        <Card className="gap-4 mt-2">
          <LabeledInput
            label="Full Name"
            value={fullName}
            onChangeText={setFullName}
            placeholder="Your full name"
          />
          <LabeledInput
            label="Nickname"
            value={nickname}
            onChangeText={setNickname}
            placeholder="What should AI call you?"
          />
          <LabeledInput
            label="Occupation"
            value={occupation}
            onChangeText={setOccupation}
            placeholder="e.g. Founder & Engineer"
          />
          <LabeledInput
            label="Custom Instructions"
            value={instructions}
            onChangeText={setInstructions}
            placeholder="e.g. I prefer direct, technical answers..."
            multiline
          />
        </Card>

        {/* Response Style */}
        <View>
          <Text
            className="text-[11px] uppercase tracking-wider font-semibold mb-3 px-1"
            style={{ color: c.textMuted }}
          >
            Response Style
          </Text>
          <Card className="gap-5">
            {SLIDERS.map((slider) => (
              <StyleSlider
                key={slider.key}
                config={slider}
                value={sliderValues[slider.key]}
                onValueChange={sliderSetters[slider.key]}
              />
            ))}
          </Card>
        </View>

        {/* Note */}
        <View className="mx-1 px-3 py-2.5 rounded-lg" style={{ backgroundColor: c.border }}>
          <Text className="text-[11px] leading-4" style={{ color: c.textMuted }}>
            Preferences apply to all conversations. Your name and instructions are included as
            context when chatting with AI.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
