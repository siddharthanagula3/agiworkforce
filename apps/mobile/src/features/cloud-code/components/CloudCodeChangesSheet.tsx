import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import {
  ArrowRight,
  Check,
  ChevronRight,
  ExternalLink,
  GitBranch,
  RefreshCw,
  Undo2,
  X,
} from 'lucide-react-native';
import type { CloudCodePullRequestStatus } from '@agiworkforce/cloud-contracts';
import {
  cloudCodePullRequestLabel,
  cloudCodeRepositoryLabel,
  type CloudCodeSession,
  type CloudCodeTerminalEntry,
} from '@agiworkforce/types';
import { Button } from '@/components/ui/button';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import { radii, useThemeColors } from '@/src/ui/theme';
import { dialogPadding, typeScale } from '@/src/ui/theme/tokens';
import {
  CLOUD_CODE_CHANGES_COPY as COPY,
  CLOUD_CODE_CHANGE_STATE_LABELS,
  CLOUD_CODE_COMMAND_LIMIT,
  CLOUD_CODE_COMMIT_MESSAGE_LIMIT,
  cloudCodeCommitChosenLabel,
  cloudCodeDiffByPath,
  cloudCodeDiffLineKind,
} from '../presentation';
import type { CloudCodeChangesView } from '../useCloudCodeChanges';

const ICON_SIZE = 16;
const EXIT_CODE_OK = 0;
const CHECKS_POLL_MS = 30_000;

const CHECKS_LABEL: Record<CloudCodePullRequestStatus['checksState'], string> = {
  passing: COPY.checksPassing,
  failing: COPY.checksFailing,
  pending: COPY.checksPending,
  none: COPY.checksNone,
};

function pullRequestOutcome(status: CloudCodePullRequestStatus): string | null {
  if (status.merged) return COPY.pullRequestMerged;
  if (status.state === 'closed') return COPY.pullRequestClosed;
  if (status.reviewState === 'approved') return COPY.reviewApproved;
  if (status.reviewState === 'changes_requested') return COPY.reviewChangesRequested;
  return null;
}

function IconButton({
  label,
  disabled,
  onPress,
  children,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={{
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </Pressable>
  );
}

function DiffBody({ body }: { body: string }) {
  const colors = useThemeColors();
  const tone = {
    added: colors.agentSuccess,
    removed: colors.agentError,
    meta: colors.textMuted,
    context: colors.textSecondary,
  } as const;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ borderRadius: radii.md, backgroundColor: colors.surfaceHover }}
      contentContainerStyle={{ padding: 10 }}
    >
      <View>
        {body.split('\n').map((line, index) => (
          <Text
            key={`${index}:${line}`}
            variant="mono"
            selectable
            style={{
              color: tone[cloudCodeDiffLineKind(line)],
              fontSize: typeScale.caption,
              lineHeight: 17,
            }}
          >
            {line || ' '}
          </Text>
        ))}
      </View>
    </ScrollView>
  );
}

function ChangedFile({
  path,
  state,
  body,
  included,
  busy,
  onIncludedChange,
  onDiscard,
}: {
  path: string;
  state: string;
  body: string | undefined;
  included: boolean;
  busy: boolean;
  onIncludedChange: (included: boolean) => void;
  onDiscard: () => void;
}) {
  const colors = useThemeColors();
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Pressable
          onPress={() => onIncludedChange(!included)}
          disabled={busy}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: included, disabled: busy }}
          accessibilityLabel={`${COPY.includeFile} ${path}`}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <View
            style={{
              width: 20,
              height: 20,
              borderRadius: 5,
              borderWidth: 1,
              borderColor: included ? colors.textPrimary : colors.border,
              backgroundColor: included ? colors.textPrimary : undefined,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {included ? <Check size={14} color={colors.accentText} /> : null}
          </View>
        </Pressable>
        <Pressable
          onPress={() => setExpanded((open) => !open)}
          disabled={!body}
          accessibilityRole="button"
          accessibilityState={{ expanded, disabled: !body }}
          accessibilityLabel={`${state} ${path}`}
          style={{ flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }}
        >
          <Text style={{ color: colors.textMuted, fontSize: typeScale.caption, width: 72 }}>
            {state}
          </Text>
          <Text
            variant="mono"
            numberOfLines={1}
            ellipsizeMode="middle"
            style={{ flex: 1, color: colors.textPrimary, fontSize: typeScale.footnote }}
          >
            {path}
          </Text>
          {body ? (
            <View style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }}>
              <ChevronRight size={14} color={colors.textMuted} />
            </View>
          ) : null}
        </Pressable>
        <IconButton label={`${COPY.discardFile} ${path}`} disabled={busy} onPress={onDiscard}>
          <Undo2 size={ICON_SIZE} color={colors.textSecondary} />
        </IconButton>
      </View>
      {body && expanded ? <DiffBody body={body} /> : null}
    </View>
  );
}

function PullRequestChecks({ load }: { load: () => Promise<CloudCodePullRequestStatus> }) {
  const colors = useThemeColors();
  const [status, setStatus] = useState<CloudCodePullRequestStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load()
      .then((next) => {
        if (cancelled) return;
        setStatus(next);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, load]);

  useEffect(() => {
    if (status?.checksState !== 'pending' || status.merged || status.state === 'closed') {
      return undefined;
    }
    const timer = setTimeout(() => setAttempt((value) => value + 1), CHECKS_POLL_MS);
    return () => clearTimeout(timer);
  }, [status]);

  const outcome = status ? pullRequestOutcome(status) : null;
  const parts = status
    ? [CHECKS_LABEL[status.checksState], outcome, status.failedChecks.join(', ') || null].filter(
        (part): part is string => Boolean(part),
      )
    : [];

  return (
    <View
      accessibilityLiveRegion="polite"
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
    >
      {loading && !status ? (
        <ActivityIndicator size="small" color={colors.textSecondary} />
      ) : (
        <Text
          style={{
            flex: 1,
            color: status?.checksState === 'failing' ? colors.agentError : colors.textSecondary,
            fontSize: typeScale.footnote,
            lineHeight: 19,
          }}
        >
          {failed && !status ? COPY.checksUnavailable : parts.join(' · ')}
        </Text>
      )}
      <IconButton
        label={COPY.checksRefresh}
        disabled={loading}
        onPress={() => setAttempt((value) => value + 1)}
      >
        <RefreshCw size={ICON_SIZE} color={colors.textSecondary} />
      </IconButton>
    </View>
  );
}

function SectionLabel({ children }: { children: string }) {
  const colors = useThemeColors();
  return (
    <Text
      accessibilityRole="header"
      style={{ color: colors.textSecondary, fontSize: typeScale.footnote }}
    >
      {children}
    </Text>
  );
}

export function CloudCodeChangesSheet({
  visible,
  session,
  entries,
  view,
  onClose,
}: {
  visible: boolean;
  session: CloudCodeSession;
  entries: CloudCodeTerminalEntry[];
  view: CloudCodeChangesView;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const [commitMessage, setCommitMessage] = useState('');
  const [command, setCommand] = useState('');
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(() => new Set());
  const { changes } = view;

  useEffect(() => {
    setExcluded(new Set());
  }, [session.id]);

  const hasRepository = Boolean(session.repositoryUrl);
  const closedOrArchived = session.state === 'closed' || session.archivedAt !== null;
  const committable = hasRepository && !closedOrArchived && session.state !== 'provisioning';
  const canRun = session.state === 'ready' && !closedOrArchived;
  const workingBranch = changes?.workingBranch ?? session.workingBranch;
  const base = session.baseBranch ?? changes?.base ?? session.repositoryBranch;
  const diffs = useMemo(() => cloudCodeDiffByPath(changes?.diff ?? ''), [changes?.diff]);
  const changedPaths = changes?.files.map((file) => file.path) ?? [];
  const includedPaths = changedPaths.filter((path) => !excluded.has(path));
  const choosingFiles = includedPaths.length < changedPaths.length;
  const nothingChosen = changedPaths.length > 0 && includedPaths.length === 0;
  const pullRequestBlocked = closedOrArchived
    ? COPY.pullRequestNeedsOpenSession
    : !hasRepository || !workingBranch
      ? COPY.pullRequestNeedsBranch
      : null;
  const pullRequestLabel = cloudCodePullRequestLabel(session);
  const busy = view.busy !== null;

  const setIncluded = (path: string, included: boolean) => {
    setExcluded((current) => {
      const next = new Set(current);
      if (included) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const requestDiscard = (path: string) => {
    Alert.alert(COPY.discardTitle, `${COPY.discardDescription} ${path}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: COPY.discardConfirm, style: 'destructive', onPress: () => view.discard([path]) },
    ]);
  };

  const submitCommit = async () => {
    const message = commitMessage.trim();
    if (!message || busy || nothingChosen) return;
    if (await view.commit(message, choosingFiles ? includedPaths : null)) setCommitMessage('');
  };

  const submitCommand = async () => {
    const next = command.trim();
    if (!next || busy || !canRun) return;
    if (await view.runCommand(next)) setCommand('');
  };

  const inputStyle = {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceElevated,
  } as const;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      accessibilityViewIsModal
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={{ flex: 1, backgroundColor: colors.surfaceBase, padding: dialogPadding }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 }}>
            <GitBranch size={ICON_SIZE} color={colors.textSecondary} />
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {hasRepository && workingBranch ? (
                <>
                  <Text
                    numberOfLines={1}
                    style={{ color: colors.textSecondary, fontSize: typeScale.footnote }}
                  >
                    {base ?? cloudCodeRepositoryLabel(session.repositoryUrl ?? '')}
                  </Text>
                  <ArrowRight size={14} color={colors.textMuted} />
                  <Text
                    variant="mono"
                    numberOfLines={1}
                    style={{
                      flexShrink: 1,
                      color: colors.textPrimary,
                      fontSize: typeScale.footnote,
                    }}
                  >
                    {workingBranch}
                  </Text>
                </>
              ) : (
                <Text
                  accessibilityRole="header"
                  style={{
                    color: colors.textPrimary,
                    fontSize: typeScale.headline,
                    fontWeight: '600',
                  }}
                >
                  {COPY.heading}
                </Text>
              )}
            </View>
            <IconButton
              label={COPY.refresh}
              disabled={view.loading || !hasRepository}
              onPress={view.refresh}
            >
              <RefreshCw size={ICON_SIZE} color={colors.textSecondary} />
            </IconButton>
            <IconButton label={COPY.close} onPress={onClose}>
              <X size={18} color={colors.textMuted} />
            </IconButton>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: 18, paddingBottom: 32 }}
          >
            {view.error ? (
              <Pressable
                onPress={view.dismissError}
                accessibilityRole="alert"
                accessibilityLabel={view.error}
              >
                <Text
                  selectable
                  style={{ color: colors.agentError, fontSize: typeScale.footnote, lineHeight: 19 }}
                >
                  {view.error}
                </Text>
              </Pressable>
            ) : null}

            {!hasRepository ? (
              <Text style={{ color: colors.textMuted, fontSize: typeScale.subhead }}>
                {COPY.noRepository}
              </Text>
            ) : view.loading && !changes ? (
              <View accessibilityLabel={COPY.loading} style={{ paddingVertical: 24 }}>
                <ActivityIndicator color={colors.textSecondary} />
              </View>
            ) : changes && changes.files.length === 0 ? (
              <Text style={{ color: colors.textMuted, fontSize: typeScale.subhead }}>
                {COPY.none}
              </Text>
            ) : changes ? (
              <View>
                {changes.files.map((file) => (
                  <ChangedFile
                    key={file.path}
                    path={file.path}
                    state={CLOUD_CODE_CHANGE_STATE_LABELS[file.state]}
                    body={diffs.get(file.path)}
                    included={!excluded.has(file.path)}
                    busy={busy || !committable}
                    onIncludedChange={(included) => setIncluded(file.path, included)}
                    onDiscard={() => requestDiscard(file.path)}
                  />
                ))}
                {changes.diffTruncated ? (
                  <Text
                    style={{ color: colors.textMuted, fontSize: typeScale.caption, marginTop: 6 }}
                  >
                    {COPY.diffTruncated}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {committable ? (
              <View style={{ gap: 6 }}>
                <SectionLabel>{COPY.commitLabel}</SectionLabel>
                <TextInput
                  value={commitMessage}
                  onChangeText={setCommitMessage}
                  maxLength={CLOUD_CODE_COMMIT_MESSAGE_LIMIT}
                  editable={!busy}
                  accessibilityLabel={COPY.commitLabel}
                  style={{ ...inputStyle, flex: undefined }}
                />
                {choosingFiles ? (
                  <Text style={{ color: colors.textMuted, fontSize: typeScale.caption }}>
                    {nothingChosen
                      ? COPY.commitNoFilesChosen
                      : cloudCodeCommitChosenLabel(includedPaths.length, changedPaths.length)}
                  </Text>
                ) : null}
                {view.notice ? (
                  <Text
                    accessibilityLiveRegion="polite"
                    style={{ color: colors.textSecondary, fontSize: typeScale.caption }}
                  >
                    {view.notice}
                  </Text>
                ) : null}
                <Button
                  title={COPY.commitAction}
                  variant="outline"
                  loading={view.busy === 'commit'}
                  disabled={busy || !commitMessage.trim() || nothingChosen}
                  onPress={() => void submitCommit()}
                />
              </View>
            ) : null}

            {hasRepository ? (
              <View style={{ gap: 8 }}>
                {session.pullRequestUrl && pullRequestLabel ? (
                  <>
                    <Pressable
                      onPress={() =>
                        void openUntrustedUrlInAppBrowser(session.pullRequestUrl ?? '')
                      }
                      accessibilityRole="link"
                      accessibilityLabel={pullRequestLabel}
                      style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 }}
                    >
                      <ExternalLink size={14} color={colors.textSecondary} />
                      <Text
                        style={{
                          color: colors.textPrimary,
                          fontSize: typeScale.subhead,
                          fontWeight: '600',
                        }}
                      >
                        {pullRequestLabel}
                      </Text>
                    </Pressable>
                    <PullRequestChecks load={view.loadPullRequestStatus} />
                  </>
                ) : (
                  <>
                    <Button
                      title={
                        view.busy === 'pull-request'
                          ? COPY.creatingPullRequest
                          : COPY.createPullRequest
                      }
                      variant="outline"
                      loading={view.busy === 'pull-request'}
                      disabled={pullRequestBlocked !== null || busy}
                      onPress={view.createPullRequest}
                    />
                    {pullRequestBlocked ? (
                      <Text style={{ color: colors.textMuted, fontSize: typeScale.caption }}>
                        {pullRequestBlocked}
                      </Text>
                    ) : null}
                  </>
                )}
              </View>
            ) : null}

            <View style={{ gap: 8 }}>
              <SectionLabel>{COPY.terminal}</SectionLabel>
              {entries.length === 0 ? (
                <Text style={{ color: colors.textMuted, fontSize: typeScale.footnote }}>
                  {COPY.terminalEmpty}
                </Text>
              ) : (
                entries.map((entry) => {
                  const failed = entry.exitCode !== EXIT_CODE_OK;
                  return (
                    <View
                      key={entry.id}
                      style={{
                        gap: 4,
                        borderRadius: radii.md,
                        padding: 10,
                        backgroundColor: colors.surfaceHover,
                      }}
                    >
                      <Text
                        variant="mono"
                        selectable
                        style={{ color: colors.textPrimary, fontSize: typeScale.caption }}
                      >{`$ ${entry.command}`}</Text>
                      {entry.stdout ? (
                        <Text
                          variant="mono"
                          selectable
                          style={{ color: colors.textSecondary, fontSize: typeScale.caption }}
                        >
                          {entry.stdout}
                        </Text>
                      ) : null}
                      {entry.stderr ? (
                        <Text
                          variant="mono"
                          selectable
                          style={{ color: colors.agentError, fontSize: typeScale.caption }}
                        >
                          {entry.stderr}
                        </Text>
                      ) : null}
                      <Text
                        variant="mono"
                        style={{
                          color: failed ? colors.agentError : colors.textMuted,
                          fontSize: typeScale.caption,
                        }}
                      >
                        {`exit ${entry.exitCode}`}
                      </Text>
                    </View>
                  );
                })
              )}
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <TextInput
                  value={command}
                  onChangeText={setCommand}
                  placeholder={COPY.commandPlaceholder}
                  placeholderTextColor={colors.textMuted}
                  maxLength={CLOUD_CODE_COMMAND_LIMIT}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={canRun && !busy}
                  accessibilityLabel={COPY.commandLabel}
                  onSubmitEditing={() => void submitCommand()}
                  style={inputStyle}
                />
                <Button
                  title={COPY.commandRun}
                  variant="outline"
                  loading={view.busy === 'command'}
                  disabled={!canRun || busy || !command.trim()}
                  onPress={() => void submitCommand()}
                />
              </View>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
