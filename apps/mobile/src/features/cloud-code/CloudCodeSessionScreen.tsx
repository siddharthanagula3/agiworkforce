import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  RefreshControl,
  ScrollView,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, ExternalLink, GitBranch, X } from 'lucide-react-native';
import {
  CLOUD_CODE_DEFAULT_TURN_MODE,
  CLOUD_CODE_DEFAULT_TURN_STEPS,
  CLOUD_CODE_SESSION_COPY,
  CLOUD_CODE_SESSION_STATE_LABELS,
  CLOUD_CODE_SESSION_STATUS_FILTER_LABELS,
  cloudCodePullRequestLabel,
  resolveCloudCodeAgentModel,
  type CloudCodeSession,
  type CloudCodeTurnMode,
  type CloudCodeTurnStepBound,
} from '@agiworkforce/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import { useTierStore } from '@/src/features/billing/store';
import { useKeyboardSafeComposer } from '@/src/features/chat/chrome/keyboardSafeComposer';
import { getManagedDisplayName } from '@/src/features/model-picker/service';
import { useModelStore } from '@/src/features/model-picker/store';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { CloudCodeApprovalCard } from './components/CloudCodeApprovalCard';
import { CloudCodeChangesSheet } from './components/CloudCodeChangesSheet';
import { CloudCodeComposer } from './components/CloudCodeComposer';
import { CloudCodeGate } from './components/CloudCodeGate';
import {
  CloudCodeTaskOptionsSheet,
  cloudCodeContextPercent,
} from './components/CloudCodeTaskOptionsSheet';
import {
  CloudCodeTaskBubble,
  CloudCodeTranscript,
  CloudCodeWorkingRow,
} from './components/CloudCodeTranscript';
import {
  CLOUD_CODE_CHANGES_COPY,
  CLOUD_CODE_OPTIONS_COPY,
  CLOUD_CODE_SCREEN_TITLE,
  CLOUD_CODE_STATE_BADGE_COLORS,
  CLOUD_CODE_TURN_MODE_OPTIONS,
  cloudCodeWorkspaceLabel,
} from './presentation';
import { useCloudCodeAccess } from './useCloudCodeAccess';
import { useCloudCodeChanges } from './useCloudCodeChanges';
import { useCloudCodeSession, type CloudCodeTurnOptions } from './useCloudCodeSession';

const STICK_TO_BOTTOM_DISTANCE = 80;
const CLOSED_NOTE =
  'This session is closed, so it cannot run tasks. Its transcript stays readable.';
const MISSING_NOTE = 'That session is not available. It may have been deleted.';

function Header({
  session,
  onBack,
  onOpenChanges,
}: {
  session: CloudCodeSession | null;
  onBack: () => void;
  onOpenChanges?: () => void;
}) {
  const colors = useThemeColors();
  const archived = session?.archivedAt != null;
  const workspace = session ? cloudCodeWorkspaceLabel(session) : null;

  return (
    <View
      style={{
        minHeight: 56,
        paddingHorizontal: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <PressableBox
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={8}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        <ArrowLeft size={20} color={colors.textSecondary} />
      </PressableBox>
      <View style={{ flex: 1 }}>
        <Text
          numberOfLines={1}
          accessibilityRole="header"
          style={{ color: colors.textPrimary, fontSize: typeScale.callout, fontWeight: '600' }}
        >
          {session?.title ?? CLOUD_CODE_SCREEN_TITLE}
        </Text>
        {workspace ? (
          <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: typeScale.caption }}>
            {workspace}
          </Text>
        ) : null}
      </View>
      {session ? (
        <Badge
          label={
            archived
              ? CLOUD_CODE_SESSION_STATUS_FILTER_LABELS.archived
              : CLOUD_CODE_SESSION_STATE_LABELS[session.state]
          }
          color={archived ? 'gray' : CLOUD_CODE_STATE_BADGE_COLORS[session.state]}
        />
      ) : null}
      {onOpenChanges ? (
        <PressableBox
          onPress={onOpenChanges}
          accessibilityRole="button"
          accessibilityLabel={CLOUD_CODE_CHANGES_COPY.open}
          hitSlop={8}
          testID="cloud-code-open-changes"
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <GitBranch size={20} color={colors.textSecondary} />
        </PressableBox>
      ) : null}
    </View>
  );
}

function Notice({
  message,
  tone,
  onDismiss,
}: {
  message: string;
  tone: 'error' | 'neutral';
  onDismiss?: () => void;
}) {
  const colors = useThemeColors();
  const error = tone === 'error';

  return (
    <View
      accessibilityRole={error ? 'alert' : undefined}
      style={{
        marginHorizontal: 12,
        borderRadius: 14,
        borderCurve: 'continuous',
        paddingVertical: 10,
        paddingLeft: 12,
        paddingRight: onDismiss ? 4 : 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: error ? colors.dangerSurface : colors.surfaceElevated,
        borderWidth: 1,
        borderColor: error ? colors.dangerBorder : colors.border,
      }}
    >
      <Text
        selectable
        style={{
          flex: 1,
          color: error ? colors.agentError : colors.textSecondary,
          fontSize: typeScale.footnote,
          lineHeight: 19,
        }}
      >
        {message}
      </Text>
      {onDismiss ? (
        <PressableBox
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <X size={16} color={colors.textSecondary} />
        </PressableBox>
      ) : null}
    </View>
  );
}

function CenteredState({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        paddingHorizontal: 32,
      }}
    >
      {children}
    </View>
  );
}

function SessionView({
  sessionId,
  initialGoal,
  onBack,
}: {
  sessionId: string;
  initialGoal?: string;
  onBack: () => void;
}) {
  const colors = useThemeColors();
  const keyboard = useKeyboardSafeComposer('screen');
  const tier = useTierStore((state) => state.tier);
  const selectedModel = useModelStore((state) => state.selectedModel);
  const agentModel = useMemo(
    () => resolveCloudCodeAgentModel(selectedModel, tier),
    [selectedModel, tier],
  );
  const view = useCloudCodeSession(sessionId, agentModel);
  const { send } = view;
  const [changesOpen, setChangesOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [turnMode, setTurnMode] = useState<CloudCodeTurnMode>(CLOUD_CODE_DEFAULT_TURN_MODE);
  const [turnSteps, setTurnSteps] = useState<CloudCodeTurnStepBound>(CLOUD_CODE_DEFAULT_TURN_STEPS);
  const changes = useCloudCodeChanges(sessionId, changesOpen, view.reload);
  const turnControls = view.session?.runtimeId === null;
  const turnOptions = useMemo<CloudCodeTurnOptions>(
    () => (turnControls ? { maxSteps: turnSteps, mode: turnMode } : {}),
    [turnControls, turnMode, turnSteps],
  );
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const nearBottom = useRef(true);
  const initialGoalSent = useRef(false);
  const router = useRouter();

  useEffect(() => {
    const goal = initialGoal?.trim();
    if (!goal || initialGoalSent.current) return;
    if (view.status !== 'ready' || view.session?.state !== 'ready') return;
    initialGoalSent.current = true;
    router.setParams({ goal: undefined });
    void send(goal, turnOptions).then((sent) => {
      if (!sent) setDraft((current) => (current.trim() ? current : goal));
    });
  }, [initialGoal, router, send, turnOptions, view.session?.state, view.status]);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    nearBottom.current =
      contentSize.height - (contentOffset.y + layoutMeasurement.height) < STICK_TO_BOTTOM_DISTANCE;
  }, []);

  const handleContentSizeChange = useCallback(() => {
    if (nearBottom.current) scrollRef.current?.scrollToEnd({ animated: false });
  }, []);

  const handleSend = useCallback(async () => {
    const goal = draft.trim();
    if (!goal) return;
    setDraft('');
    nearBottom.current = true;
    const sent = await send(goal, turnOptions);
    if (!sent) setDraft((current) => (current.trim() ? current : goal));
  }, [draft, send, turnOptions]);

  const session = view.session;
  const pullRequestLabel = session ? cloudCodePullRequestLabel(session) : null;
  const pullRequestUrl = session?.pullRequestUrl ?? null;
  const archived = session?.archivedAt != null;
  const closed = session?.state === 'closed';
  const failedMessage = session?.state === 'failed' ? session.lastError : null;
  const noticeMessage = view.actionError ?? view.loadError;
  const contextPercent = session ? cloudCodeContextPercent(session, agentModel) : null;
  const composerDetail = [
    getManagedDisplayName(agentModel),
    turnControls && turnMode !== CLOUD_CODE_DEFAULT_TURN_MODE
      ? CLOUD_CODE_TURN_MODE_OPTIONS.find((option) => option.id === turnMode)?.label
      : null,
    contextPercent !== null ? `${contextPercent}% context` : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(' · ');

  if (view.status === 'loading') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceBase }}>
        <Header session={null} onBack={onBack} />
        <CenteredState>
          <ActivityIndicator color={colors.textPrimary} />
          <Text style={{ color: colors.textMuted }}>Opening this session</Text>
        </CenteredState>
      </SafeAreaView>
    );
  }

  if (view.status === 'missing' || view.status === 'error' || !session) {
    const missing = view.status === 'missing';
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceBase }}>
        <Header session={null} onBack={onBack} />
        <CenteredState>
          <Text
            selectable
            style={{
              color: colors.textSecondary,
              fontSize: typeScale.body,
              lineHeight: 22,
              textAlign: 'center',
            }}
          >
            {missing ? MISSING_NOTE : (view.loadError ?? MISSING_NOTE)}
          </Text>
          {missing ? (
            <Button
              title={`Back to ${CLOUD_CODE_SCREEN_TITLE}`}
              variant="outline"
              onPress={onBack}
            />
          ) : (
            <Button title="Try again" variant="outline" onPress={view.retry} />
          )}
        </CenteredState>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceBase }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={keyboard.behavior}
        keyboardVerticalOffset={keyboard.keyboardVerticalOffset}
      >
        <Header session={session} onBack={onBack} onOpenChanges={() => setChangesOpen(true)} />
        <CloudCodeChangesSheet
          visible={changesOpen}
          session={session}
          entries={view.terminalEntries}
          view={changes}
          onClose={() => setChangesOpen(false)}
        />
        <CloudCodeTaskOptionsSheet
          visible={optionsOpen}
          session={session}
          model={agentModel}
          turnControls={turnControls}
          mode={turnMode}
          steps={turnSteps}
          onModeChange={setTurnMode}
          onStepsChange={setTurnSteps}
          onClose={() => setOptionsOpen(false)}
        />

        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: 20,
            gap: 14,
          }}
          keyboardShouldPersistTaps="handled"
          onScroll={handleScroll}
          scrollEventThrottle={64}
          onContentSizeChange={handleContentSizeChange}
          refreshControl={
            <RefreshControl
              refreshing={view.refreshing}
              onRefresh={view.refresh}
              tintColor={colors.textPrimary}
              progressBackgroundColor={colors.surfaceElevated}
            />
          }
        >
          {pullRequestLabel && pullRequestUrl ? (
            <PressableBox
              onPress={() => void openUntrustedUrlInAppBrowser(pullRequestUrl)}
              accessibilityRole="link"
              accessibilityLabel={pullRequestLabel}
              hitSlop={4}
              style={{
                alignSelf: 'flex-start',
                minHeight: 36,
                borderRadius: 18,
                paddingHorizontal: 12,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <ExternalLink size={14} color={colors.textSecondary} />
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: typeScale.footnote,
                  fontWeight: '600',
                }}
              >
                {pullRequestLabel}
              </Text>
            </PressableBox>
          ) : null}

          {failedMessage ? (
            <Text
              selectable
              style={{ color: colors.agentError, fontSize: typeScale.footnote, lineHeight: 19 }}
            >
              {failedMessage}
            </Text>
          ) : null}

          <CloudCodeTranscript items={view.transcript} />

          {view.pendingGoal ? <CloudCodeTaskBubble text={view.pendingGoal} /> : null}

          {view.working ? (
            <CloudCodeWorkingRow
              label={
                view.stopping
                  ? CLOUD_CODE_SESSION_COPY.stoppingTurn
                  : CLOUD_CODE_SESSION_COPY.agentWorking
              }
            />
          ) : null}

          {view.approvals.map((approval) => (
            <CloudCodeApprovalCard
              key={`${approval.turnId}:${approval.stepIndex}`}
              approval={approval}
              disabled={view.turnRequest !== null}
              onDecide={(decision) => view.decide(approval, decision)}
            />
          ))}
        </ScrollView>

        {noticeMessage ? (
          <Notice
            message={noticeMessage}
            tone="error"
            {...(view.actionError ? { onDismiss: view.dismissActionError } : {})}
          />
        ) : null}

        {closed ? (
          <View style={{ paddingVertical: 12 }}>
            <Notice message={CLOSED_NOTE} tone="neutral" />
          </View>
        ) : archived ? (
          <View style={{ paddingVertical: 12, gap: 10 }}>
            <Notice message={CLOUD_CODE_SESSION_COPY.archivedBanner} tone="neutral" />
            <View style={{ paddingHorizontal: 12 }}>
              <Button
                title={CLOUD_CODE_SESSION_COPY.unarchiveSession}
                variant="outline"
                loading={view.unarchiving}
                disabled={view.unarchiving}
                onPress={view.unarchive}
              />
            </View>
          </View>
        ) : (
          <CloudCodeComposer
            value={draft}
            working={view.working}
            stopping={view.stopping}
            detail={composerDetail}
            optionsLabel={CLOUD_CODE_OPTIONS_COPY.open}
            onChangeText={setDraft}
            onSend={() => void handleSend()}
            onStop={view.stop}
            onOpenOptions={() => setOptionsOpen(true)}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function CloudCodeSessionScreen({
  sessionId,
  initialGoal,
}: {
  sessionId: string;
  initialGoal?: string;
}) {
  const router = useRouter();
  const access = useCloudCodeAccess();

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/cloud-code' as Parameters<typeof router.replace>[0]);
  }, [router]);

  if (!access.ready) {
    return (
      <CloudCodeGate signedIn={access.signedIn} onBack={handleBack} onContinue={access.activate} />
    );
  }

  return (
    <SessionView
      key={`${access.accountKey}:${sessionId}`}
      sessionId={sessionId}
      initialGoal={initialGoal}
      onBack={handleBack}
    />
  );
}
