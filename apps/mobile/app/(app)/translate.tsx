import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Modal,
  FlatList,
} from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, ArrowLeftRight, Check, ChevronDown, Copy, X } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import {
  translate,
  translateBackendLabel,
  findSupportedLanguage,
  SUPPORTED_LANGUAGES,
  DEFAULT_SOURCE_LANG,
  DEFAULT_TARGET_LANG,
  type TranslateResult,
  type LanguagePair,
} from '@/services/translateService';

interface TranslationOperation {
  revision: number;
  controller: AbortController;
  pending: boolean;
  result: TranslateResult | null;
}

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

export default function TranslateScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ text?: string; targetLanguage?: string }>();

  const [sourceLang, setSourceLang] = useState(DEFAULT_SOURCE_LANG);
  const [targetLang, setTargetLang] = useState(DEFAULT_TARGET_LANG);
  const [sourceText, setSourceText] = useState('');
  const [state, setState] = useState<TranslateState>(initialState);
  const [langPickerFor, setLangPickerFor] = useState<'source' | 'target' | null>(null);
  const [copyFailedFor, setCopyFailedFor] = useState<string | null>(null);

  const mountedRef = useRef(false);
  const focusedRef = useRef(false);
  const operationRef = useRef<TranslationOperation | null>(null);
  const draftRef = useRef({
    text: '',
    source: DEFAULT_SOURCE_LANG,
    target: DEFAULT_TARGET_LANG,
    revision: 0,
  });
  const prefilledRef = useRef(false);

  const retireOperation = useCallback(() => {
    const operation = operationRef.current;
    operationRef.current = null;
    draftRef.current.revision += 1;
    operation?.controller.abort();
  }, []);

  const updateDraft = useCallback(
    (text: string, source: string, target: string) => {
      retireOperation();
      draftRef.current = { text, source, target, revision: draftRef.current.revision };
      setSourceText(text);
      setSourceLang(source);
      setTargetLang(target);
      setState(initialState());
    },
    [retireOperation],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      retireOperation();
    };
  }, [retireOperation]);

  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      setState(initialState());
      return () => {
        focusedRef.current = false;
        retireOperation();
      };
    }, [retireOperation]),
  );

  useEffect(() => {
    if (prefilledRef.current) return;
    const text = typeof params.text === 'string' ? params.text : undefined;
    const targetLanguage =
      typeof params.targetLanguage === 'string' ? params.targetLanguage : undefined;
    if (!text && !targetLanguage) return;

    prefilledRef.current = true;
    const requestedTarget = targetLanguage?.trim() ? targetLanguage : undefined;
    const match = requestedTarget ? findSupportedLanguage(requestedTarget) : undefined;
    const draft = draftRef.current;
    const target = match?.code ?? draft.target;
    updateDraft(text ?? draft.text, target === draft.source ? draft.target : draft.source, target);
    if (requestedTarget && !match) {
      setState({
        ...initialState(),
        errorMessage: "That language isn't available for translation. Pick a target language.",
      });
    }
  }, [params.text, params.targetLanguage, updateDraft]);

  const handleBack = useCallback(() => {
    focusedRef.current = false;
    prefilledRef.current = true;
    retireOperation();
    setState(initialState());
    if (router.canGoBack()) router.back();
    else router.replace('/(app)' as Parameters<typeof router.replace>[0]);
  }, [router, retireOperation]);

  const handleSwapLanguages = useCallback(() => {
    prefilledRef.current = true;
    const draft = draftRef.current;
    const operation = operationRef.current;
    const result = operation?.revision === draft.revision ? operation.result : null;
    updateDraft(result?.translatedText ?? draft.text, draft.target, draft.source);
  }, [updateDraft]);

  const handleClear = useCallback(() => {
    prefilledRef.current = true;
    const draft = draftRef.current;
    updateDraft('', draft.source, draft.target);
  }, [updateDraft]);

  const handleChangeText = useCallback(
    (text: string) => {
      prefilledRef.current = true;
      const draft = draftRef.current;
      updateDraft(text, draft.source, draft.target);
    },
    [updateDraft],
  );

  const handleTranslate = useCallback(async () => {
    prefilledRef.current = true;
    const draft = draftRef.current;
    if (
      !mountedRef.current ||
      !focusedRef.current ||
      !draft.text.trim() ||
      operationRef.current?.pending
    )
      return;

    const operation: TranslationOperation = {
      revision: draft.revision,
      controller: new AbortController(),
      pending: true,
      result: null,
    };
    operationRef.current = operation;
    const isCurrent = () =>
      mountedRef.current &&
      focusedRef.current &&
      operationRef.current === operation &&
      draftRef.current.revision === operation.revision &&
      !operation.controller.signal.aborted;
    setState((previous) =>
      isCurrent()
        ? { isTranslating: true, result: null, errorMessage: null, tokensAccum: '' }
        : previous,
    );

    try {
      const result = await translate(draft.text, draft.source, draft.target, {
        signal: operation.controller.signal,
        onToken: (token) => {
          if (!isCurrent() || !operation.pending) return;
          setState((previous) =>
            isCurrent() && operation.pending
              ? { ...previous, tokensAccum: previous.tokensAccum + token }
              : previous,
          );
        },
      });
      if (!isCurrent()) return;
      operation.pending = false;
      operation.result = result;
      setState((previous) =>
        isCurrent()
          ? { isTranslating: false, result, errorMessage: null, tokensAccum: '' }
          : previous,
      );
    } catch {
      if (!isCurrent()) return;
      operation.pending = false;
      setState((previous) =>
        isCurrent()
          ? {
              isTranslating: false,
              result: null,
              errorMessage:
                'Translation could not finish on this device. Check your local model and try again.',
              tokensAccum: '',
            }
          : previous,
      );
    }
  }, []);

  const handleCopyResult = useCallback(() => {
    const text = state.result?.translatedText ?? state.tokensAccum;
    if (!text) return;
    setCopyFailedFor(null);
    Clipboard.setStringAsync(text)
      .then((copied) => {
        if (!copied && mountedRef.current) setCopyFailedFor(text);
      })
      .catch(() => {
        if (mountedRef.current) setCopyFailedFor(text);
      });
  }, [state.result, state.tokensAccum]);

  const handleSelectLang = useCallback(
    (lang: LanguagePair) => {
      prefilledRef.current = true;
      const draft = draftRef.current;
      if (langPickerFor === 'source') {
        updateDraft(
          draft.text,
          lang.code,
          lang.code === draft.target ? draft.source : draft.target,
        );
      } else if (langPickerFor === 'target') {
        updateDraft(
          draft.text,
          lang.code === draft.source ? draft.target : draft.source,
          lang.code,
        );
      }
      setLangPickerFor(null);
    },
    [langPickerFor, updateDraft],
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
          <Text
            style={{
              flex: 1,
              fontSize: typeScale.body,
              fontWeight: '600',
              color: colors.textPrimary,
            }}
          >
            Translate
          </Text>
          <Text style={{ fontSize: typeScale.caption, color: colors.textMuted }}>
            On-device · Private
          </Text>
        </View>

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
            <Text style={{ fontSize: typeScale.caption, color: colors.textMuted, marginBottom: 8 }}>
              {sourceLangDef?.label ?? sourceLang}
            </Text>
            <TextInput
              value={sourceText}
              onChangeText={handleChangeText}
              multiline
              placeholder="Enter text to translate..."
              placeholderTextColor={colors.textMuted}
              style={{
                fontSize: typeScale.callout,
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
              <LoadingIndicator size="small" />
            ) : (
              <Text
                style={{
                  fontSize: typeScale.body,
                  fontWeight: '600',
                  color: canTranslate ? colors.background : colors.textMuted,
                }}
              >
                Translate
              </Text>
            )}
          </Pressable>

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
                <Text style={{ fontSize: typeScale.caption, color: colors.textMuted, flex: 1 }}>
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
                <ErrorNotice message={state.errorMessage} />
              ) : (
                <Text
                  style={{
                    fontSize: typeScale.callout,
                    color: colors.textPrimary,
                    lineHeight: 24,
                    minHeight: 80,
                  }}
                  selectable
                >
                  {displayedTranslation}
                </Text>
              )}

              {copyFailedFor !== null && copyFailedFor === displayedTranslation && (
                <View style={{ marginTop: 8 }}>
                  <ErrorNotice message="Could not copy the translation. Try again." />
                </View>
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
                  <LoadingIndicator size="small" />
                  <Text style={{ fontSize: typeScale.caption, color: colors.textMuted }}>
                    Translating...
                  </Text>
                </View>
              )}

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
                  <Text style={{ fontSize: typeScale.caption, color: colors.textMuted }}>
                    {backendLabel}
                  </Text>
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={langPickerFor !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setLangPickerFor(null)}
        accessibilityViewIsModal
      >
        <Pressable
          accessible={false}
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
              <Text
                style={{
                  flex: 1,
                  fontSize: typeScale.callout,
                  fontWeight: '600',
                  color: colors.textPrimary,
                }}
              >
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
                          fontSize: typeScale.body,
                          color: isActive ? colors.teal : colors.textPrimary,
                          fontWeight: isActive ? '600' : '400',
                        }}
                      >
                        {item.label}
                      </Text>
                      <Text
                        style={{
                          fontSize: typeScale.caption,
                          color: colors.textMuted,
                          marginTop: 1,
                        }}
                      >
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

function ErrorNotice({ message }: { message: string }) {
  return (
    <View
      accessibilityRole="alert"
      style={{
        backgroundColor: 'rgba(239,68,68,0.1)',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
      }}
    >
      <Text style={{ fontSize: typeScale.footnote, color: '#f87171' }}>{message}</Text>
    </View>
  );
}

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
        <Text
          style={{ fontSize: typeScale.footnote, fontWeight: '600', color: colors.textPrimary }}
        >
          {lang?.label ?? ', '}
        </Text>
        <Text style={{ fontSize: typeScale.caption, color: colors.textMuted }}>
          {lang?.nativeLabel ?? ''}
        </Text>
      </View>
      <ChevronDown size={14} color={colors.textMuted} />
    </Pressable>
  );
}
