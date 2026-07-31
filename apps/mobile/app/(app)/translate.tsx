import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  ScrollView,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  FlatList,
} from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, ArrowLeftRight, Check, ChevronDown, Copy, X } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import {
  translate,
  translateBackendLabel,
  SUPPORTED_LANGUAGES,
  DEFAULT_SOURCE_LANG,
  DEFAULT_TARGET_LANG,
  type TranslateResult,
  type LanguagePair,
} from '@/services/translateService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TranslateState {
  isTranslating: boolean;
  result: TranslateResult | null;
  errorMessage: string | null;
  tokensAccum: string;
}

const initialState = (): TranslateState => ({
  isTranslating: false,
  result: null,
  errorMessage: null,
  tokensAccum: '',
});

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export default function TranslateScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  // Prefill from the Siri/App Intents deep link (agiworkforce://intent/translate)
  // dispatched via app/_layout.tsx. Both params are optional free text from Siri.
  const params = useLocalSearchParams<{ text?: string; targetLanguage?: string }>();

  const [sourceLang, setSourceLang] = useState(DEFAULT_SOURCE_LANG);
  const [targetLang, setTargetLang] = useState(DEFAULT_TARGET_LANG);
  const [sourceText, setSourceText] = useState('');
  const [state, setState] = useState<TranslateState>(initialState);
  const [langPickerFor, setLangPickerFor] = useState<'source' | 'target' | null>(null);

  const abortRef = useRef(false);
  const prefilledRef = useRef(false);

  useEffect(() => {
    if (prefilledRef.current) return;
    const text = typeof params.text === 'string' ? params.text : undefined;
    const targetLanguage =
      typeof params.targetLanguage === 'string' ? params.targetLanguage : undefined;
    if (!text && !targetLanguage) return;

    prefilledRef.current = true;
    if (text) setSourceText(text);
    if (targetLanguage) {
      const match = SUPPORTED_LANGUAGES.find(
        (l) => l.label.toLowerCase() === targetLanguage.toLowerCase(),
      );
      if (match) setTargetLang(match.code);
    }
  }, [params.text, params.targetLanguage]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)' as Parameters<typeof router.replace>[0]);
  }, [router]);

  const handleSwapLanguages = useCallback(() => {
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
    const prev = state.result?.translatedText ?? '';
    setSourceText(prev);
    setState(initialState());
  }, [sourceLang, targetLang, state.result]);

  const handleClear = useCallback(() => {
    setSourceText('');
    setState(initialState());
  }, []);

  const handleTranslate = useCallback(async () => {
    if (!sourceText.trim() || state.isTranslating) return;

    abortRef.current = false;
    setState({ isTranslating: true, result: null, errorMessage: null, tokensAccum: '' });

    try {
      const result = await translate(sourceText, sourceLang, targetLang, {
        onToken: (token) => {
          if (abortRef.current) return;
          setState((prev) => ({ ...prev, tokensAccum: prev.tokensAccum + token }));
        },
      });
      if (!abortRef.current) {
        setState({ isTranslating: false, result, errorMessage: null, tokensAccum: '' });
      }
    } catch (err) {
      if (!abortRef.current) {
        setState({
          isTranslating: false,
          result: null,
          errorMessage: err instanceof Error ? err.message : 'Translation failed',
          tokensAccum: '',
        });
      }
    }
  }, [sourceText, sourceLang, targetLang, state.isTranslating]);

  const handleCopyResult = useCallback(() => {
    const text = state.result?.translatedText ?? state.tokensAccum;
    if (text) Clipboard.setStringAsync(text);
  }, [state.result, state.tokensAccum]);

  const handleSelectLang = useCallback(
    (lang: LanguagePair) => {
      if (langPickerFor === 'source') {
        if (lang.code === targetLang) {
          setTargetLang(sourceLang);
        }
        setSourceLang(lang.code);
      } else {
        if (lang.code === sourceLang) {
          setSourceLang(targetLang);
        }
        setTargetLang(lang.code);
      }
      setLangPickerFor(null);
      setState(initialState());
    },
    [langPickerFor, sourceLang, targetLang],
  );

  const sourceLangDef = SUPPORTED_LANGUAGES.find((l) => l.code === sourceLang);
  const targetLangDef = SUPPORTED_LANGUAGES.find((l) => l.code === targetLang);
  const displayedTranslation = state.result?.translatedText ?? state.tokensAccum;
  const backendLabel = state.result ? translateBackendLabel(state.result.backend) : null;
  const canTranslate = sourceText.trim().length > 0 && !state.isTranslating;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 12,
            height: 48,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            gap: 8,
          }}
        >
          <Pressable
            onPress={handleBack}
            style={{ padding: 8, borderRadius: 8 }}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <ArrowLeft size={20} color={colors.textSecondary} />
          </Pressable>
          <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: colors.textPrimary }}>
            Translate
          </Text>
          <Text style={{ fontSize: 11, color: colors.textMuted }}>On-device · Private</Text>
        </View>

        {/* Language selector bar */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            gap: 8,
          }}
        >
          <LanguageButton
            lang={sourceLangDef}
            onPress={() => setLangPickerFor('source')}
            colors={colors}
          />

          <Pressable
            onPress={handleSwapLanguages}
            style={{
              padding: 8,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surfaceElevated,
            }}
            accessibilityLabel="Swap languages"
            accessibilityRole="button"
          >
            <ArrowLeftRight size={16} color={colors.textSecondary} />
          </Pressable>

          <LanguageButton
            lang={targetLangDef}
            onPress={() => setLangPickerFor('target')}
            colors={colors}
          />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Source pane */}
          <View
            style={{
              backgroundColor: colors.surfaceElevated,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 12,
              minHeight: 140,
            }}
          >
            <Text style={{ fontSize: 11, color: colors.textMuted, marginBottom: 8 }}>
              {sourceLangDef?.label ?? sourceLang}
            </Text>
            <TextInput
              value={sourceText}
              onChangeText={(v) => {
                setSourceText(v);
                if (state.result || state.errorMessage) setState(initialState());
              }}
              multiline
              placeholder="Enter text to translate..."
              placeholderTextColor={colors.textMuted}
              style={{
                fontSize: 16,
                color: colors.textPrimary,
                minHeight: 80,
                textAlignVertical: 'top',
              }}
              accessibilityLabel="Source text input"
            />
            {sourceText.length > 0 && (
              <View
                style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8, gap: 8 }}
              >
                <Pressable
                  onPress={handleClear}
                  style={{ padding: 4 }}
                  accessibilityLabel="Clear text"
                  accessibilityRole="button"
                >
                  <X size={16} color={colors.textMuted} />
                </Pressable>
              </View>
            )}
          </View>

          {/* Translate button */}
          <Pressable
            onPress={handleTranslate}
            disabled={!canTranslate}
            style={({ pressed }) => ({
              backgroundColor: canTranslate
                ? pressed
                  ? `${colors.teal}cc`
                  : colors.teal
                : colors.surfaceElevated,
              borderRadius: 10,
              height: 44,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: canTranslate ? 1 : 0.5,
            })}
            accessibilityLabel="Translate"
            accessibilityRole="button"
            accessibilityState={{ disabled: !canTranslate }}
          >
            {state.isTranslating ? (
              <ActivityIndicator size="small" color={colors.background} />
            ) : (
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: '600',
                  color: canTranslate ? colors.background : colors.textMuted,
                }}
              >
                Translate
              </Text>
            )}
          </Pressable>

          {/* Target pane */}
          {(displayedTranslation.length > 0 || state.errorMessage || state.isTranslating) && (
            <View
              style={{
                backgroundColor: colors.surfaceElevated,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                padding: 12,
                minHeight: 140,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <Text style={{ fontSize: 11, color: colors.textMuted, flex: 1 }}>
                  {targetLangDef?.label ?? targetLang}
                </Text>
                {displayedTranslation.length > 0 && (
                  <Pressable
                    onPress={handleCopyResult}
                    style={{ padding: 4 }}
                    accessibilityLabel="Copy translation"
                    accessibilityRole="button"
                  >
                    <Copy size={14} color={colors.textMuted} />
                  </Pressable>
                )}
              </View>

              {state.errorMessage ? (
                <View
                  style={{
                    backgroundColor: 'rgba(239,68,68,0.1)',
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                  }}
                >
                  <Text style={{ fontSize: 13, color: '#f87171' }}>{state.errorMessage}</Text>
                </View>
              ) : (
                <Text
                  style={{
                    fontSize: 16,
                    color: colors.textPrimary,
                    lineHeight: 24,
                    minHeight: 80,
                  }}
                  selectable
                >
                  {displayedTranslation}
                </Text>
              )}

              {state.isTranslating && displayedTranslation.length === 0 && (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    marginTop: 8,
                  }}
                >
                  <ActivityIndicator size="small" color={colors.teal} />
                  <Text style={{ fontSize: 12, color: colors.textMuted }}>Translating...</Text>
                </View>
              )}

              {/* Performance chip */}
              {backendLabel && (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    marginTop: 12,
                    paddingTop: 8,
                    borderTopWidth: 1,
                    borderTopColor: colors.border,
                  }}
                >
                  <Text style={{ fontSize: 11, color: colors.textMuted }}>{backendLabel}</Text>
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Language picker modal */}
      <Modal
        visible={langPickerFor !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setLangPickerFor(null)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}
          onPress={() => setLangPickerFor(null)}
        >
          <View
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              backgroundColor: colors.surfaceElevated,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              maxHeight: '70%',
              paddingBottom: 32,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 20,
                paddingTop: 16,
                paddingBottom: 12,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
            >
              <Text style={{ flex: 1, fontSize: 16, fontWeight: '600', color: colors.textPrimary }}>
                {langPickerFor === 'source' ? 'Source Language' : 'Target Language'}
              </Text>
              <Pressable
                onPress={() => setLangPickerFor(null)}
                accessibilityLabel="Close language picker"
                accessibilityRole="button"
              >
                <X size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            <FlatList
              data={SUPPORTED_LANGUAGES}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => {
                const isActive =
                  langPickerFor === 'source' ? item.code === sourceLang : item.code === targetLang;
                return (
                  <Pressable
                    onPress={() => handleSelectLang(item)}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: 20,
                      paddingVertical: 14,
                      backgroundColor: pressed
                        ? colors.surfaceHover
                        : isActive
                          ? `${colors.teal}18`
                          : 'transparent',
                      gap: 12,
                    })}
                    accessibilityLabel={item.label}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 15,
                          color: isActive ? colors.teal : colors.textPrimary,
                          fontWeight: isActive ? '600' : '400',
                        }}
                      >
                        {item.label}
                      </Text>
                      <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 1 }}>
                        {item.nativeLabel}
                      </Text>
                    </View>
                    {isActive && <Check size={18} color={colors.teal} />}
                  </Pressable>
                );
              }}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Language Button
// ---------------------------------------------------------------------------

interface LanguageButtonProps {
  lang: LanguagePair | undefined;
  onPress: () => void;
  colors: ReturnType<typeof useThemeColors>;
}

function LanguageButton({ lang, onPress, colors }: LanguageButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: pressed ? colors.surfaceHover : colors.surfaceElevated,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.border,
        gap: 6,
      })}
      accessibilityLabel={`Select language: ${lang?.label ?? 'unknown'}`}
      accessibilityRole="button"
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPrimary }}>
          {lang?.label ?? '—'}
        </Text>
        <Text style={{ fontSize: 11, color: colors.textMuted }}>{lang?.nativeLabel ?? ''}</Text>
      </View>
      <ChevronDown size={14} color={colors.textMuted} />
    </Pressable>
  );
}
