import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  KeyboardAvoidingView,
  ScrollView,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { ArrowDown, ArrowLeft, MoreHorizontal } from 'lucide-react-native';
import { REMOTE_CODE_LIMITS } from '@agiworkforce/types';
import { Badge } from '@/components/ui/Badge';
import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { useKeyboardSafeComposer } from '@/src/features/chat/chrome/keyboardSafeComposer';
import { CloudCodeLineCountsText } from '@/src/features/cloud-code/components/CloudCodeChangesCard';
import {
  CloudCodeTaskBubble,
  CloudCodeWorkingRow,
} from '@/src/features/cloud-code/components/CloudCodeTranscript';
import { SessionComposerField } from '@/src/features/cloud-code/components/SessionComposerField';
import {
  CLOUD_CODE_SCREEN_TITLE,
  cloudCodeChangeCountsLabel,
  cloudCodeFileCountLabel,
} from '@/src/features/cloud-code/presentation';
import { ActionMenuSheet } from '@/src/features/conversation-actions/RenameConversationModal';
import { renderMarkdownContent } from '@/src/features/chat/components/MessageContentRenderer';
import { radii, useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import {
  answerCodeApproval,
  answerCodeQuestion,
  attachCodeSession,
  detachCodeSession,
  interruptCodeTurn,
  requestCodeTranscript,
  steerCodeSession,
} from '../remote-code/service';
import {
  remoteCodeThreadKey,
  useRemoteCodePreferences,
  useRemoteCodeStore,
} from '../remote-code/store';
import { CodeSessionChangesSheet } from './CodeSessionChangesSheet';
import {
  CodeApprovalCard,
  CodeQuestionCard,
  CodeQueuedBubble,
  CodeReplyRow,
  CodeThoughtRow,
  CodeWorkGroup,
} from './CodeSessionParts';
import {
  CLOUD_SESSION_LABEL,
  codeSessionStatusColor,
  codeSessionStatusLabel,
} from './CodeSessionsCard';
import {
  CODE_SESSION_COPY as COPY,
  buildCodeSessionTimeline,
  codeChangedFileCount,
  codeWorkingLabel,
  countDiffLines,
  type CodeTimelineItem,
} from './codeSessionTimeline';

const STICK_TO_BOTTOM_DISTANCE = 80;

interface CodeSessionViewProps {
  rootId: string;
  threadId: string;
  /**
   * The approval a notification sent the reader here for. It is shown first
   * and announced, so the one decision they were asked for is not somewhere
   * down a list of everything else this session is waiting on.
   */
  focusApprovalId?: string;
  onBack: () => void;
}

function TimelineRow({ item }: { item: CodeTimelineItem }) {
  const colors = useThemeColors();

  switch (item.kind) {
    case 'user':
      return <CloudCodeTaskBubble text={item.text} />;
    case 'queued':
      return <CodeQueuedBubble text={item.text} />;
    case 'reply':
      return <CodeReplyRow text={item.text} />;
    case 'partial':
      return <View>{renderMarkdownContent(item.text, colors)}</View>;
    case 'thinking':
      return <CodeThoughtRow text={item.text} live={item.live} />;
    case 'work':
      return <CodeWorkGroup tools={item.tools} />;
  }
}

export function CodeSessionView({
  rootId,
  threadId,
  focusApprovalId,
  onBack,
}: CodeSessionViewProps) {
  const colors = useThemeColors();
  const router = useRouter();
  const keyboard = useKeyboardSafeComposer('screen');
  const thread = useRemoteCodeStore(
    (state) => state.threads[remoteCodeThreadKey(rootId, threadId)] ?? null,
  );
  const summary = useRemoteCodeStore((state) =>
    state.sessions.find((session) => session.rootId === rootId && session.threadId === threadId),
  );
  const steer = useRemoteCodePreferences((state) => state.followUpBehavior === 'steer');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [changesOpen, setChangesOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [awayFromLatest, setAwayFromLatest] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const nearBottom = useRef(true);

  useEffect(() => {
    void attachCodeSession(rootId, threadId);
    return () => {
      void detachCodeSession(rootId, threadId);
    };
  }, [rootId, threadId]);

  const syncedAt = thread?.syncedAt;
  useEffect(() => {
    if (syncedAt) void requestCodeTranscript(rootId, threadId, null);
  }, [rootId, syncedAt, threadId]);

  const timeline = useMemo(() => (thread ? buildCodeSessionTimeline(thread) : []), [thread]);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const near =
      contentSize.height - (contentOffset.y + layoutMeasurement.height) < STICK_TO_BOTTOM_DISTANCE;
    nearBottom.current = near;
    setAwayFromLatest(!near);
  }, []);

  const handleContentSizeChange = useCallback(() => {
    if (nearBottom.current) scrollRef.current?.scrollToEnd({ animated: false });
  }, []);

  const jumpToLatest = useCallback(() => {
    nearBottom.current = true;
    setAwayFromLatest(false);
    scrollRef.current?.scrollToEnd({ animated: true });
  }, []);

  const header = (
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
          {thread?.title || CLOUD_CODE_SCREEN_TITLE}
        </Text>
        {summary?.folder ? (
          <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: typeScale.caption }}>
            {[summary.folder, summary.branch].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
      </View>
      {summary?.location === 'cloud' ? <Badge label={CLOUD_SESSION_LABEL} /> : null}
      {thread?.status === 'running' ? (
        <LoadingIndicator size="small" accessibilityLabel={codeSessionStatusLabel('running')} />
      ) : thread && (thread.status === 'awaiting_approval' || thread.status === 'failed') ? (
        <Badge
          label={codeSessionStatusLabel(thread.status)}
          color={codeSessionStatusColor(thread.status)}
        />
      ) : null}
      {thread ? (
        <PressableBox
          onPress={() => setMenuOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={COPY.more}
          hitSlop={8}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <MoreHorizontal size={20} color={colors.textSecondary} />
        </PressableBox>
      ) : null}
    </View>
  );

  if (!thread) {
    return (
      <View style={{ flex: 1 }}>
        {header}
        <View
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}
        >
          <Text style={{ color: colors.textMuted, textAlign: 'center' }}>{COPY.opening}</Text>
        </View>
      </View>
    );
  }

  const running = thread.activeTurnId !== null;
  const trimmed = draft.trim();
  const empty = trimmed.length === 0;
  const stopInSendSlot = running && empty;
  const canSend = !sending && !empty && trimmed.length <= REMOTE_CODE_LIMITS.guidanceLength;
  const waiting = thread.pendingApprovals.length + thread.pendingQuestions.length > 0;
  const orderedApprovals =
    focusApprovalId === undefined
      ? thread.pendingApprovals
      : [
          ...thread.pendingApprovals.filter((a) => a.requestId === focusApprovalId),
          ...thread.pendingApprovals.filter((a) => a.requestId !== focusApprovalId),
        ];
  const changedFiles = codeChangedFileCount(thread);
  const diffCounts = countDiffLines(thread.diffs);
  const lastRun = thread.testRuns[thread.testRuns.length - 1];
  const hasChanges = changedFiles > 0 || thread.testRuns.length > 0;
  const earliest = thread.transcript?.messages[0]?.index;

  const handleSend = async () => {
    if (!canSend) return;
    const text = trimmed;
    setDraft('');
    setSendError(null);
    setSending(true);
    nearBottom.current = true;
    const sent = await steerCodeSession(rootId, threadId, text, running && steer);
    if (!sent) {
      setDraft((current) => (current.trim() ? current : text));
      setSendError(COPY.sendFailed);
    }
    setSending(false);
  };

  const handleStop = () => {
    if (thread.activeTurnId) void interruptCodeTurn(rootId, threadId, thread.activeTurnId);
  };

  const go = (route: string) => router.push(route as Parameters<typeof router.push>[0]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={keyboard.behavior}
      keyboardVerticalOffset={keyboard.keyboardVerticalOffset}
    >
      {header}
      <ActionMenuSheet
        dismissLabel="Dismiss session actions"
        menu={{
          visible: menuOpen,
          title: thread.title,
          close: () => setMenuOpen(false),
          actions: [
            ...(hasChanges
              ? [{ key: 'changes', label: COPY.changes, run: () => setChangesOpen(true) }]
              : []),
            {
              key: 'usage',
              label: COPY.planUsage,
              run: () => go('/(app)/settings/cloud-usage'),
            },
            { key: 'device', label: COPY.device, run: () => go('/(app)/companion') },
          ],
        }}
      />
      <CodeSessionChangesSheet
        visible={changesOpen}
        thread={thread}
        onClose={() => setChangesOpen(false)}
      />

      <View style={{ flex: 1 }}>
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
        >
          {thread.transcript?.hasEarlier && earliest !== undefined ? (
            <PressableBox
              onPress={() => void requestCodeTranscript(rootId, threadId, earliest)}
              accessibilityRole="button"
              style={{ minHeight: 44, alignSelf: 'center', justifyContent: 'center' }}
            >
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: typeScale.footnote,
                  fontWeight: '600',
                }}
              >
                {COPY.loadEarlier}
              </Text>
            </PressableBox>
          ) : null}

          {timeline.map((item) => (
            <TimelineRow key={item.key} item={item} />
          ))}

          {thread.hostMessage ? (
            <Text
              accessibilityRole="alert"
              selectable
              style={{ color: colors.agentError, fontSize: typeScale.footnote, lineHeight: 19 }}
            >
              {thread.hostMessage}
            </Text>
          ) : null}

          {running && !waiting ? <CloudCodeWorkingRow label={codeWorkingLabel(thread)} /> : null}

          {orderedApprovals.map((approval) => (
            <CodeApprovalCard
              key={approval.requestId}
              approval={approval}
              hold={thread.approvalHolds[approval.requestId]}
              focused={approval.requestId === focusApprovalId}
              onAnswer={(approved) =>
                void answerCodeApproval(
                  rootId,
                  threadId,
                  approval.turnId,
                  approval.requestId,
                  approved,
                )
              }
            />
          ))}

          {thread.pendingQuestions.map((question) => (
            <CodeQuestionCard
              key={question.requestId}
              question={question}
              hold={thread.approvalHolds[question.requestId]}
              onAnswer={(answer) =>
                answerCodeQuestion(rootId, threadId, question.turnId, question.requestId, answer)
              }
            />
          ))}
        </ScrollView>

        {awayFromLatest ? (
          <PressableBox
            onPress={jumpToLatest}
            accessibilityRole="button"
            accessibilityLabel={COPY.jumpToLatest}
            style={{
              position: 'absolute',
              bottom: 12,
              alignSelf: 'center',
              width: 40,
              height: 40,
              borderRadius: radii.full,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surfaceElevated,
            }}
          >
            <ArrowDown size={18} color={colors.textPrimary} />
          </PressableBox>
        ) : null}
      </View>

      <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6, gap: 6 }}>
        {hasChanges ? (
          <PressableBox
            onPress={() => setChangesOpen(true)}
            testID="remote-code-changes-pill"
            accessibilityRole="button"
            accessibilityLabel={
              changedFiles > 0
                ? `${cloudCodeFileCountLabel(changedFiles)} changed. ${cloudCodeChangeCountsLabel(diffCounts)}`
                : COPY.tests
            }
            style={{
              minHeight: 36,
              alignSelf: 'center',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingHorizontal: 14,
              borderRadius: radii.full,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surfaceElevated,
            }}
          >
            {changedFiles > 0 ? (
              <>
                <Text style={{ color: colors.textSecondary, fontSize: typeScale.subhead }}>
                  {cloudCodeFileCountLabel(changedFiles)}
                </Text>
                {thread.diffs.length > 0 ? <CloudCodeLineCountsText counts={diffCounts} /> : null}
              </>
            ) : null}
            {lastRun ? (
              <Text
                style={{
                  color: lastRun.status === 'passed' ? colors.agentSuccess : colors.agentError,
                  fontSize: typeScale.subhead,
                }}
              >
                {lastRun.status === 'passed' ? 'Tests passed' : 'Tests failed'}
              </Text>
            ) : null}
          </PressableBox>
        ) : null}
        <SessionComposerField
          value={draft}
          placeholder={
            running ? (steer ? COPY.steerPlaceholder : COPY.queuePlaceholder) : COPY.placeholder
          }
          inputLabel={COPY.inputLabel}
          primaryState={stopInSendSlot ? 'streaming' : 'idle'}
          primaryDisabled={stopInSendSlot ? false : !canSend}
          primaryLabel={stopInSendSlot ? COPY.stop : running && !steer ? COPY.queue : COPY.send}
          maxLength={REMOTE_CODE_LIMITS.guidanceLength}
          onChangeText={setDraft}
          onPrimary={stopInSendSlot ? handleStop : () => void handleSend()}
        />
        {sendError ? (
          <Text
            accessibilityRole="alert"
            style={{
              color: colors.agentError,
              fontSize: typeScale.footnote,
              paddingHorizontal: 16,
            }}
          >
            {sendError}
          </Text>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}
