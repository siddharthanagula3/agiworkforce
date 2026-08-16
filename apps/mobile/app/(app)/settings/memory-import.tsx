import { useCallback, useState } from 'react';
import { View, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import Animated, { FadeIn } from 'react-native-reanimated';
import { ArrowLeft, Upload, FileText, CheckCircle, AlertCircle } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useThemeColors } from '@/src/ui/theme';
import { useMemoryStore } from '@/src/features/memory/store';
import { parseImportFile, type ImportSource } from '@/src/features/memory/services/memoryImport';

type ImportStatus = 'idle' | 'picking' | 'parsing' | 'importing' | 'done' | 'error';

interface ImportState {
  status: ImportStatus;
  fileName: string | null;
  source: ImportSource | null;
  factsFound: number;
  inserted: number;
  skipped: number;
  errorMessage: string | null;
}

const SOURCE_LABELS: Record<ImportSource, string> = {
  chatgpt: 'Conversation export',
  claude: 'Assistant export',
  gemini: 'Google export',
  text: 'Plain text / Notes',
};

const SOURCE_DESCRIPTIONS: Record<ImportSource, string> = {
  chatgpt: 'JSON conversation file such as conversations.json or export.json',
  claude: 'JSON assistant conversation export',
  gemini: 'Google Takeout conversation export',
  text: 'Any .txt or .md file with notes, one per line or paragraph',
};

const IMPORT_SOURCES: ImportSource[] = ['chatgpt', 'claude', 'gemini', 'text'];

export default function MemoryImportScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { bulkInsert } = useMemoryStore();

  const [state, setState] = useState<ImportState>({
    status: 'idle',
    fileName: null,
    source: null,
    factsFound: 0,
    inserted: 0,
    skipped: 0,
    errorMessage: null,
  });

  const handlePickFile = useCallback(async () => {
    setState((s) => ({ ...s, status: 'picking', errorMessage: null }));

    let result: DocumentPicker.DocumentPickerResult;
    try {
      result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/plain', 'text/markdown', '*/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
    } catch {
      setState((s) => ({ ...s, status: 'idle' }));
      return;
    }

    if (result.canceled || !result.assets || result.assets.length === 0) {
      setState((s) => ({ ...s, status: 'idle' }));
      return;
    }

    const asset = result.assets[0];
    if (!asset) {
      setState((s) => ({ ...s, status: 'idle' }));
      return;
    }

    const fileName = asset.name ?? 'unknown';
    setState((s) => ({ ...s, status: 'parsing', fileName }));

    let content: string;
    try {
      content = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
    } catch (err) {
      setState((s) => ({
        ...s,
        status: 'error',
        errorMessage: err instanceof Error ? err.message : 'Could not read file',
      }));
      return;
    }

    const importResult = await parseImportFile(content, fileName);
    const { facts, source } = importResult;

    if (facts.length === 0) {
      setState((s) => ({
        ...s,
        status: 'error',
        source,
        factsFound: 0,
        errorMessage: 'No importable facts found in this file.',
      }));
      return;
    }

    Alert.alert(
      'Import Preview',
      `Found ${facts.length} fact${facts.length !== 1 ? 's' : ''} from ${SOURCE_LABELS[source]}.\n\nPreview:\n• ${facts
        .slice(0, 3)
        .map((f) => f.fact.slice(0, 80))
        .join('\n• ')}${facts.length > 3 ? `\n… and ${facts.length - 3} more` : ''}`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => setState((s) => ({ ...s, status: 'idle' })),
        },
        {
          text: 'Import All',
          onPress: async () => {
            setState((s) => ({ ...s, status: 'importing', source, factsFound: facts.length }));
            try {
              const { inserted, skipped } = await bulkInsert(facts.map((f) => f.fact));
              setState((s) => ({ ...s, status: 'done', inserted, skipped }));
            } catch (err) {
              setState((s) => ({
                ...s,
                status: 'error',
                errorMessage: err instanceof Error ? err.message : 'Import failed',
              }));
            }
          },
        },
      ],
    );
  }, [bulkInsert]);

  const handleReset = useCallback(() => {
    setState({
      status: 'idle',
      fileName: null,
      source: null,
      factsFound: 0,
      inserted: 0,
      skipped: 0,
      errorMessage: null,
    });
  }, []);

  const goBackToMemory = useCallback(() => {
    router.navigate('/(app)/settings/memory' as Parameters<typeof router.navigate>[0]);
  }, [router]);

  const isProcessing =
    state.status === 'picking' || state.status === 'parsing' || state.status === 'importing';

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.surfaceBase }}>
      {/* Header */}
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
        showsVerticalScrollIndicator={false}
      >
        {/* Privacy notice */}
        <Animated.View entering={FadeIn.duration(300)} className="mb-5 mt-2">
          <View
            className="rounded-xl px-4 py-3"
            style={{
              backgroundColor: colors.successSurface,
              borderColor: colors.successBorder,
              borderWidth: 1,
            }}
          >
            <Text className="text-xs font-semibold mb-1" style={{ color: colors.teal }}>
              On-device only
            </Text>
            <Text className="text-xs leading-5" style={{ color: colors.textSecondary }}>
              Files are read locally. No data is uploaded to any server. Your imports stay on this
              device.
            </Text>
          </View>
        </Animated.View>

        {/* Supported sources */}
        <Text
          className="text-xs uppercase font-semibold mb-3"
          style={{ color: colors.textMuted, letterSpacing: 0 }}
        >
          Supported formats
        </Text>
        {IMPORT_SOURCES.map((src) => (
          <Card key={src} variant="default" className="mb-2">
            <View className="flex-row items-center gap-3">
              <View
                className="w-8 h-8 rounded-lg items-center justify-center"
                style={{ backgroundColor: colors.neutralSurface }}
              >
                <FileText size={16} color={colors.textMuted} />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-medium" style={{ color: colors.textPrimary }}>
                  {SOURCE_LABELS[src]}
                </Text>
                <Text className="text-xs mt-0.5 leading-4" style={{ color: colors.textMuted }}>
                  {SOURCE_DESCRIPTIONS[src]}
                </Text>
              </View>
            </View>
          </Card>
        ))}

        {/* Result display */}
        {state.status === 'done' && (
          <Animated.View entering={FadeIn.duration(300)} className="mt-5">
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
              {state.source && (
                <Text className="text-sm mt-0.5" style={{ color: colors.textMuted }}>
                  From {SOURCE_LABELS[state.source]}
                </Text>
              )}
              <Text className="text-sm mt-3 text-center" style={{ color: colors.textSecondary }}>
                Added {state.inserted} {state.inserted === 1 ? 'memory' : 'memories'}
                {state.skipped > 0 ? `, ${state.skipped} skipped` : ''}
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

        {state.status === 'error' && state.errorMessage && (
          <Animated.View entering={FadeIn.duration(300)} className="mt-5">
            <View
              className="rounded-xl px-4 py-4 items-center"
              style={{
                backgroundColor: colors.dangerSurface,
                borderColor: colors.dangerBorder,
                borderWidth: 1,
              }}
            >
              <AlertCircle size={32} color={colors.agentError} />
              <Text className="text-base font-semibold mt-2" style={{ color: colors.textPrimary }}>
                Import failed
              </Text>
              <Text className="text-sm mt-1 text-center" style={{ color: colors.textSecondary }}>
                {state.errorMessage}
              </Text>
            </View>
            <Button
              title="Try again"
              variant="ghost"
              size="md"
              onPress={handleReset}
              className="mt-3"
            />
          </Animated.View>
        )}

        {/* Main CTA */}
        {(state.status === 'idle' || isProcessing) && (
          <View className="mt-6">
            {isProcessing ? (
              <View className="items-center gap-3 py-6">
                <ActivityIndicator size="large" color={colors.teal} />
                <Text className="text-sm" style={{ color: colors.textMuted }}>
                  {state.status === 'picking'
                    ? 'Opening file picker…'
                    : state.status === 'parsing'
                      ? 'Parsing file…'
                      : 'Importing memories…'}
                </Text>
              </View>
            ) : (
              <Pressable
                onPress={handlePickFile}
                className="border-2 border-dashed rounded-2xl items-center justify-center py-10 gap-3"
                style={({ pressed }) => ({
                  backgroundColor: pressed ? colors.successSurface : colors.transparent,
                  borderColor: pressed ? colors.successBorder : colors.border,
                })}
                accessibilityLabel="Select file to import"
                accessibilityRole="button"
              >
                <View
                  className="w-16 h-16 rounded-2xl items-center justify-center"
                  style={{ backgroundColor: colors.neutralSurface }}
                >
                  <Upload size={28} color={colors.textMuted} />
                </View>
                <View className="items-center">
                  <Text className="text-base font-semibold" style={{ color: colors.textPrimary }}>
                    Select file
                  </Text>
                  <Text className="text-sm mt-1" style={{ color: colors.textMuted }}>
                    JSON or plain text export
                  </Text>
                </View>
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
