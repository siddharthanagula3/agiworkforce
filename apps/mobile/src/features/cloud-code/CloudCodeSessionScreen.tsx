import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, ExternalLink, X } from 'lucide-react-native';
import {
  CLOUD_CODE_SESSION_COPY,
  CLOUD_CODE_SESSION_STATE_LABELS,
  CLOUD_CODE_SESSION_STATUS_FILTER_LABELS,
  cloudCodePullRequestLabel,
  resolveCloudCodeAgentModel,
  type CloudCodeSession,
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
import { CloudCodeApprovalCard } from './components/CloudCodeApprovalCard';
import { CloudCodeComposer } from './components/CloudCodeComposer';
import { CloudCodeGate } from './components/CloudCodeGate';
import {
  CloudCodeTaskBubble,
  CloudCodeTranscript,
  CloudCodeWorkingRow,
} from './components/CloudCodeTranscript';
import {
  CLOUD_CODE_SCREEN_TITLE,
  CLOUD_CODE_STATE_BADGE_COLORS,
  cloudCodeWorkspaceLabel,
} from './presentation';
import { useCloudCodeAccess } from './useCloudCodeAccess';
import { useCloudCodeSession } from './useCloudCodeSession';

const STICK_TO_BOTTOM_DISTANCE = 80;
const CLOSED_NOTE =
  'This session is closed, so it cannot run tasks. Its transcript stays readable.';
const MISSING_NOTE = 'That session is not available. It may have been deleted.';

function Header({ session, onBack }: { session: CloudCodeSession | null; onBack: () => void }) {
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
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={8}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        <ArrowLeft size={20} color={colors.textSecondary} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text
          numberOfLines={1}
          accessibilityRole="header"
          style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '600' }}
        >
          {session?.title ?? CLOUD_CODE_SCREEN_TITLE}
        </Text>
        {workspace ? (
          <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 12 }}>
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
          fontSize: 13,
          lineHeight: 19,
        }}
      >
        {message}
      </Text>
      {onDismiss ? (
        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <X size={16} color={colors.textSecondary} />
        </Pressable>
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

function SessionView({ sessionId, onBack }: { sessionId: string; onBack: () => void }) {
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
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const nearBottom = useRef(true);

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
    const sent = await send(goal);
    if (!sent) setDraft((current) => (current.trim() ? current : goal));
  }, [draft, send]);

  const session = view.session;
  const pullRequestLabel = session ? cloudCodePullRequestLabel(session) : null;
  const pullRequestUrl = session?.pullRequestUrl ?? null;
  const archived = session?.archivedAt != null;
  const closed = session?.state === 'closed';
  const failedMessage = session?.state === 'failed' ? session.lastError : null;
  const noticeMessage = view.actionError ?? view.loadError;

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
              fontSize: 15,
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
        <Header session={session} onBack={onBack} />

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
            <Pressable
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
              <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600' }}>
                {pullRequestLabel}
              </Text>
            </Pressable>
          ) : null}

          {failedMessage ? (
            <Text selectable style={{ color: colors.agentError, fontSize: 13, lineHeight: 19 }}>
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
            modelName={getManagedDisplayName(agentModel)}
            onChangeText={setDraft}
            onSend={() => void handleSend()}
            onStop={view.stop}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function CloudCodeSessionScreen({ sessionId }: { sessionId: string }) {
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
      onBack={handleBack}
    />
  );
}
