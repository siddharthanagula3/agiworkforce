import { useCallback, useLayoutEffect, useRef, useState } from 'react';
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
import { ChatInput } from '@/src/features/chat/components/ChatInput';
import { ModelPickerSheet } from '@/src/features/model-picker/components/ModelPickerSheet';
import { streamChat, type StreamDelta } from '@/services/streaming';
import { getModelById, getProviderById, getDisplayName } from '@/lib/models';
import { getProviderDefaultModel } from '@agiworkforce/types';
import { useThemeColors } from '@/src/ui/theme';
import { uuidv7 } from '@agiworkforce/utils/uuidv7';
import { useAuthStore } from '@/src/features/auth/store';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
} from '@/src/features/auth/services/cloudAccountSession';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useWaitlistStore } from '@/src/features/waitlist/store';
import { CloudSyncBlockedBanner } from '@/src/features/settings/common';
import { EgressBlockedError } from '@/lib/egressGuard';

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

const LOCAL_MODE_COMPARE_NOTICE =
  'Model comparison runs on AGI Cloud, so it is unavailable while chat is in Local Mode. ' +
  'Nothing was sent from this device. Switch to AGI Cloud to compare two models.';

/**
 * The panes render this string verbatim, so it must never be a developer
 * message. `EgressBlockedError` (lib/egressGuard.ts) carries the internal
 * refusal text — "egressGuard refused: outbound request to our managed-cloud
 * host …" — which is correct fail-closed behaviour but is not user-facing
 * copy. Every other error keeps its own message, which the streaming service
 * already writes for humans; an empty one falls back to a neutral sentence
 * instead of rendering blank.
 */
function compareErrorMessage(err: unknown): string {
  if (err instanceof EgressBlockedError) return LOCAL_MODE_COMPARE_NOTICE;
  const raw = err instanceof Error ? err.message.trim() : '';
  return raw || 'This model could not respond. Please try again.';
}

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
  const clerkUserId = useAuthStore((state) => state.clerkUserId);
  // Compare is a Managed-Cloud-only surface: both panes stream through
  // `streamChat` -> `guardedFetch`, which refuses every our-cloud request while
  // chat is in Local Mode. Read the boundary here so the screen states that
  // up front instead of letting two panes fill with the guard's internal
  // refusal text after the user has already picked models and typed a prompt.
  const appMode = useChatAppModeStore((state) => state.appMode);
  const setAppMode = useChatAppModeStore((state) => state.setAppMode);
  const cloudUnlocked = useWaitlistStore((state) => state.cloudUnlocked);
  const isCloudMode = appMode === 'cloud';

  const [modelA, setModelA] = useState(DEFAULT_MODEL_A);
  const [modelB, setModelB] = useState(DEFAULT_MODEL_B);

  const [stateA, setStateA] = useState<CompareStreamState>(initialStreamState);
  const [stateB, setStateB] = useState<CompareStreamState>(initialStreamState);

  const [lastPrompt, setLastPrompt] = useState<string | null>(null);

  // Each model gets its own abort controller and sheet ref
  const controllerARef = useRef<AbortController | null>(null);
  const controllerBRef = useRef<AbortController | null>(null);
  const compareGenerationRef = useRef(0);
  const modelPickerARef = useRef<BottomSheet>(null);
  const modelPickerBRef = useRef<BottomSheet>(null);

  // Which picker slot is currently active (used for the active-model pill highlight)
  const [activePickerSlot, setActivePickerSlot] = useState<'A' | 'B' | null>(null);

  const handleBack = useCallback(() => {
    // Abort any running streams before leaving
    compareGenerationRef.current += 1;
    controllerARef.current?.abort();
    controllerBRef.current?.abort();
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(app)' as Parameters<typeof router.replace>[0]);
    }
  }, [router]);

  const handleStop = useCallback(() => {
    compareGenerationRef.current += 1;
    controllerARef.current?.abort();
    controllerBRef.current?.abort();
    setStateA((prev) => ({ ...prev, isStreaming: false, isDone: true }));
    setStateB((prev) => ({ ...prev, isStreaming: false, isDone: true }));
  }, []);

  useLayoutEffect(() => {
    // Compare responses are intentionally ephemeral, but they are still Cloud
    // account data. Clear them before paint whenever Clerk changes identity,
    // and invalidate every buffered callback from the prior account.
    compareGenerationRef.current += 1;
    controllerARef.current?.abort();
    controllerBRef.current?.abort();
    controllerARef.current = null;
    controllerBRef.current = null;
    setLastPrompt(null);
    setStateA(initialStreamState());
    setStateB(initialStreamState());
  }, [clerkUserId]);

  // Switching boundary is the user's decision, never this screen's: mirror the
  // chat screens' public-alpha gate — a signed-out user goes to Clerk sign-in
  // (ClerkTokenBridge flips cloudUnlocked), a signed-in one flips the toggle.
  const handleSwitchToCloud = useCallback(() => {
    if (!cloudUnlocked) {
      router.push('/(auth)/login' as Parameters<typeof router.push>[0]);
      return;
    }
    setAppMode('cloud');
  }, [cloudUnlocked, router, setAppMode]);

  const handleSend = useCallback(
    (text: string) => {
      if (!text.trim()) return false;

      // Fail closed at the top: refuse the comparison with a visible
      // explanation rather than firing two cloud streams that guardedFetch
      // will refuse. Read the store at CALL time, not the render-time value —
      // a boundary flip while a captured composer handler is still in hand
      // must not slip a cloud send through a stale closure.
      if (useChatAppModeStore.getState().appMode !== 'cloud') {
        const localModeState: CompareStreamState = {
          ...initialStreamState(),
          isDone: true,
          errorMessage: LOCAL_MODE_COMPARE_NOTICE,
        };
        setStateA(localModeState);
        setStateB(localModeState);
        return false;
      }

      const accountEpoch = captureCloudAccountEpoch();
      if (!accountEpoch) {
        const signedOutState: CompareStreamState = {
          ...initialStreamState(),
          isDone: true,
          errorMessage: 'Sign in to use AGI Cloud model comparison.',
        };
        setStateA(signedOutState);
        setStateB(signedOutState);
        return false;
      }

      // Abort previous streams if any
      compareGenerationRef.current += 1;
      const generation = compareGenerationRef.current;
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
      const isAActive = () =>
        compareGenerationRef.current === generation &&
        !ctrlA.signal.aborted &&
        isCloudAccountEpochCurrent(accountEpoch);

      const startA = Date.now();
      setStateA((prev) => ({ ...prev, isStreaming: true }));

      streamChat(
        {
          model: modelA,
          messages,
          stream: true as const,
          operationId: uuidv7(),
          thinking: false,
        },
        {
          onDelta: (delta: StreamDelta) => {
            if (!isAActive()) return;
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
            if (!isAActive()) return;
            setStateA((prev) => ({
              ...prev,
              isStreaming: false,
              isDone: true,
              durationMs: Date.now() - startA,
            }));
          },
          onError: (err: Error) => {
            if (!isAActive()) return;
            setStateA((prev) => ({
              ...prev,
              isStreaming: false,
              isDone: true,
              errorMessage: compareErrorMessage(err),
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
      const isBActive = () =>
        compareGenerationRef.current === generation &&
        !ctrlB.signal.aborted &&
        isCloudAccountEpochCurrent(accountEpoch);

      const startB = Date.now();
      setStateB((prev) => ({ ...prev, isStreaming: true }));

      streamChat(
        {
          model: modelB,
          messages,
          stream: true as const,
          operationId: uuidv7(),
          thinking: false,
        },
        {
          onDelta: (delta: StreamDelta) => {
            if (!isBActive()) return;
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
            if (!isBActive()) return;
            setStateB((prev) => ({
              ...prev,
              isStreaming: false,
              isDone: true,
              durationMs: Date.now() - startB,
            }));
          },
          onError: (err: Error) => {
            if (!isBActive()) return;
            setStateB((prev) => ({
              ...prev,
              isStreaming: false,
              isDone: true,
              errorMessage: compareErrorMessage(err),
            }));
          },
        },
        ctrlB.signal,
      );
      return true;
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
    <SafeAreaView
      className="flex-1"
      style={{ backgroundColor: colors.surfaceBase }}
      edges={['top']}
    >
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

        {/* Local Mode: state the boundary and stop. Rendering the pickers and
            composer here would invite a send that guardedFetch refuses, and the
            panes would then show the guard's internal message. */}
        {!isCloudMode ? (
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ padding: 16 }}
            showsVerticalScrollIndicator={false}
          >
            <CloudSyncBlockedBanner
              onSwitchToCloud={handleSwitchToCloud}
              message={LOCAL_MODE_COMPARE_NOTICE}
            />
          </ScrollView>
        ) : (
          <>
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
                    Type a prompt below to send to both models simultaneously and compare the
                    responses.
                  </Text>
                </View>
              )}

              {/* Response columns — stacked on narrow screens */}
              {(lastPrompt ||
                stateA.isStreaming ||
                stateB.isStreaming ||
                stateA.errorMessage ||
                stateB.errorMessage) && (
                <>
                  <ResponsePanel slot="A" modelId={modelA} state={stateA} winner={winner === 'A'} />
                  <ResponsePanel slot="B" modelId={modelB} state={stateB} winner={winner === 'B'} />
                </>
              )}
            </ScrollView>

            {/* ---- Input ---- */}
            <ChatInput onSend={handleSend} isStreaming={isAnyStreaming} onStop={handleStop} />
          </>
        )}
      </KeyboardAvoidingView>

      {/* ---- Model Picker Sheets ---- */}
      {/* Rendered outside KeyboardAvoidingView so they overlay correctly */}
      {isCloudMode ? (
        <>
          <ModelPickerSheet sheetRef={modelPickerARef} onSelect={handleSelectModelA} />
          <ModelPickerSheet sheetRef={modelPickerBRef} onSelect={handleSelectModelB} />
        </>
      ) : null}
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
