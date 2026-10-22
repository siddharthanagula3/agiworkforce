import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { View, ScrollView, TextInput, Alert, Modal } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Check, ChevronsUpDown } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useLocalSettingsStore } from '@/stores/settings/localSettingsStore';
import { useCloudSettingsStore } from '@/stores/settings/cloudSettingsStore';
import type {
  PreferredLength,
  ResponseStyleTraitKey,
  ResponseStyleTraitLevel,
  TechnicalLevel,
} from '@agiworkforce/types';
import {
  PRODUCT_BRAND,
  RESPONSE_LANGUAGE_AUTO,
  RESPONSE_STYLE_TRAITS,
  RESPONSE_STYLE_TRAIT_LEVELS,
  RESPONSE_STYLE_TRAIT_NEUTRAL,
  responseStyleTraitLevel,
  responseStyleTraitScore,
} from '@agiworkforce/types';
import { SELECTABLE_LANGUAGES } from '@agiworkforce/i18n';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { useChatViewStore } from '@/stores/chat/chatViewStore';
import {
  PERSONALIZATION_LENGTHS,
  PERSONALIZATION_STYLES,
  PERSONALIZATION_TECHNICAL_LEVELS,
} from './constants';
import { useAuthStore } from '@/src/features/auth/store';
import { api } from '@/services/api';
import { confirmDiscardChanges } from '@/src/shared/hooks/useUnsavedChangesGuard';
import { toUserMessage } from '@/services/userMessage';
import { ScreenHeader } from '@/src/shared/components/cloud-screen';
import { API_URL } from '@/lib/constants';
import { openExternalUrl } from '@/lib/safeOpenURL';

const MAX_ABOUT_YOU_CHARS = 1500;

const ACCEPTABLE_USE_URL = new URL('/acceptable-use', API_URL).toString();

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
                className="text-sm font-medium"
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
  helper,
  error,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
  helper?: ReactNode;
  error?: string | null;
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
          borderColor: error ? c.agentError : c.border,
          color: c.textPrimary,
          letterSpacing: 0,
        }}
        accessibilityLabel={label}
        accessibilityHint={error ?? undefined}
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
      {error ? (
        <Text accessibilityRole="alert" className="text-sm" style={{ color: c.agentError }}>
          {error}
        </Text>
      ) : helper ? (
        <Text className="text-sm leading-5" style={{ color: c.textMuted }}>
          {helper}
        </Text>
      ) : null}
    </View>
  );
}

function levelLabel(level: ResponseStyleTraitLevel): string {
  return RESPONSE_STYLE_TRAIT_LEVELS.find((entry) => entry.value === level)?.label ?? level;
}

function TraitRow({
  label,
  level,
  onPress,
  isFirst,
}: {
  label: string;
  level: ResponseStyleTraitLevel;
  onPress: () => void;
  isFirst: boolean;
}) {
  const c = useThemeColors();
  const valueLabel = levelLabel(level);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${valueLabel}`}
      accessibilityHint="Opens the level picker"
      style={({ pressed }) => ({
        minHeight: 52,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderTopWidth: isFirst ? 0 : 1,
        borderTopColor: c.border,
        backgroundColor: pressed ? c.surfaceHover : c.transparent,
      })}
    >
      <Text style={{ flex: 1, color: c.textPrimary, fontSize: typeScale.body }}>{label}</Text>
      <Text style={{ color: c.textMuted, fontSize: typeScale.body }}>{valueLabel}</Text>
      <ChevronsUpDown size={16} color={c.textMuted} />
    </Pressable>
  );
}

function TraitLevelSheet({
  trait,
  level,
  onSelect,
  onClose,
}: {
  trait: { key: ResponseStyleTraitKey; label: string } | null;
  level: ResponseStyleTraitLevel;
  onSelect: (level: ResponseStyleTraitLevel) => void;
  onClose: () => void;
}) {
  const c = useThemeColors();
  return (
    <Modal visible={trait !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        accessible={false}
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: c.scrim }}
        onPress={onClose}
      >
        <Pressable accessible={false} onPress={(event) => event.stopPropagation()}>
          <View
            accessibilityViewIsModal
            style={{
              backgroundColor: c.surfaceOverlay,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingTop: 16,
              paddingBottom: 24,
            }}
          >
            <Text
              accessibilityRole="header"
              style={{
                color: c.textPrimary,
                fontSize: typeScale.callout,
                fontWeight: '700',
                paddingHorizontal: 18,
                paddingBottom: 12,
              }}
            >
              {trait?.label ?? ''}
            </Text>
            {RESPONSE_STYLE_TRAIT_LEVELS.map((option, index) => {
              const selected = option.value === level;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => onSelect(option.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${trait?.label ?? ''} ${option.label}`}
                  style={({ pressed }) => ({
                    minHeight: 52,
                    paddingHorizontal: 18,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    borderTopWidth: index === 0 ? 0 : 1,
                    borderTopColor: c.border,
                    backgroundColor: pressed ? c.surfaceHover : c.transparent,
                  })}
                >
                  <Text style={{ flex: 1, color: c.textPrimary, fontSize: typeScale.body }}>
                    {option.label}
                  </Text>
                  {selected ? <Check size={17} color={c.teal} /> : null}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
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
  const [resetChatStyle, setResetChatStyle] = useState(false);
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
    setResetChatStyle(false);
    setStyle(personalization.style);
    setWarmth(personalization.warmth);
    setEnthusiasm(personalization.enthusiasm);
    setHeadersLists(personalization.headersLists);
    setEmoji(personalization.emoji);
  }, [clerkUserId, isCloud, personalization]);

  const [openTrait, setOpenTrait] = useState<ResponseStyleTraitKey | null>(null);

  const traitScores: Record<ResponseStyleTraitKey, number> = {
    warmth,
    enthusiasm,
    headersLists,
    emoji,
  };

  const traitSetters: Record<ResponseStyleTraitKey, (v: number) => void> = {
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
      resetChatStyle ||
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
    resetChatStyle,
    style,
    warmth,
    enthusiasm,
    headersLists,
    emoji,
    personalization,
  ]);

  const handleResetStyle = useCallback(() => {
    draftDirtyRef.current = true;
    setResetChatStyle(true);
    setStyle('default');
    setPreferredLength('default');
    setTechnicalLevel('unspecified');
    setResponseLanguage(RESPONSE_LANGUAGE_AUTO);
    setWarmth(RESPONSE_STYLE_TRAIT_NEUTRAL);
    setEnthusiasm(RESPONSE_STYLE_TRAIT_NEUTRAL);
    setHeadersLists(RESPONSE_STYLE_TRAIT_NEUTRAL);
    setEmoji(RESPONSE_STYLE_TRAIT_NEUTRAL);
  }, []);

  const handleBack = useCallback(() => {
    if (hasChanges) {
      confirmDiscardChanges(goBack);
    } else {
      goBack();
    }
  }, [hasChanges, goBack]);

  const fullNameError =
    personalization.fullName.trim() !== '' && fullName.trim() === ''
      ? 'Enter your full name.'
      : null;
  const canSave = hasChanges && fullNameError === null;

  const handleSave = useCallback(() => {
    if (!canSave) return;
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
    if (resetChatStyle) {
      useChatViewStore.getState().setChatStyle('normal');
      setResetChatStyle(false);
    }
    goBack();
  }, [
    canSave,
    fullName,
    nickname,
    occupation,
    aboutYou,
    instructions,
    preferredLength,
    technicalLevel,
    responseLanguage,
    resetChatStyle,
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
      <ScreenHeader
        title={isCloud ? 'Cloud Personalization' : 'Personalization'}
        onBack={handleBack}
        trailing={
          <Pressable
            onPress={handleSave}
            disabled={!canSave}
            className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-lg"
            style={({ pressed }) => ({
              backgroundColor: pressed ? c.surfaceHover : c.transparent,
            })}
            accessibilityLabel="Save personalization settings"
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSave }}
          >
            <Check size={16} color={canSave ? c.teal : c.textMuted} />
            <Text className="text-sm font-medium" style={{ color: canSave ? c.teal : c.textMuted }}>
              Save
            </Text>
          </Pressable>
        }
      />

      <ScrollView
        className="flex-1 px-4"
        contentContainerStyle={{ paddingBottom: 40, gap: 16 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Card className="gap-4 mt-2">
          <LabeledInput
            label="Full Name"
            value={fullName}
            onChangeText={(value) => {
              draftDirtyRef.current = true;
              setFullName(value);
            }}
            placeholder="Your full name"
            error={fullNameError}
          />
          <LabeledInput
            label="Nickname"
            value={nickname}
            onChangeText={(value) => {
              draftDirtyRef.current = true;
              setNickname(value);
            }}
            placeholder="What should AGI call you?"
            helper={`${PRODUCT_BRAND} uses your nickname in chat.`}
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
            helper={
              <>
                Used in every chat, within our{' '}
                <Text
                  className="text-sm leading-5"
                  style={{ color: c.teal }}
                  accessibilityRole="link"
                  onPress={() => void openExternalUrl(ACCEPTABLE_USE_URL)}
                >
                  acceptable use policy
                </Text>
                .
              </>
            }
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

        <View>
          <Text
            className="text-sm uppercase tracking-wider font-semibold mb-3 px-1"
            style={{ color: c.textMuted }}
          >
            Response Style
          </Text>
          <Card style={{ paddingVertical: 0 }}>
            {RESPONSE_STYLE_TRAITS.map((trait, index) => (
              <TraitRow
                key={trait.key}
                label={trait.label}
                level={responseStyleTraitLevel(traitScores[trait.key])}
                onPress={() => setOpenTrait(trait.key)}
                isFirst={index === 0}
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
          accessibilityHint="Puts style, length, level, language and the Less, Default or More levels back to their defaults. Save to keep it."
        >
          <Text className="text-sm font-medium" style={{ color: c.textPrimary }}>
            Reset response style
          </Text>
        </Pressable>

        <View
          className="mx-1 px-3 py-2.5 rounded-lg"
          style={{
            backgroundColor: c.surfaceElevated,
            borderWidth: 1,
            borderColor: c.border,
          }}
        >
          <Text className="text-sm leading-5" style={{ color: c.textMuted }}>
            Your name, instructions and preferences apply to every chat.
          </Text>
        </View>
      </ScrollView>
      <TraitLevelSheet
        trait={RESPONSE_STYLE_TRAITS.find((trait) => trait.key === openTrait) ?? null}
        level={openTrait ? responseStyleTraitLevel(traitScores[openTrait]) : 'default'}
        onSelect={(level) => {
          if (openTrait) traitSetters[openTrait](responseStyleTraitScore(level));
          setOpenTrait(null);
        }}
        onClose={() => setOpenTrait(null)}
      />
    </SafeAreaView>
  );
}
