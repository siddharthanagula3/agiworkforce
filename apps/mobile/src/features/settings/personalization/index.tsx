/**
 * Personalization Settings Screen
 *
 * User profile fields (name, nickname, occupation, custom instructions)
 * plus 4 response-style sliders (warmth, enthusiasm, headers/lists, emoji).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, ScrollView, Pressable, TextInput, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Slider from '@react-native-community/slider';
import { ArrowLeft, Check, Sun, Moon, Monitor } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useLocalSettingsStore } from '@/stores/settings/localSettingsStore';
import { useCloudSettingsStore } from '@/stores/settings/cloudSettingsStore';
import type { ThemeMode, PersonalizationStyle } from '@/stores/settingsStore';
import { useThemeColors } from '@/src/ui/theme';
import {
  PERSONALIZATION_SLIDERS as SLIDERS,
  PERSONALIZATION_STYLES,
  type StyleSliderConfig as SliderConfig,
} from './constants';
import { useAuthStore } from '@/src/features/auth/store';

// ---------------------------------------------------------------------------
// Style preset selector
// ---------------------------------------------------------------------------

function StylePresetSelector({
  value,
  onChange,
}: {
  value: PersonalizationStyle;
  onChange: (style: PersonalizationStyle) => void;
}) {
  const c = useThemeColors();
  return (
    <View className="gap-2">
      <Text className="text-sm" style={{ color: c.textMuted }}>
        Style Preset
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {PERSONALIZATION_STYLES.map((option) => {
          const selected = value === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              className="px-3 py-2 rounded-xl"
              style={{
                backgroundColor: selected ? c.accentSurface : c.surfaceBase,
                borderWidth: 1,
                borderColor: selected ? c.accentBorder : c.border,
              }}
              accessibilityLabel={`${option.label} style`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <Text
                className="text-xs font-medium"
                style={{ color: selected ? c.teal : c.textSecondary }}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

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
          letterSpacing: 0,
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
                backgroundColor: selected ? c.accentSurface : c.surfaceBase,
                borderWidth: 1,
                borderColor: selected ? c.accentBorder : c.border,
              }}
              accessibilityLabel={label}
              accessibilityRole="button"
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
        System follows your device appearance setting.
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
  const { scope } = useLocalSearchParams<{ scope?: string }>();
  const globalIsCloud = useChatAppModeStore((s) => s.appMode) === 'cloud';
  // An explicit ?scope= from navigation (Settings' "Local Mode" vs "Cloud"
  // sections) always wins over the current chat toggle, so this screen never
  // silently shows Cloud data under a "Local Mode" tap or vice versa.
  const isCloud = scope === 'cloud' ? true : scope === 'local' ? false : globalIsCloud;

  const localPersonalization = useLocalSettingsStore((s) => s.personalization);
  const localSetPersonalization = useLocalSettingsStore((s) => s.setPersonalization);
  const localThemeMode = useLocalSettingsStore((s) => s.themeMode);
  const localSetThemeMode = useLocalSettingsStore((s) => s.setThemeMode);
  const cloudPersonalization = useCloudSettingsStore((s) => s.personalization);
  const cloudSetPersonalization = useCloudSettingsStore((s) => s.setPersonalization);
  const cloudThemeMode = useCloudSettingsStore((s) => s.themeMode);
  const cloudSetThemeMode = useCloudSettingsStore((s) => s.setThemeMode);
  const clerkUserId = useAuthStore((s) => s.clerkUserId);

  const personalization = isCloud ? cloudPersonalization : localPersonalization;
  const setPersonalization = isCloud ? cloudSetPersonalization : localSetPersonalization;
  const themeMode = isCloud ? cloudThemeMode : localThemeMode;
  const setThemeMode = isCloud ? cloudSetThemeMode : localSetThemeMode;

  // Local editing state — commit on Save
  const [fullName, setFullName] = useState(personalization.fullName);
  const [nickname, setNickname] = useState(personalization.nickname);
  const [occupation, setOccupation] = useState(personalization.occupation);
  const [instructions, setInstructions] = useState(personalization.instructions);
  const [style, setStyle] = useState(personalization.style);
  const [warmth, setWarmth] = useState(personalization.warmth);
  const [enthusiasm, setEnthusiasm] = useState(personalization.enthusiasm);
  const [headersLists, setHeadersLists] = useState(personalization.headersLists);
  const [emoji, setEmoji] = useState(personalization.emoji);
  const draftDirtyRef = useRef(false);
  const previousCloudOwnerRef = useRef<string | null | undefined>(
    isCloud ? clerkUserId : undefined,
  );

  // Expo Router can reuse this screen's instance across pushes to the same
  // route with only the `scope` search param changing (Local <-> Cloud), so
  // the `useState` initializers above only run on the very first mount. Without
  // this resync, editing Cloud Personalization then navigating to Local
  // Personalization (or vice versa) would show stale unsaved edits from the
  // other scope instead of that scope's real data — resync whenever the
  // resolved scope actually changes.
  const prevIsCloudRef = useRef(isCloud);
  useEffect(() => {
    const scopeChanged = prevIsCloudRef.current !== isCloud;
    const cloudOwnerChanged =
      isCloud &&
      previousCloudOwnerRef.current !== undefined &&
      previousCloudOwnerRef.current !== clerkUserId;
    if (isCloud) previousCloudOwnerRef.current = clerkUserId;
    // A first Cloud pull may arrive after this screen mounts. Adopt it while
    // the draft is pristine, but never overwrite text or slider changes the
    // user is actively editing. Scope changes always load the destination
    // scope and clear the dirty marker.
    if (!scopeChanged && !cloudOwnerChanged && draftDirtyRef.current) return;
    prevIsCloudRef.current = isCloud;
    draftDirtyRef.current = false;
    setFullName(personalization.fullName);
    setNickname(personalization.nickname);
    setOccupation(personalization.occupation);
    setInstructions(personalization.instructions);
    setStyle(personalization.style);
    setWarmth(personalization.warmth);
    setEnthusiasm(personalization.enthusiasm);
    setHeadersLists(personalization.headersLists);
    setEmoji(personalization.emoji);
  }, [clerkUserId, isCloud, personalization]);

  const sliderValues: Record<SliderConfig['key'], number> = {
    warmth,
    enthusiasm,
    headersLists,
    emoji,
  };

  const sliderSetters: Record<SliderConfig['key'], (v: number) => void> = {
    warmth: (value) => {
      draftDirtyRef.current = true;
      setWarmth(value);
    },
    enthusiasm: (value) => {
      draftDirtyRef.current = true;
      setEnthusiasm(value);
    },
    headersLists: (value) => {
      draftDirtyRef.current = true;
      setHeadersLists(value);
    },
    emoji: (value) => {
      draftDirtyRef.current = true;
      setEmoji(value);
    },
  };

  const goBack = useCallback(() => {
    router.replace('/(app)/(tabs)/settings' as Parameters<typeof router.replace>[0]);
  }, [router]);

  const hasChanges = useMemo(() => {
    return (
      fullName !== personalization.fullName ||
      nickname !== personalization.nickname ||
      occupation !== personalization.occupation ||
      instructions !== personalization.instructions ||
      style !== personalization.style ||
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
    style,
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
    // The store write below is now the saved baseline. Clear before writing so
    // the same-scope store update can normalize trimmed values into the draft.
    draftDirtyRef.current = false;
    setPersonalization({
      fullName: fullName.trim(),
      nickname: nickname.trim(),
      occupation: occupation.trim(),
      instructions: instructions.trim(),
      style,
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
    style,
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
            className="p-2 rounded-lg"
            style={({ pressed }) => ({
              backgroundColor: pressed ? c.surfaceHover : c.transparent,
            })}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <ArrowLeft size={20} color={c.textSecondary} />
          </Pressable>
          <Text variant="subheading" className="ml-2" style={{ color: c.textPrimary }}>
            {isCloud ? 'Cloud Personalization' : 'Personalization'}
          </Text>
        </View>
        <Pressable
          onPress={handleSave}
          className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-lg"
          style={({ pressed }) => ({
            backgroundColor: pressed ? c.surfaceHover : c.transparent,
          })}
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
            onChangeText={(value) => {
              draftDirtyRef.current = true;
              setFullName(value);
            }}
            placeholder="Your full name"
          />
          <LabeledInput
            label="Nickname"
            value={nickname}
            onChangeText={(value) => {
              draftDirtyRef.current = true;
              setNickname(value);
            }}
            placeholder="What should AGI call you?"
          />
          <LabeledInput
            label="Occupation"
            value={occupation}
            onChangeText={(value) => {
              draftDirtyRef.current = true;
              setOccupation(value);
            }}
            placeholder="e.g. Founder & Engineer"
          />
          <LabeledInput
            label="Custom Instructions"
            value={instructions}
            onChangeText={(value) => {
              draftDirtyRef.current = true;
              setInstructions(value);
            }}
            placeholder="e.g. I prefer direct, technical answers..."
            multiline
          />
        </Card>

        {/* Base style preset */}
        <Card className="mt-2">
          <StylePresetSelector
            value={style}
            onChange={(value) => {
              draftDirtyRef.current = true;
              setStyle(value);
            }}
          />
        </Card>

        {/* Response Style dials */}
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
        <View
          className="mx-1 px-3 py-2.5 rounded-lg"
          style={{
            backgroundColor: c.surfaceElevated,
            borderWidth: 1,
            borderColor: c.border,
          }}
        >
          <Text className="text-[11px] leading-4" style={{ color: c.textMuted }}>
            Preferences apply to all conversations. Your name and instructions are included as
            context when chatting with AGI.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
