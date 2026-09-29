import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, ScrollView, TextInput, Platform, Alert } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Slider from '@react-native-community/slider';
import { ArrowLeft, Check } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useLocalSettingsStore } from '@/stores/settings/localSettingsStore';
import { useCloudSettingsStore } from '@/stores/settings/cloudSettingsStore';
import type { PreferredLength, TechnicalLevel } from '@agiworkforce/types';
import { RESPONSE_LANGUAGE_AUTO } from '@agiworkforce/types';
import { SELECTABLE_LANGUAGES } from '@agiworkforce/i18n';
import { useThemeColors } from '@/src/ui/theme';
import { useChatViewStore } from '@/stores/chat/chatViewStore';
import {
  PERSONALIZATION_LENGTHS,
  PERSONALIZATION_SLIDERS as SLIDERS,
  PERSONALIZATION_STYLES,
  PERSONALIZATION_TECHNICAL_LEVELS,
  type StyleSliderConfig as SliderConfig,
} from './constants';
import { useAuthStore } from '@/src/features/auth/store';
import { api } from '@/services/api';
import { confirmDiscardChanges } from '@/src/shared/hooks/useUnsavedChangesGuard';
import { toUserMessage } from '@/services/userMessage';

const MAX_ABOUT_YOU_CHARS = 1500;

const RESPONSE_LANGUAGE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: RESPONSE_LANGUAGE_AUTO, label: 'Match my message' },
  ...SELECTABLE_LANGUAGES.map((language) => ({ value: language.code, label: language.nativeName })),
];

function ChoiceChips<T extends string>({
  label,
  options,
  value,
  onChange,
  optionAccessibilityLabel,
}: {
  label: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  optionAccessibilityLabel?: (optionLabel: string) => string;
}) {
  const c = useThemeColors();
  return (
    <View className="gap-2">
      <Text className="text-sm" style={{ color: c.textMuted }}>
        {label}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {options.map((option) => {
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
              accessibilityLabel={
                optionAccessibilityLabel
                  ? optionAccessibilityLabel(option.label)
                  : `${label}: ${option.label}`
              }
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
        <Text className="text-xs" style={{ color: c.textMuted }}>
          {config.leftLabel}
        </Text>
        <Text className="text-xs" style={{ color: c.textMuted }}>
          Default
        </Text>
        <Text className="text-xs" style={{ color: c.textMuted }}>
          {config.rightLabel}
        </Text>
      </View>
    </View>
  );
}

export default function PersonalizationScreen() {
  const router = useRouter();
  const c = useThemeColors();
  const isCloud = useChatAppModeStore((s) => s.appMode) === 'cloud';

  const localPersonalization = useLocalSettingsStore((s) => s.personalization);
  const localSetPersonalization = useLocalSettingsStore((s) => s.setPersonalization);
  const cloudPersonalization = useCloudSettingsStore((s) => s.personalization);
  const cloudSetPersonalization = useCloudSettingsStore((s) => s.setPersonalization);
  const clerkUserId = useAuthStore((s) => s.clerkUserId);

  const personalization = isCloud ? cloudPersonalization : localPersonalization;
  const setPersonalization = isCloud ? cloudSetPersonalization : localSetPersonalization;

  const [fullName, setFullName] = useState(personalization.fullName);
  const [nickname, setNickname] = useState(personalization.nickname);
  const [occupation, setOccupation] = useState(personalization.occupation);
  const [aboutYou, setAboutYou] = useState(personalization.aboutYou ?? '');
  const [instructions, setInstructions] = useState(personalization.instructions);
  const [preferredLength, setPreferredLength] = useState<PreferredLength>(
    personalization.preferredLength ?? 'default',
  );
  const [technicalLevel, setTechnicalLevel] = useState<TechnicalLevel>(
    personalization.technicalLevel ?? 'unspecified',
  );
  const [responseLanguage, setResponseLanguage] = useState(
    personalization.responseLanguage ?? RESPONSE_LANGUAGE_AUTO,
  );
  const resetChatStyleRef = useRef(false);
  const [style, setStyle] = useState(personalization.style);
  const [warmth, setWarmth] = useState(personalization.warmth);
  const [enthusiasm, setEnthusiasm] = useState(personalization.enthusiasm);
  const [headersLists, setHeadersLists] = useState(personalization.headersLists);
  const [emoji, setEmoji] = useState(personalization.emoji);
  const draftDirtyRef = useRef(false);
  const previousCloudOwnerRef = useRef<string | null | undefined>(
    isCloud ? clerkUserId : undefined,
  );

  const prevIsCloudRef = useRef(isCloud);
  useEffect(() => {
    const scopeChanged = prevIsCloudRef.current !== isCloud;
    const cloudOwnerChanged =
      isCloud &&
      previousCloudOwnerRef.current !== undefined &&
      previousCloudOwnerRef.current !== clerkUserId;
    if (isCloud) previousCloudOwnerRef.current = clerkUserId;
    if (!scopeChanged && !cloudOwnerChanged && draftDirtyRef.current) return;
    prevIsCloudRef.current = isCloud;
    draftDirtyRef.current = false;
    setFullName(personalization.fullName);
    setNickname(personalization.nickname);
    setOccupation(personalization.occupation);
    setAboutYou(personalization.aboutYou ?? '');
    setInstructions(personalization.instructions);
    setPreferredLength(personalization.preferredLength ?? 'default');
    setTechnicalLevel(personalization.technicalLevel ?? 'unspecified');
    setResponseLanguage(personalization.responseLanguage ?? RESPONSE_LANGUAGE_AUTO);
    resetChatStyleRef.current = false;
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
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.navigate('/(app)/(tabs)/settings' as Parameters<typeof router.navigate>[0]);
  }, [router]);

  const hasChanges = useMemo(() => {
    return (
      fullName !== personalization.fullName ||
      nickname !== personalization.nickname ||
      occupation !== personalization.occupation ||
      aboutYou !== (personalization.aboutYou ?? '') ||
      instructions !== personalization.instructions ||
      preferredLength !== (personalization.preferredLength ?? 'default') ||
      technicalLevel !== (personalization.technicalLevel ?? 'unspecified') ||
      responseLanguage !== (personalization.responseLanguage ?? RESPONSE_LANGUAGE_AUTO) ||
      resetChatStyleRef.current ||
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
    aboutYou,
    instructions,
    preferredLength,
    technicalLevel,
    responseLanguage,
    style,
    warmth,
    enthusiasm,
    headersLists,
    emoji,
    personalization,
  ]);

  const handleResetStyle = useCallback(() => {
    draftDirtyRef.current = true;
    resetChatStyleRef.current = true;
    setStyle('default');
    setPreferredLength('default');
    setTechnicalLevel('unspecified');
    setResponseLanguage(RESPONSE_LANGUAGE_AUTO);
    setWarmth(50);
    setEnthusiasm(50);
    setHeadersLists(50);
    setEmoji(50);
  }, []);

  const handleBack = useCallback(() => {
    if (hasChanges) {
      confirmDiscardChanges(goBack);
    } else {
      goBack();
    }
  }, [hasChanges, goBack]);

  const handleSave = useCallback(() => {
    draftDirtyRef.current = false;
    const trimmedName = fullName.trim();
    if (isCloud && trimmedName && trimmedName !== personalization.fullName.trim()) {
      api.patch('/api/me', { display_name: trimmedName }).catch((error: unknown) => {
        Alert.alert(
          'Name not saved to your account',
          toUserMessage(error, 'Try again from Personalization.'),
        );
      });
    }
    setPersonalization({
      fullName: fullName.trim(),
      nickname: nickname.trim(),
      nameOptedOut: nickname.trim() === '',
      occupation: occupation.trim(),
      aboutYou: aboutYou.trim(),
      instructions: instructions.trim(),
      preferredLength,
      technicalLevel,
      responseLanguage,
      style,
      warmth,
      enthusiasm,
      headersLists,
      emoji,
    });
    if (resetChatStyleRef.current) {
      useChatViewStore.getState().setChatStyle('normal');
      resetChatStyleRef.current = false;
    }
    goBack();
  }, [
    fullName,
    nickname,
    occupation,
    aboutYou,
    instructions,
    preferredLength,
    technicalLevel,
    responseLanguage,
    style,
    warmth,
    enthusiasm,
    headersLists,
    emoji,
    setPersonalization,
    isCloud,
    personalization.fullName,
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
            label="More about you"
            value={aboutYou}
            onChangeText={(value) => {
              draftDirtyRef.current = true;
              setAboutYou(value.slice(0, MAX_ABOUT_YOU_CHARS));
            }}
            placeholder="Interests, values or background to keep in mind"
            multiline
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

        <Card className="mt-2 gap-4">
          <ChoiceChips
            label="Style Preset"
            options={PERSONALIZATION_STYLES}
            value={style}
            optionAccessibilityLabel={(optionLabel) => `${optionLabel} style`}
            onChange={(value) => {
              draftDirtyRef.current = true;
              setStyle(value);
            }}
          />
          <ChoiceChips
            label="Response Length"
            options={PERSONALIZATION_LENGTHS}
            value={preferredLength}
            onChange={(value) => {
              draftDirtyRef.current = true;
              setPreferredLength(value);
            }}
          />
          <ChoiceChips
            label="Technical Level"
            options={PERSONALIZATION_TECHNICAL_LEVELS}
            value={technicalLevel}
            onChange={(value) => {
              draftDirtyRef.current = true;
              setTechnicalLevel(value);
            }}
          />
          <ChoiceChips
            label="Response Language"
            options={RESPONSE_LANGUAGE_OPTIONS}
            value={responseLanguage}
            onChange={(value) => {
              draftDirtyRef.current = true;
              setResponseLanguage(value);
            }}
          />
        </Card>

        {/* Response Style dials */}
        <View>
          <Text
            className="text-xs uppercase tracking-wider font-semibold mb-3 px-1"
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

        <Pressable
          onPress={handleResetStyle}
          className="self-start px-3 py-2 rounded-xl"
          style={{ borderWidth: 1, borderColor: c.border }}
          accessibilityRole="button"
          accessibilityLabel="Reset response style"
          accessibilityHint="Puts style, length, level, language and the style dials back to their defaults. Save to keep it."
        >
          <Text className="text-xs font-medium" style={{ color: c.textPrimary }}>
            Reset response style
          </Text>
        </Pressable>

        {/* Note */}
        <View
          className="mx-1 px-3 py-2.5 rounded-lg"
          style={{
            backgroundColor: c.surfaceElevated,
            borderWidth: 1,
            borderColor: c.border,
          }}
        >
          <Text className="text-xs leading-4" style={{ color: c.textMuted }}>
            Preferences apply to all conversations. Your name and instructions are included as
            context when chatting with AGI.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
