import { useCallback, useRef, useState } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Trophy, Zap, Hash, Clock } from 'lucide-react-native';
import type BottomSheet from '@gorhom/bottom-sheet';
import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { ChatInput } from '@/components/chat/ChatInput';
import { ModelPickerSheet } from '@/components/model-picker/ModelPickerSheet';
import { streamChat, type StreamDelta } from '@/services/streaming';
import { getModelById, getProviderById, getDisplayName } from '@/lib/models';
import { getProviderDefaultModel } from '@agiworkforce/types';
import { useThemeColors } from '@/hooks/useTheme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CompareStreamState {
  content: string;
  isStreaming: boolean;
  isDone: boolean;
  errorMessage: string | null;
  /** Approximate token count (chars / 4 as rough estimate until server sends usage) */
  tokenCount: number;
  /** Time-to-first-token in ms */
  ttftMs: number | null;
  /** Total response duration in ms */
  durationMs: number | null;
}

const initialStreamState = (): CompareStreamState => ({
  content: '',
  isStreaming: false,
  isDone: false,
  errorMessage: null,
  tokenCount: 0,
  ttftMs: null,
  durationMs: null,
});

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

// MOB-HARDCODED-MODELS fix: derive defaults from models.json via getProviderDefaultModel
// so these survive era changes without a code edit.
const DEFAULT_MODEL_A = getProviderDefaultModel('anthropic') ?? 'anthropic/default';
const DEFAULT_MODEL_B = getProviderDefaultModel('openai') ?? 'openai/default';

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

/**
 * CompareScreen — Send the same prompt to two models and stream
 * both responses side-by-side (stacked on narrow screens).
 */
export default function CompareScreen() {
  const colors = useThemeColors();
  const router = useRouter();

  const [modelA, setModelA] = useState(DEFAULT_MODEL_A);
  const [modelB, setModelB] = useState(DEFAULT_MODEL_B);

  const [stateA, setStateA] = useState<CompareStreamState>(initialStreamState);
  const [stateB, setStateB] = useState<CompareStreamState>(initialStreamState);

  const [lastPrompt, setLastPrompt] = useState<string | null>(null);

  // Each model gets its own abort controller and sheet ref
  const controllerARef = useRef<AbortController | null>(null);
  const controllerBRef = useRef<AbortController | null>(null);
  const modelPickerARef = useRef<BottomSheet>(null);
  const modelPickerBRef = useRef<BottomSheet>(null);

  // Which picker slot is currently active (used for the active-model pill highlight)
  const [activePickerSlot, setActivePickerSlot] = useState<'A' | 'B' | null>(null);

  const handleBack = useCallback(() => {
    // Abort any running streams before leaving
    controllerARef.current?.abort();
    controllerBRef.current?.abort();
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(app)' as Parameters<typeof router.replace>[0]);
    }
  }, [router]);

  const handleStop = useCallback(() => {
    controllerARef.current?.abort();
    controllerBRef.current?.abort();
    setStateA((prev) => ({ ...prev, isStreaming: false, isDone: true }));
    setStateB((prev) => ({ ...prev, isStreaming: false, isDone: true }));
  }, []);

  const handleSend = useCallback(
    (text: string) => {
      if (!text.trim()) return;

      // Abort previous streams if any
      controllerARef.current?.abort();
      controllerBRef.current?.abort();

      setLastPrompt(text.trim());
      setStateA(initialStreamState());
      setStateB(initialStreamState());

      const messages = [{ role: 'user', content: text.trim() }];

      // ---------------------------------------------------------------------------
      // Stream Model A
      // ---------------------------------------------------------------------------
      const ctrlA = new AbortController();
      controllerARef.current = ctrlA;

      let startA = Date.now();
      setStateA((prev) => ({ ...prev, isStreaming: true }));

      streamChat(
        { model: modelA, messages, stream: true as const, thinking: false },
        {
          onDelta: (delta: StreamDelta) => {
            if (delta.content) {
              setStateA((prev) => {
                const newContent = prev.content + delta.content;
                const ttft = prev.ttftMs === null ? Date.now() - startA : prev.ttftMs;
                return {
                  ...prev,
                  content: newContent,
                  ttftMs: ttft,
                  // Rough token estimate: 1 token ≈ 4 chars
                  tokenCount: Math.round(newContent.length / 4),
                };
              });
            }
          },
          onDone: () => {
            setStateA((prev) => ({
              ...prev,
              isStreaming: false,
              isDone: true,
              durationMs: Date.now() - startA,
            }));
          },
          onError: (err: Error) => {
            setStateA((prev) => ({
              ...prev,
              isStreaming: false,
              isDone: true,
              errorMessage: err.message,
            }));
          },
        },
        ctrlA.signal,
      );

      // ---------------------------------------------------------------------------
      // Stream Model B
      // ---------------------------------------------------------------------------
      const ctrlB = new AbortController();
      controllerBRef.current = ctrlB;

      startA = Date.now(); // reset variable name but track separately per closure
      const startB = Date.now();
      setStateB((prev) => ({ ...prev, isStreaming: true }));

      streamChat(
        { model: modelB, messages, stream: true as const, thinking: false },
        {
          onDelta: (delta: StreamDelta) => {
            if (delta.content) {
              setStateB((prev) => {
                const newContent = prev.content + delta.content;
                const ttft = prev.ttftMs === null ? Date.now() - startB : prev.ttftMs;
                return {
                  ...prev,
                  content: newContent,
                  ttftMs: ttft,
                  tokenCount: Math.round(newContent.length / 4),
                };
              });
            }
          },
          onDone: () => {
            setStateB((prev) => ({
              ...prev,
              isStreaming: false,
              isDone: true,
              durationMs: Date.now() - startB,
            }));
          },
          onError: (err: Error) => {
            setStateB((prev) => ({
              ...prev,
              isStreaming: false,
              isDone: true,
              errorMessage: err.message,
            }));
          },
        },
        ctrlB.signal,
      );
    },
    [modelA, modelB],
  );

  const isAnyStreaming = stateA.isStreaming || stateB.isStreaming;
  const bothDone = stateA.isDone && stateB.isDone;

  // Determine winner once both are done
  const winner = bothDone ? determineWinner(stateA, stateB) : null;

  const handleOpenPickerA = useCallback(() => {
    setActivePickerSlot('A');
    modelPickerARef.current?.snapToIndex(0);
  }, []);

  const handleOpenPickerB = useCallback(() => {
    setActivePickerSlot('B');
    modelPickerBRef.current?.snapToIndex(0);
  }, []);

  const handleSelectModelA = useCallback((id: string) => {
    setModelA(id);
    setActivePickerSlot(null);
  }, []);

  const handleSelectModelB = useCallback((id: string) => {
    setModelB(id);
    setActivePickerSlot(null);
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-surface-base" edges={['top']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* ---- Header ---- */}
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
            className="p-2 rounded-lg active:bg-white/5"
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <ArrowLeft size={20} color={colors.textSecondary} />
          </Pressable>
          <Text className="flex-1 text-[15px] font-semibold text-white">Compare Models</Text>
        </View>

        {/* ---- Model Selector Pills ---- */}
        <View className="flex-row gap-3 px-4 py-3 border-b border-white/8">
          <ModelPill
            slot="A"
            modelId={modelA}
            isActive={activePickerSlot === 'A'}
            winner={winner === 'A' ? 'faster' : winner === 'tie' ? 'tie' : null}
            onPress={handleOpenPickerA}
          />
          <View className="items-center justify-center">
            <Text className="text-xs text-white/30 font-medium">vs</Text>
          </View>
          <ModelPill
            slot="B"
            modelId={modelB}
            isActive={activePickerSlot === 'B'}
            winner={winner === 'B' ? 'faster' : winner === 'tie' ? 'tie' : null}
            onPress={handleOpenPickerB}
          />
        </View>

        {/* ---- Results Area ---- */}
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16, gap: 12 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Empty state */}
          {!lastPrompt && !stateA.isStreaming && !stateB.isStreaming && (
            <View className="flex-1 items-center justify-center py-16 px-8">
              <Text className="text-white/20 text-center text-sm leading-5">
                Type a prompt below to send to both models simultaneously and compare the responses.
              </Text>
            </View>
          )}

          {/* Response columns — stacked on narrow screens */}
          {(lastPrompt || stateA.isStreaming || stateB.isStreaming) && (
            <>
              <ResponsePanel slot="A" modelId={modelA} state={stateA} winner={winner === 'A'} />
              <ResponsePanel slot="B" modelId={modelB} state={stateB} winner={winner === 'B'} />
            </>
          )}
        </ScrollView>

        {/* ---- Input ---- */}
        <ChatInput onSend={handleSend} isStreaming={isAnyStreaming} onStop={handleStop} />
      </KeyboardAvoidingView>

      {/* ---- Model Picker Sheets ---- */}
      {/* Rendered outside KeyboardAvoidingView so they overlay correctly */}
      <ModelPickerSheet sheetRef={modelPickerARef} onSelect={handleSelectModelA} />
      <ModelPickerSheet sheetRef={modelPickerBRef} onSelect={handleSelectModelB} />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Model Pill
// ---------------------------------------------------------------------------

interface ModelPillProps {
  slot: 'A' | 'B';
  modelId: string;
  isActive: boolean;
  winner: 'faster' | 'tie' | null;
  onPress: () => void;
}

function ModelPill({ slot, modelId, isActive, winner, onPress }: ModelPillProps) {
  const colors = useThemeColors();
  const model = getModelById(modelId);
  const provider = model ? getProviderById(model.provider) : undefined;
  const displayName = getDisplayName(modelId);

  const slotColor = slot === 'A' ? colors.teal : colors.terraCotta;

  return (
    <Pressable
      onPress={onPress}
      className="flex-1 rounded-xl border active:opacity-80"
      style={{
        backgroundColor: isActive ? `${slotColor}18` : colors.surfaceElevated,
        borderColor: isActive ? `${slotColor}60` : colors.border,
        paddingHorizontal: 12,
        paddingVertical: 10,
      }}
      accessibilityLabel={`Select model ${slot}: currently ${displayName}`}
      accessibilityRole="button"
    >
      <View className="flex-row items-center gap-2">
        {/* Slot badge */}
        <View
          className="w-5 h-5 rounded-md items-center justify-center"
          style={{ backgroundColor: `${slotColor}30` }}
        >
          <Text style={{ fontSize: 10, fontWeight: '700', color: slotColor }}>{slot}</Text>
        </View>

        <View className="flex-1">
          <Text className="text-[12px] text-white font-medium" numberOfLines={1}>
            {displayName}
          </Text>
          {provider && (
            <Text className="text-[10px] text-white/40" numberOfLines={1}>
              {provider.name}
            </Text>
          )}
        </View>

        {winner === 'faster' && (
          <View className="flex-row items-center gap-0.5">
            <Trophy size={11} color="#f59e0b" />
          </View>
        )}
        {winner === 'tie' && (
          <View className="flex-row items-center gap-0.5">
            <Text style={{ fontSize: 10, color: colors.textMuted }}>tie</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Response Panel
// ---------------------------------------------------------------------------

interface ResponsePanelProps {
  slot: 'A' | 'B';
  modelId: string;
  state: CompareStreamState;
  winner: boolean;
}

function ResponsePanel({ slot, modelId, state, winner }: ResponsePanelProps) {
  const colors = useThemeColors();
  const displayName = getDisplayName(modelId);
  const slotColor = slot === 'A' ? colors.teal : colors.terraCotta;

  return (
    <Card variant="outline" className="border-white/8">
      {/* Panel header */}
      <View className="flex-row items-center gap-2 pb-3 border-b border-white/6 mb-3">
        <View
          className="w-5 h-5 rounded-md items-center justify-center"
          style={{ backgroundColor: `${slotColor}30` }}
        >
          <Text style={{ fontSize: 10, fontWeight: '700', color: slotColor }}>{slot}</Text>
        </View>
        <Text className="flex-1 text-[13px] font-medium text-white" numberOfLines={1}>
          {displayName}
        </Text>

        {/* Winner badge */}
        {winner && (
          <View className="flex-row items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30">
            <Trophy size={10} color="#f59e0b" />
            <Text style={{ fontSize: 10, fontWeight: '600', color: '#f59e0b' }}>Faster</Text>
          </View>
        )}
      </View>

      {/* Streaming indicator */}
      {state.isStreaming && (
        <View className="flex-row items-center gap-2 mb-3">
          <ActivityIndicator size="small" color={slotColor} />
          <Text className="text-[12px] text-white/40">Generating...</Text>
        </View>
      )}

      {/* Response content */}
      {state.errorMessage ? (
        <View className="bg-red-500/10 rounded-lg px-3 py-2">
          <Text className="text-[12px] text-red-400">{state.errorMessage}</Text>
        </View>
      ) : state.content ? (
        <Text className="text-[13px] text-white/90 leading-5">{state.content}</Text>
      ) : !state.isStreaming ? (
        <Text className="text-[12px] text-white/30 italic">No response yet.</Text>
      ) : null}

      {/* Stats footer */}
      {(state.isDone || state.tokenCount > 0) && (
        <View className="flex-row gap-4 mt-3 pt-2 border-t border-white/6">
          {state.ttftMs !== null && (
            <StatChip
              icon={<Zap size={10} color={colors.textMuted} />}
              label={`${state.ttftMs}ms`}
              title="Time to first token"
            />
          )}
          {state.tokenCount > 0 && (
            <StatChip
              icon={<Hash size={10} color={colors.textMuted} />}
              label={`~${state.tokenCount}`}
              title="Approx tokens"
            />
          )}
          {state.durationMs !== null && (
            <StatChip
              icon={<Clock size={10} color={colors.textMuted} />}
              label={formatDuration(state.durationMs)}
              title="Total time"
            />
          )}
        </View>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Stat Chip
// ---------------------------------------------------------------------------

interface StatChipProps {
  icon: React.ReactNode;
  label: string;
  title: string;
}

function StatChip({ icon, label, title }: StatChipProps) {
  return (
    <View className="flex-row items-center gap-1" accessibilityLabel={title}>
      {icon}
      <Text className="text-[10px] text-white/40">{label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Winner = 'A' | 'B' | 'tie' | null;

/**
 * Determine which model "won" once both streams are complete.
 * Primary criterion: total duration. Secondary: token count.
 * Returns null if data is insufficient.
 */
function determineWinner(a: CompareStreamState, b: CompareStreamState): Winner {
  if (!a.isDone || !b.isDone) return null;
  if (a.errorMessage && b.errorMessage) return null;
  if (a.errorMessage) return 'B';
  if (b.errorMessage) return 'A';

  const dA = a.durationMs ?? Infinity;
  const dB = b.durationMs ?? Infinity;

  if (dA === dB) return 'tie';
  return dA < dB ? 'A' : 'B';
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
