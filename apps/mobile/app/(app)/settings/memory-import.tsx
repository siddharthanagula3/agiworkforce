import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { View, ScrollView, TextInput } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import Animated, { FadeIn } from 'react-native-reanimated';
import {
  ArrowLeft,
  Upload,
  CheckCircle,
  AlertCircle,
  Square,
  CheckSquare,
} from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { useThemeColors, motion } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { useMemoryStore } from '@/src/features/memory/store';
import {
  ImportTextTooLargeError,
  MAX_IMPORT_TEXT_CHARS,
  MEMORY_IMPORT_SOURCES,
  previewMemoryImport,
  type MemoryImportPreview,
  type MemoryImportSource,
} from '@/src/features/memory/services/memoryImport';
import { useGoBack } from '@/src/shared/hooks/useGoBack';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { translatePlural } from '@/src/i18n/plural';
import { toUserMessage } from '@/services/userMessage';

import {
  captureAccountScopedUiState,
  isAccountScopedUiStateCurrent,
  isAccountScopedUiStateOwned,
  type AccountScopedUiState,
} from '@/src/features/auth/services/accountScopedUiState';
import { subscribeCloudAccountEpochChange } from '@/src/features/auth/services/cloudAccountSession';
import {
  isMemoryImportOperationCurrent,
  MEMORY_IMPORT_UNCERTAIN_MESSAGE,
  type MemoryImportOperation,
} from '@/src/features/memory/services/memoryImportOperation';

type ImportStep = 'compose' | 'preview' | 'done';

const IMPORT_FILE_TYPES = ['text/plain', 'text/markdown', 'application/json'];

export default function MemoryImportScreen() {
  const colors = useThemeColors();
  const bulkInsert = useMemoryStore((s) => s.bulkInsert);
  const isCloud = useChatAppModeStore((s) => s.appMode) === 'cloud';
  const goBackToMemory = useGoBack('/(app)/settings/memory');

  const [step, setStep] = useState<ImportStep>('compose');
  const [source, setSource] = useState<MemoryImportSource>('ChatGPT');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<MemoryImportPreview | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<{ inserted: number; skipped: number } | null>(null);

  const [draftScope, setDraftScope] = useState<AccountScopedUiState | null>(null);
  const [needsReview, setNeedsReview] = useState(false);
  const [interactionGeneration, setInteractionGeneration] = useState(0);
  const [, setOwnerRevision] = useState(0);
  const interactionGenerationRef = useRef(0);
  const draftScopeRef = useRef<AccountScopedUiState | null>(null);
  const revisionRef = useRef(0);
  const previewRevisionRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const operationRef = useRef<{
    operation: MemoryImportOperation;
    kind: 'file' | 'preview' | 'commit';
  } | null>(null);

  const invalidateOperation = useCallback(() => {
    const interruptedCommit = operationRef.current?.kind === 'commit';
    operationRef.current = null;
    interactionGenerationRef.current += 1;
    if (!mountedRef.current) return;
    setInteractionGeneration(interactionGenerationRef.current);
    setBusy(false);
    if (interruptedCommit) {
      setNeedsReview(true);
      setError(MEMORY_IMPORT_UNCERTAIN_MESSAGE);
    }
  }, []);

  const clearDraft = useCallback(() => {
    invalidateOperation();
    revisionRef.current += 1;
    previewRevisionRef.current = null;
    draftScopeRef.current = null;
    setDraftScope(null);
    setStep('compose');
    setSource('ChatGPT');
    setText('');
    setPreview(null);
    setSelected(new Set());
    setResult(null);
    setError(null);
    setNeedsReview(false);
  }, [invalidateOperation]);

  useLayoutEffect(() => {
    mountedRef.current = true;
    const reconcileOwner = () => {
      const scope = draftScopeRef.current;
      if (scope?.scope === 'cloud' && !isAccountScopedUiStateOwned(scope)) {
        clearDraft();
      } else if (!scope) {
        invalidateOperation();
      } else {
        setOwnerRevision((revision) => revision + 1);
      }
    };
    const unsubscribeOwner = subscribeCloudAccountEpochChange(reconcileOwner);
    const unsubscribeMode = useChatAppModeStore.subscribe((next, previous) => {
      if (next.appMode !== previous.appMode) invalidateOperation();
    });
    reconcileOwner();
    return () => {
      mountedRef.current = false;
      operationRef.current = null;
      unsubscribeOwner();
      unsubscribeMode();
    };
  }, [clearDraft, invalidateOperation]);

  useFocusEffect(useCallback(() => () => invalidateOperation(), [invalidateOperation]));

  const currentMode = isCloud ? 'cloud' : 'local';
  const suspended = draftScope !== null && !isAccountScopedUiStateCurrent(draftScope, currentMode);
  const destinationAvailable = captureAccountScopedUiState(currentMode) !== null;
  const canEdit = !suspended && destinationAvailable && !busy;

  const bindDraft = useCallback(() => {
    if (!mountedRef.current || interactionGenerationRef.current !== interactionGeneration)
      return null;
    let scope = draftScopeRef.current;
    if (!scope) {
      scope = captureAccountScopedUiState(useChatAppModeStore.getState().appMode);
      if (!scope) return null;
      draftScopeRef.current = scope;
      setDraftScope(scope);
    }
    return isAccountScopedUiStateCurrent(scope, useChatAppModeStore.getState().appMode)
      ? scope
      : null;
  }, [interactionGeneration]);

  const draftRevision = revisionRef.current;
  const startOperation = useCallback(
    (kind: 'file' | 'preview' | 'commit') => {
      if (!mountedRef.current || operationRef.current || draftRevision !== revisionRef.current)
        return null;
      const scope = bindDraft();
      if (!scope) return null;
      const revision = revisionRef.current;
      const operation: MemoryImportOperation = {
        scope,
        isActive: () =>
          mountedRef.current &&
          operationRef.current?.operation === operation &&
          revisionRef.current === revision,
      };
      operationRef.current = { operation, kind };
      setError(null);
      setBusy(true);
      return operation;
    },
    [bindDraft, draftRevision],
  );

  const finishOperation = useCallback((operation: MemoryImportOperation) => {
    if (operationRef.current?.operation !== operation) return;
    operationRef.current = null;
    if (mountedRef.current) setBusy(false);
  }, []);

  const handleTextChange = useCallback(
    (value: string) => {
      if (operationRef.current || !bindDraft()) return;
      revisionRef.current += 1;
      previewRevisionRef.current = null;
      setText(value);
      setPreview(null);
      setSelected(new Set());
      setError(null);
    },
    [bindDraft],
  );

  const handleSourceChange = useCallback(
    (value: MemoryImportSource) => {
      if (operationRef.current || !bindDraft()) return;
      revisionRef.current += 1;
      previewRevisionRef.current = null;
      setSource(value);
      setPreview(null);
      setSelected(new Set());
      setError(null);
    },
    [bindDraft],
  );

  const handleChooseFile = useCallback(async () => {
    const operation = startOperation('file');
    if (!operation) return;
    let reading = false;
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: IMPORT_FILE_TYPES,
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (!isMemoryImportOperationCurrent(operation)) return;
      const asset = picked.canceled ? undefined : picked.assets?.[0];
      if (!asset) return;
      if (typeof asset.size === 'number' && asset.size > MAX_IMPORT_TEXT_CHARS) {
        setError('That file is too large to import.');
        return;
      }
      reading = true;
      const contents = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (!isMemoryImportOperationCurrent(operation)) return;
      if (contents.length > MAX_IMPORT_TEXT_CHARS) {
        setError('That file is too large to import.');
        return;
      }
      revisionRef.current += 1;
      previewRevisionRef.current = null;
      setText(contents);
      setPreview(null);
      setSelected(new Set());
    } catch {
      if (isMemoryImportOperationCurrent(operation)) {
        setError(
          reading
            ? 'Could not read that file. Choose another file or paste the text.'
            : 'The file picker could not open. Paste the text instead.',
        );
      }
    } finally {
      finishOperation(operation);
    }
  }, [finishOperation, startOperation]);

  const handlePreview = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const operation = startOperation('preview');
    if (!operation) return;
    try {
      const next = await previewMemoryImport(trimmed, source, operation);
      if (!isMemoryImportOperationCurrent(operation)) return;
      if (next.items.length === 0) {
        setError('No memories were found in that text. Put one memory on each line.');
        return;
      }
      previewRevisionRef.current = revisionRef.current;
      setPreview(next);
      setSelected(new Set(next.items.flatMap((item, index) => (item.duplicate ? [] : [index]))));
      setNeedsReview(false);
      setStep('preview');
    } catch (previewError) {
      if (isMemoryImportOperationCurrent(operation)) {
        setError(
          previewError instanceof ImportTextTooLargeError
            ? 'That text is too long to import at once. Split it and import each part.'
            : toUserMessage(previewError, 'Could not read that text. Try again.'),
        );
      }
    } finally {
      finishOperation(operation);
    }
  }, [finishOperation, source, startOperation, text]);

  const toggleItem = useCallback(
    (index: number) => {
      if (operationRef.current || !bindDraft()) return;
      setSelected((current) => {
        const next = new Set(current);
        if (next.has(index)) next.delete(index);
        else next.add(index);
        return next;
      });
    },
    [bindDraft],
  );

  const totalItems = preview?.items.length ?? 0;
  const allSelected = totalItems > 0 && selected.size === totalItems;

  const toggleAll = useCallback(() => {
    if (!preview || operationRef.current || !bindDraft()) return;
    setSelected(allSelected ? new Set() : new Set(preview.items.map((_, index) => index)));
  }, [allSelected, bindDraft, preview]);

  const handleCommit = useCallback(async () => {
    if (!preview || needsReview || previewRevisionRef.current !== revisionRef.current) return;
    const items = preview.items.filter((_, index) => selected.has(index)).map((i) => i.content);
    if (items.length === 0) return;
    const operation = startOperation('commit');
    if (!operation) return;
    try {
      const next = await bulkInsert(items, preview.sourceName, operation);
      if (!isMemoryImportOperationCurrent(operation)) return;
      setResult(next);
      setStep('done');
    } catch {
      if (isMemoryImportOperationCurrent(operation)) {
        setNeedsReview(true);
        setError(MEMORY_IMPORT_UNCERTAIN_MESSAGE);
      }
    } finally {
      finishOperation(operation);
    }
  }, [bulkInsert, finishOperation, needsReview, preview, selected, startOperation]);

  const handleBackToCompose = useCallback(() => {
    if (operationRef.current || !bindDraft()) return;
    revisionRef.current += 1;
    previewRevisionRef.current = null;
    setStep('compose');
  }, [bindDraft]);

  const handleLeave = useCallback(() => {
    invalidateOperation();
    goBackToMemory();
  }, [goBackToMemory, invalidateOperation]);

  const selectedLabel = useMemo(
    () =>
      translatePlural('settings', 'counts.memoriesSelected', selected.size, {
        one: 'Import {{count}} memory',
        other: 'Import {{count}} memories',
      }),
    [selected.size],
  );

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.surfaceBase }}>
      <View className="flex-row items-center px-4 h-12">
        <Pressable
          accessibilityLabel="Go back"
          accessibilityRole="button"
          onPress={handleLeave}
          className="p-2 -ml-2 rounded-lg"
          style={({ pressed }) => ({
            backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
          })}
        >
          <ArrowLeft size={22} color={colors.textSecondary} />
        </Pressable>
        <Text variant="subheading" className="ml-2 flex-1" style={{ color: colors.textPrimary }}>
          Import Memories
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {!suspended && (
          <Animated.View entering={FadeIn.duration(motion.moved)} className="mb-5 mt-2">
            <View
              className="rounded-xl px-4 py-3"
              style={{
                backgroundColor: colors.successSurface,
                borderColor: colors.successBorder,
                borderWidth: 1,
              }}
            >
              <Text className="text-sm font-semibold mb-1" style={{ color: colors.teal }}>
                {isCloud ? 'Saved to your AGI Cloud account' : 'On-device only'}
              </Text>
              <Text className="text-sm leading-5" style={{ color: colors.textSecondary }}>
                {isCloud
                  ? 'Only the memories you import are saved.'
                  : 'Read on this device. Nothing is uploaded.'}
              </Text>
            </View>
          </Animated.View>
        )}

        {suspended && (
          <Text style={{ fontSize: typeScale.body, color: colors.textSecondary }}>
            Switch back to the original mode to continue this import.
          </Text>
        )}
        {!suspended && !destinationAvailable && (
          <Text style={{ fontSize: typeScale.body, color: colors.textSecondary }}>
            Sign in to import memories to your Cloud account.
          </Text>
        )}

        {!suspended && step === 'compose' && (
          <View>
            <Text style={{ fontSize: typeScale.subhead, color: colors.textSecondary }}>
              Paste what your other assistant remembers about you, one per line.
            </Text>

            <Text
              className="text-sm uppercase font-semibold mt-5 mb-2"
              style={{ color: colors.textMuted, letterSpacing: 0 }}
            >
              From
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {MEMORY_IMPORT_SOURCES.map((option) => {
                const active = option === source;
                return (
                  <Pressable
                    key={option}
                    onPress={() => handleSourceChange(option)}
                    disabled={!canEdit}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={option}
                    className="rounded-full px-3 py-2"
                    style={{
                      minHeight: 36,
                      borderWidth: 1,
                      borderColor: active ? colors.teal : colors.border,
                      backgroundColor: active ? colors.successSurface : colors.transparent,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: typeScale.subhead,
                        color: active ? colors.textPrimary : colors.textSecondary,
                      }}
                    >
                      {option}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <TextInput
              value={text}
              onChangeText={handleTextChange}
              editable={canEdit}
              multiline
              textAlignVertical="top"
              placeholder="Paste memories here, one per line"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Memories to import"
              maxLength={MAX_IMPORT_TEXT_CHARS}
              className="mt-5 rounded-xl px-3 py-3"
              style={{
                minHeight: 180,
                fontSize: typeScale.body,
                color: colors.textPrimary,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surfaceElevated,
              }}
            />

            <Pressable
              onPress={() => void handleChooseFile()}
              disabled={!canEdit}
              accessibilityRole="button"
              accessibilityLabel="Choose a text or JSON file"
              className="flex-row items-center gap-2 mt-3 self-start py-2"
              style={{ minHeight: 44 }}
            >
              <Upload size={16} color={colors.textSecondary} />
              <Text style={{ fontSize: typeScale.subhead, color: colors.textSecondary }}>
                Choose a text or JSON file
              </Text>
            </Pressable>

            <Button
              title="Preview"
              variant="primary"
              size="md"
              className="mt-4"
              loading={busy}
              disabled={!canEdit || text.trim().length === 0}
              onPress={() => void handlePreview()}
            />
          </View>
        )}

        {!suspended && step === 'preview' && preview && (
          <View>
            <View className="flex-row items-center justify-between mb-2">
              <Text style={{ fontSize: typeScale.subhead, color: colors.textSecondary }}>
                {translatePlural('settings', 'counts.memoriesFound', totalItems, {
                  one: '{{count}} memory found',
                  other: '{{count}} memories found',
                })}
                {preview.itemsTruncated ? ', the rest were left out' : ''}
              </Text>
              <Pressable
                onPress={toggleAll}
                disabled={busy}
                accessibilityRole="button"
                className="py-2 px-1"
                style={{ minHeight: 44, justifyContent: 'center' }}
              >
                <Text style={{ fontSize: typeScale.subhead, color: colors.teal }}>
                  {allSelected ? 'Select none' : 'Select all'}
                </Text>
              </Pressable>
            </View>
            {preview.items.map((item, index) => {
              const checked = selected.has(index);
              const Icon = checked ? CheckSquare : Square;
              return (
                <Pressable
                  key={`${index}:${item.normalizedKey}`}
                  onPress={() => toggleItem(index)}
                  disabled={busy}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                  accessibilityLabel={`${item.content}${item.duplicate ? ', already in memory' : ''}`}
                  className="flex-row items-start gap-3 rounded-xl px-3 py-3 mb-2"
                  style={{ borderWidth: 1, borderColor: colors.border }}
                >
                  <Icon size={18} color={checked ? colors.teal : colors.textMuted} />
                  <View className="flex-1">
                    <Text style={{ fontSize: typeScale.body, color: colors.textPrimary }}>
                      {item.content}
                    </Text>
                    {item.duplicate ? (
                      <Text
                        style={{
                          fontSize: typeScale.caption,
                          color: colors.textMuted,
                          marginTop: 2,
                        }}
                      >
                        Already in memory
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
            <View className="flex-row gap-3 mt-3">
              <Button
                title="Back"
                variant="ghost"
                size="md"
                className="flex-1"
                disabled={busy}
                onPress={handleBackToCompose}
              />
              <Button
                title={selectedLabel}
                variant="primary"
                size="md"
                className="flex-1"
                loading={busy}
                disabled={busy || needsReview || selected.size === 0}
                onPress={() => void handleCommit()}
              />
            </View>
          </View>
        )}

        {!suspended && step === 'done' && result && (
          <Animated.View entering={FadeIn.duration(motion.moved)}>
            <View
              className="rounded-xl px-4 py-4 items-center"
              style={{
                backgroundColor: colors.successSurface,
                borderColor: colors.successBorder,
                borderWidth: 1,
              }}
            >
              <CheckCircle size={32} color={colors.teal} />
              <Text className="text-base font-semibold mt-2" style={{ color: colors.textPrimary }}>
                Import complete
              </Text>
              <Text className="text-sm mt-3 text-center" style={{ color: colors.textSecondary }}>
                {translatePlural('settings', 'counts.memoriesAdded', result.inserted, {
                  one: 'Added {{count}} memory',
                  other: 'Added {{count}} memories',
                })}
                {result.skipped > 0 ? `, ${result.skipped} skipped` : ''}
              </Text>
            </View>
            <View className="flex-row gap-3 mt-4">
              <Button
                title="Import Another"
                variant="ghost"
                size="md"
                onPress={clearDraft}
                className="flex-1"
              />
              <Button
                title="Done"
                variant="primary"
                size="md"
                onPress={handleLeave}
                className="flex-1"
              />
            </View>
          </Animated.View>
        )}

        {!suspended && error ? (
          <View
            className="rounded-xl px-4 py-3 mt-4 flex-row gap-3 items-start"
            style={{
              backgroundColor: colors.dangerSurface,
              borderColor: colors.dangerBorder,
              borderWidth: 1,
            }}
            accessibilityRole="alert"
          >
            <AlertCircle size={18} color={colors.agentError} />
            <Text
              className="flex-1"
              style={{ fontSize: typeScale.subhead, color: colors.textPrimary }}
            >
              {error}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
