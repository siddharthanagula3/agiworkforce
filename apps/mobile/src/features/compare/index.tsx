import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { View, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Trophy, Zap, Hash, Clock } from 'lucide-react-native';
import type BottomSheet from '@gorhom/bottom-sheet';
import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { ChatInput } from '@/src/features/chat/components/ChatInput';
import type { Attachment } from '@/src/features/chat/components/AttachmentPreview';
import { ModelPickerSheet } from '@/src/features/model-picker/components/ModelPickerSheet';
import { streamChat, type StreamDelta } from '@/services/streaming';
import { getCloudModelsForTier, getModelById, getProviderById, getDisplayName } from '@/lib/models';
import { getPlanMaxConcurrentTurns, requireProviderDefaultModel } from '@agiworkforce/types';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { uuidv7 } from '@agiworkforce/utils/uuidv7';
import { useAuthStore } from '@/src/features/auth/store';
import { beginCloudPostAuthIntent } from '@/src/features/auth/services/postAuthIntent';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
} from '@/src/features/auth/services/cloudAccountSession';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useWaitlistStore } from '@/src/features/waitlist/store';
import { useTierStore } from '@/src/features/billing/store';
import { CloudSyncBlockedBanner } from '@/src/features/settings/common';
import { EgressBlockedError } from '@/lib/egressGuard';

interface CompareStreamState {
  content: string;
  isQueued: boolean;
  isStreaming: boolean;
  isDone: boolean;
  errorMessage: string | null;
  tokenCount: number;
  ttftMs: number | null;
  durationMs: number | null;
}

const initialStreamState = (): CompareStreamState => ({
  content: '',
  isQueued: false,
  isStreaming: false,
  isDone: false,
  errorMessage: null,
  tokenCount: 0,
  ttftMs: null,
  durationMs: null,
});

const COMPARE_ATTACHMENTS_UNSUPPORTED =
  'Compare sends prompt text only. Remove the attachment, or run this prompt in a chat to include it.';

const LOCAL_MODE_COMPARE_NOTICE =
  'Model comparison runs on AGI Cloud, so it is unavailable while chat is in Local Mode. ' +
  'Nothing was sent from this device. Switch to AGI Cloud to compare two models.';

const ONE_ANSWER_AT_A_TIME_NOTE =
  'Your plan runs one answer at a time, so the second answer starts when the first finishes.';

function runsOneAnswerAtATime(tier: string): boolean {
  const limit = getPlanMaxConcurrentTurns(tier);
  return limit !== null && limit <= 1;
}

function compareErrorMessage(err: unknown): string {
  if (err instanceof EgressBlockedError) return LOCAL_MODE_COMPARE_NOTICE;
  const raw = err instanceof Error ? err.message.trim() : '';
  return raw || 'This model could not respond. Please try again.';
}

const DEFAULT_MODEL_A = requireProviderDefaultModel('anthropic');
const DEFAULT_MODEL_B = requireProviderDefaultModel('openai');

function comparisonModelsForTier(tier: string): [string, string] | null {
  const models = getCloudModelsForTier(tier);
  if (models.length < 2) return null;
  const ids = models.map((model) => model.id);
  const first = ids.includes(DEFAULT_MODEL_A) ? DEFAULT_MODEL_A : ids[0]!;
  const second =
    ids.includes(DEFAULT_MODEL_B) && DEFAULT_MODEL_B !== first
      ? DEFAULT_MODEL_B
      : ids.find((id) => id !== first)!;
  return [first, second];
}

export default function CompareScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const clerkUserId = useAuthStore((state) => state.clerkUserId);
  const appMode = useChatAppModeStore((state) => state.appMode);
  const setAppMode = useChatAppModeStore((state) => state.setAppMode);
  const cloudUnlocked = useWaitlistStore((state) => state.cloudUnlocked);
  const tier = useTierStore((state) => state.tier);
  const isCloudMode = appMode === 'cloud';
  const availableModels = comparisonModelsForTier(tier);
  const oneAnswerAtATime = runsOneAnswerAtATime(tier);

  const [modelA, setModelA] = useState(() => availableModels?.[0] ?? DEFAULT_MODEL_A);
  const [modelB, setModelB] = useState(() => availableModels?.[1] ?? DEFAULT_MODEL_B);

  const [stateA, setStateA] = useState<CompareStreamState>(initialStreamState);
  const [stateB, setStateB] = useState<CompareStreamState>(initialStreamState);

  const [lastPrompt, setLastPrompt] = useState<string | null>(null);

  const controllerARef = useRef<AbortController | null>(null);
  const controllerBRef = useRef<AbortController | null>(null);
  const compareGenerationRef = useRef(0);
  const modelPickerARef = useRef<BottomSheet>(null);
  const modelPickerBRef = useRef<BottomSheet>(null);

  const [activePickerSlot, setActivePickerSlot] = useState<'A' | 'B' | null>(null);

  const resetComparison = useCallback(() => {
    compareGenerationRef.current += 1;
    controllerARef.current?.abort();
    controllerBRef.current?.abort();
    controllerARef.current = null;
    controllerBRef.current = null;
    setLastPrompt(null);
    setStateA(initialStreamState());
    setStateB(initialStreamState());
  }, []);

  const handleBack = useCallback(() => {
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
    setStateA((prev) => ({ ...prev, isQueued: false, isStreaming: false, isDone: true }));
    setStateB((prev) => ({ ...prev, isQueued: false, isStreaming: false, isDone: true }));
  }, []);

  useLayoutEffect(() => {
    resetComparison();
  }, [clerkUserId, appMode, resetComparison]);

  useLayoutEffect(() => {
    resetComparison();
    const next = comparisonModelsForTier(tier);
    if (next) {
      setModelA(next[0]);
      setModelB(next[1]);
    }
  }, [tier, resetComparison]);

  const handleSwitchToCloud = useCallback(() => {
    if (!cloudUnlocked) {
      router.push(beginCloudPostAuthIntent('cloud-compare'));
      return;
    }
    setAppMode('cloud');
  }, [cloudUnlocked, router, setAppMode]);

  const handleSend = useCallback(
    (text: string, attachments?: Attachment[]) => {
      if (!text.trim()) return false;

      if (attachments && attachments.length > 0) {
        const unsupported: CompareStreamState = {
          ...initialStreamState(),
          isDone: true,
          errorMessage: COMPARE_ATTACHMENTS_UNSUPPORTED,
        };
        setStateA(unsupported);
        setStateB(unsupported);
        return false;
      }

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

      const eligibleIds = getCloudModelsForTier(useTierStore.getState().tier).map(
        (model) => model.id,
      );
      if (
        eligibleIds.length < 2 ||
        !eligibleIds.includes(modelA) ||
        !eligibleIds.includes(modelB) ||
        modelA === modelB
      ) {
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

      compareGenerationRef.current += 1;
      const generation = compareGenerationRef.current;
      controllerARef.current?.abort();
      controllerBRef.current?.abort();

      const prompt = text.trim();
      const queueB = runsOneAnswerAtATime(useTierStore.getState().tier);
      setLastPrompt(prompt);
      setStateA(initialStreamState());
      setStateB({ ...initialStreamState(), isQueued: queueB });

      const runAnswer = (
        model: string,
        setState: Dispatch<SetStateAction<CompareStreamState>>,
        controller: AbortController,
        onSettled?: () => void,
      ) => {
        const isActive = () =>
          compareGenerationRef.current === generation &&
          !controller.signal.aborted &&
          isCloudAccountEpochCurrent(accountEpoch);
        const startedAt = Date.now();
        setState((prev) => ({ ...prev, isQueued: false, isStreaming: true }));

        streamChat(
          {
            model,
            messages: [{ role: 'user', content: prompt }],
            stream: true as const,
            operationId: uuidv7(),
            thinking: false,
            tool_choice: 'none',
            memory_enabled: false,
            connector_tools_enabled: false,
          },
          {
            onDelta: (delta: StreamDelta) => {
              if (!isActive()) return;
              if (delta.content) {
                setState((prev) => {
                  const newContent = prev.content + delta.content;
                  const ttft = prev.ttftMs === null ? Date.now() - startedAt : prev.ttftMs;
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
              if (!isActive()) return;
              setState((prev) => ({
                ...prev,
                isStreaming: false,
                isDone: true,
                durationMs: Date.now() - startedAt,
              }));
              onSettled?.();
            },
            onError: (err: Error) => {
              if (!isActive()) return;
              setState((prev) => ({
                ...prev,
                isStreaming: false,
                isDone: true,
                errorMessage: compareErrorMessage(err),
              }));
              onSettled?.();
            },
          },
          controller.signal,
        );
      };

      const ctrlA = new AbortController();
      const ctrlB = new AbortController();
      controllerARef.current = ctrlA;
      controllerBRef.current = ctrlB;
      const startB = () => runAnswer(modelB, setStateB, ctrlB);
      runAnswer(modelA, setStateA, ctrlA, queueB ? startB : undefined);
      if (!queueB) startB();
      return true;
    },
    [modelA, modelB],
  );

  const isAnyStreaming =
    stateA.isStreaming || stateB.isStreaming || stateA.isQueued || stateB.isQueued;
  const bothDone = stateA.isDone && stateB.isDone;

  const winner = bothDone ? determineWinner(stateA, stateB) : null;

  const handleOpenPickerA = useCallback(() => {
    setActivePickerSlot('A');
    modelPickerARef.current?.snapToIndex(0);
  }, []);

  const handleOpenPickerB = useCallback(() => {
    setActivePickerSlot('B');
    modelPickerBRef.current?.snapToIndex(0);
  }, []);

  const handleSelectModelA = useCallback(
    (id: string) => {
      if (!getCloudModelsForTier(useTierStore.getState().tier).some((model) => model.id === id))
        return;
      if (id !== modelA) {
        resetComparison();
        if (id === modelB) setModelB(modelA);
        setModelA(id);
      }
      setActivePickerSlot(null);
    },
    [modelA, modelB, resetComparison],
  );

  const handleSelectModelB = useCallback(
    (id: string) => {
      if (!getCloudModelsForTier(useTierStore.getState().tier).some((model) => model.id === id))
        return;
      if (id !== modelB) {
        resetComparison();
        if (id === modelA) setModelA(modelB);
        setModelB(id);
      }
      setActivePickerSlot(null);
    },
    [modelA, modelB, resetComparison],
  );

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
          <PressableBox
            onPress={handleBack}
            className="p-2 rounded-lg active:bg-white/5"
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <ArrowLeft size={20} color={colors.textSecondary} />
          </PressableBox>
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
        ) : !availableModels ? (
          <View className="flex-1 items-center justify-center px-8">
            <Text className="text-white text-center text-base font-semibold">
              Compare two models
            </Text>
            <Text className="text-white/50 text-center text-sm leading-5 mt-3">
              Your current plan has fewer than two models available for comparison. You can use your
              available model in Chat.
            </Text>
            <PressableBox
              onPress={handleBack}
              accessibilityRole="button"
              accessibilityLabel="Go to Chat"
              className="rounded-xl px-5 py-3 mt-6"
              style={{ backgroundColor: colors.surfaceElevated }}
            >
              <Text className="text-white font-medium">Go to Chat</Text>
            </PressableBox>
          </View>
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
                <Text className="text-xs text-fg-muted font-medium">vs</Text>
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
                  <Text className="text-fg-muted text-center text-sm leading-5">
                    Type a prompt below to send to both models simultaneously and compare the
                    responses.
                  </Text>
                </View>
              )}

              {/* Response columns, stacked on narrow screens */}
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
      {isCloudMode && availableModels ? (
        <>
          <ModelPickerSheet
            sheetRef={modelPickerARef}
            modelScope="cloud"
            onSelect={handleSelectModelA}
          />
          <ModelPickerSheet
            sheetRef={modelPickerBRef}
            modelScope="cloud"
            onSelect={handleSelectModelB}
          />
        </>
      ) : null}
    </SafeAreaView>
  );
}

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
    <PressableBox
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
          <Text style={{ fontSize: typeScale.caption, fontWeight: '700', color: slotColor }}>
            {slot}
          </Text>
        </View>

        <View className="flex-1">
          <Text className="text-[12px] text-white font-medium" numberOfLines={1}>
            {displayName}
          </Text>
          {provider && (
            <Text className="text-xs text-fg-muted" numberOfLines={1}>
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
            <Text style={{ fontSize: typeScale.caption, color: colors.textMuted }}>tie</Text>
          </View>
        )}
      </View>
    </PressableBox>
  );
}

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
          <Text style={{ fontSize: typeScale.caption, fontWeight: '700', color: slotColor }}>
            {slot}
          </Text>
        </View>
        <Text className="flex-1 text-[13px] font-medium text-white" numberOfLines={1}>
          {displayName}
        </Text>

        {/* Winner badge */}
        {winner && (
          <View className="flex-row items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30">
            <Trophy size={10} color="#f59e0b" />
            <Text style={{ fontSize: typeScale.caption, fontWeight: '600', color: '#f59e0b' }}>
              Faster
            </Text>
          </View>
        )}
      </View>

      {/* Streaming indicator */}
      {state.isStreaming && (
        <View className="flex-row items-center gap-2 mb-3">
          <ActivityIndicator size="small" color={slotColor} />
          <Text className="text-[12px] text-fg-muted">Generating...</Text>
        </View>
      )}

      {/* Response content */}
      {state.errorMessage ? (
        <View className="bg-red-500/10 rounded-lg px-3 py-2">
          <Text className="text-[12px] text-red-400">{state.errorMessage}</Text>
        </View>
      ) : state.content ? (
        <Text className="text-[13px] text-white leading-5">{state.content}</Text>
      ) : state.isQueued ? (
        <Text className="text-[12px] text-fg-muted">{ONE_ANSWER_AT_A_TIME_NOTE}</Text>
      ) : !state.isStreaming ? (
        <Text className="text-[12px] text-fg-muted italic">No response yet.</Text>
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

interface StatChipProps {
  icon: React.ReactNode;
  label: string;
  title: string;
}

function StatChip({ icon, label, title }: StatChipProps) {
  return (
    <View className="flex-row items-center gap-1" accessibilityLabel={title}>
      {icon}
      <Text className="text-xs text-fg-muted">{label}</Text>
    </View>
  );
}

type Winner = 'A' | 'B' | 'tie' | null;

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
