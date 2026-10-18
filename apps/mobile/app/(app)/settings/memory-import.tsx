import { useCallback, useMemo, useState } from 'react';
import { View, ScrollView, TextInput } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
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
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
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

  const handleChooseFile = useCallback(async () => {
    setError(null);
    let picked: DocumentPicker.DocumentPickerResult;
    try {
      picked = await DocumentPicker.getDocumentAsync({
        type: IMPORT_FILE_TYPES,
        copyToCacheDirectory: true,
        multiple: false,
      });
    } catch {
      setError('The file picker could not open. Paste the text instead.');
      return;
    }
    const asset = picked.canceled ? undefined : picked.assets?.[0];
    if (!asset) return;
    if (typeof asset.size === 'number' && asset.size > MAX_IMPORT_TEXT_CHARS) {
      setError('That file is too large to import.');
      return;
    }
    try {
      setText(
        await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 }),
      );
    } catch {
      setError('Could not read that file. Choose another file or paste the text.');
    }
  }, []);

  const handlePreview = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setError(null);
    setBusy(true);
    try {
      const next = await previewMemoryImport(trimmed, source, isCloud ? 'cloud' : 'local');
      if (next.items.length === 0) {
        setError('No memories were found in that text. Put one memory on each line.');
        return;
      }
      setPreview(next);
      setSelected(new Set(next.items.flatMap((item, index) => (item.duplicate ? [] : [index]))));
      setStep('preview');
    } catch (previewError) {
      setError(
        previewError instanceof ImportTextTooLargeError
          ? 'That text is too long to import at once. Split it and import each part.'
          : toUserMessage(previewError, 'Could not read that text. Try again.'),
      );
    } finally {
      setBusy(false);
    }
  }, [isCloud, source, text]);

  const toggleItem = useCallback((index: number) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const totalItems = preview?.items.length ?? 0;
  const allSelected = totalItems > 0 && selected.size === totalItems;

  const toggleAll = useCallback(() => {
    if (!preview) return;
    setSelected(allSelected ? new Set() : new Set(preview.items.map((_, index) => index)));
  }, [allSelected, preview]);

  const handleCommit = useCallback(async () => {
    if (!preview) return;
    const items = preview.items.filter((_, index) => selected.has(index)).map((i) => i.content);
    if (items.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      setResult(await bulkInsert(items, preview.sourceName));
      setStep('done');
    } catch (commitError) {
      setError(
        toUserMessage(
          commitError,
          'Import could not finish. Some memories may have been saved. Check your memories before trying again.',
        ),
      );
    } finally {
      setBusy(false);
    }
  }, [bulkInsert, preview, selected]);

  const handleReset = useCallback(() => {
    setStep('compose');
    setText('');
    setPreview(null);
    setSelected(new Set());
    setResult(null);
    setError(null);
  }, []);

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
          onPress={goBackToMemory}
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
        <Animated.View entering={FadeIn.duration(motion.moved)} className="mb-5 mt-2">
          <View
            className="rounded-xl px-4 py-3"
            style={{
              backgroundColor: colors.successSurface,
              borderColor: colors.successBorder,
              borderWidth: 1,
            }}
          >
            <Text className="text-xs font-semibold mb-1" style={{ color: colors.teal }}>
              {isCloud ? 'Saved to your AGI Cloud account' : 'On-device only'}
            </Text>
            <Text className="text-xs leading-5" style={{ color: colors.textSecondary }}>
              {isCloud
                ? 'Only the memories you choose to import are sent to your AGI Cloud account, where they sync to your other devices.'
                : 'The text is read on this device and the memories stay here. Nothing is uploaded.'}
            </Text>
          </View>
        </Animated.View>

        {step === 'compose' && (
          <View>
            <Text style={{ fontSize: typeScale.subhead, color: colors.textSecondary }}>
              Ask your other assistant to list everything it remembers about you, one memory per
              line, then paste the answer here. A JSON list of strings also works.
            </Text>

            <Text
              className="text-xs uppercase font-semibold mt-5 mb-2"
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
                    onPress={() => setSource(option)}
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
              onChangeText={setText}
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
              disabled={busy || text.trim().length === 0}
              onPress={() => void handlePreview()}
            />
          </View>
        )}

        {step === 'preview' && preview && (
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
                onPress={() => setStep('compose')}
              />
              <Button
                title={selectedLabel}
                variant="primary"
                size="md"
                className="flex-1"
                loading={busy}
                disabled={busy || selected.size === 0}
                onPress={() => void handleCommit()}
              />
            </View>
          </View>
        )}

        {step === 'done' && result && (
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
                onPress={handleReset}
                className="flex-1"
              />
              <Button
                title="Done"
                variant="primary"
                size="md"
                onPress={goBackToMemory}
                className="flex-1"
              />
            </View>
          </Animated.View>
        )}

        {error ? (
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
