import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { Check, Lock, X } from 'lucide-react-native';
import type { CloudCodeBranch, CloudCodeRepository } from '@agiworkforce/cloud-contracts';
import {
  CLOUD_CODE_LIMITS,
  type CloudCodeAvailability,
  type CloudCodeNetworkAccess,
  type CloudCodeRuntime,
  type CloudCodeSession,
} from '@agiworkforce/types';
import { Button } from '@/components/ui/button';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { dialogPadding, useThemeColors } from '@/src/ui/theme';
import { cloudCodeApi, describeCloudCodeError, newCloudCodeIdempotencyKey } from '../service';
import { useRouter } from 'expo-router';
import { startGitHubInstallInApp } from '../githubInstall';
import { typeScale } from '@/src/ui/theme/tokens';

export const NEW_CLOUD_CODE_SESSION_ERROR = 'The session could not be started';
const GITHUB_CONNECT_FAILED = 'GitHub could not be connected';
const TITLE_WORDS = 6;
const SEARCH_DEBOUNCE_MS = 300;
const GIGABYTE_MB = 1024;

const NETWORK_OPTIONS: ReadonlyArray<{
  id: CloudCodeNetworkAccess;
  label: string;
  description: string;
}> = [
  { id: 'none', label: 'Isolated', description: 'Commands cannot reach the internet.' },
  {
    id: 'trusted',
    label: 'Trusted hosts',
    description: 'Package registries and code hosts only. Required to clone a repository.',
  },
  {
    id: 'full',
    label: 'Full internet',
    description: 'Unrestricted outbound access from this isolated environment.',
  },
];

const COPY = Object.freeze({
  fullNetworkAcknowledgement:
    'I understand commands in this session can contact any internet host. The environment stays isolated and receives no AGI Workforce credentials.',
  extraHostsLabel: 'Extra allowed hosts',
  extraHostsPlaceholder: 'registry.example.com, *.internal.example.com',
  extraHostsHelp: 'Comma separated, one leading wildcard allowed, up to 10 hosts.',
  runtimeHeading: 'Coding harness',
  defaultRuntime: 'No agent, Python 3, Node.js, git, curl, build-essential, GitHub CLI',
  runtimeFixed: 'This cannot be changed after the session is created.',
  needsKey: 'needs your own API key',
  firstRunHeading: 'Two steps to work in your repository',
  firstRunConnect: 'Connect your GitHub account and install the GitHub app',
  firstRunCopy: 'Choose which repositories the environment may clone and push.',
  firstRunAction: 'Connect GitHub',
  repositoryTruncated: 'More repositories exist. Search to narrow the list.',
  repositoryUnreachable: 'These installations could not be read:',
  repositoryUrlToggle: 'Use a public repository URL',
  repositoryUrlHide: 'Choose from GitHub instead',
  repositoryUrlLabel: 'Repository URL',
  branchHeading: 'Branch',
  branchLoading: 'Loading branches',
  branchLoadFailed: 'Branches could not be loaded.',
  branchTruncated: 'Some branches are not listed. Type the full name to use one.',
  branchSearchPlaceholder: 'Search or type a branch name',
  branchUseTyped: 'Use branch',
  branchProtected: 'Protected',
  deploymentDisabled:
    'Managed environments are not enabled on this deployment. Existing sessions stay readable.',
  storageNotReady: 'Managed environments are not available yet. Existing sessions stay readable.',
  planNotEntitled: 'Your plan does not include managed environments.',
  retry: 'Try again',
});

type RepositoryState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'no-installation' }
  | {
      status: 'ready';
      repositories: CloudCodeRepository[];
      truncated: boolean;
      unreachable: string[];
    };

type BranchState =
  | { status: 'idle' | 'loading' | 'error' }
  | { status: 'ready'; branches: CloudCodeBranch[]; truncated: boolean };

export function titleFromTask(task: string): string {
  const words = task.trim().split(/\s+/).slice(0, TITLE_WORDS).join(' ');
  return (words || 'AGI Code').slice(0, CLOUD_CODE_LIMITS.title);
}

export function unavailableReason(availability: CloudCodeAvailability | null): string | null {
  if (!availability) return null;
  if (!availability.deploymentEnabled) return COPY.deploymentDisabled;
  if (!availability.storageReady) return COPY.storageNotReady;
  if (!availability.planEntitled) return COPY.planNotEntitled;
  return null;
}

function describeRuntime(runtime: CloudCodeRuntime): string {
  const cores = runtime.cpuCount > 0 ? `${runtime.cpuCount} vCPU` : null;
  const memory =
    runtime.memoryMB > 0 ? `${Math.round(runtime.memoryMB / GIGABYTE_MB)} GB RAM` : null;
  const detail = [runtime.summary, [cores, memory].filter(Boolean).join(', ')]
    .filter(Boolean)
    .join(' · ');
  const label = detail ? `${runtime.name}, ${detail}` : runtime.name;
  return runtime.needsUserCredential ? `${label}, ${COPY.needsKey}` : label;
}

function parseExtraHosts(value: string): string[] {
  return value
    .split(',')
    .map((host) => host.trim())
    .filter((host) => host.length > 0);
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const colors = useThemeColors();
  return (
    <View style={{ gap: 6 }}>
      <Text
        accessibilityRole="header"
        style={{ color: colors.textSecondary, fontSize: typeScale.footnote }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

function Choice({
  label,
  description,
  selected,
  disabled,
  trailing,
  testID,
  onPress,
}: {
  label: string;
  description?: string;
  selected: boolean;
  disabled?: boolean;
  trailing?: ReactNode;
  testID?: string;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled: Boolean(disabled) }}
      accessibilityLabel={description ? `${label}. ${description}` : label}
      testID={testID}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: description ? 52 : 44,
        gap: 8,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.textPrimary, fontSize: typeScale.body }}>{label}</Text>
        {description ? (
          <Text style={{ color: colors.textMuted, fontSize: typeScale.footnote }}>
            {description}
          </Text>
        ) : null}
      </View>
      {trailing}
      {selected ? <Check size={16} color={colors.textPrimary} /> : null}
    </Pressable>
  );
}

function Note({ children, tone = 'muted' }: { children: string; tone?: 'muted' | 'error' }) {
  const colors = useThemeColors();
  return (
    <Text
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
      style={{
        color: tone === 'error' ? colors.agentError : colors.textMuted,
        fontSize: typeScale.footnote,
      }}
    >
      {children}
    </Text>
  );
}

interface NewCloudCodeSessionSheetProps {
  visible: boolean;
  availability?: CloudCodeAvailability | null;
  runtimes?: CloudCodeRuntime[];
  onClose: () => void;
  onCreated: (session: CloudCodeSession, goal: string) => void;
}

export function NewCloudCodeSessionSheet({
  visible,
  availability = null,
  runtimes = [],
  onClose,
  onCreated,
}: NewCloudCodeSessionSheetProps) {
  const colors = useThemeColors();
  const [task, setTask] = useState('');
  const [search, setSearch] = useState('');
  const [repositoryState, setRepositoryState] = useState<RepositoryState>({ status: 'loading' });
  const [repositoryAttempt, setRepositoryAttempt] = useState(0);
  const [repository, setRepository] = useState<CloudCodeRepository | null>(null);
  const [urlMode, setUrlMode] = useState(false);
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [branch, setBranch] = useState('');
  const [branchSearch, setBranchSearch] = useState('');
  const [branchState, setBranchState] = useState<BranchState>({ status: 'idle' });
  const [branchAttempt, setBranchAttempt] = useState(0);
  const [networkAccess, setNetworkAccess] = useState<CloudCodeNetworkAccess>('trusted');
  const [fullAccepted, setFullAccepted] = useState(false);
  const [extraHosts, setExtraHosts] = useState('');
  const [runtimeId, setRuntimeId] = useState('');
  const [creating, setCreating] = useState(false);
  const router = useRouter();
  const [connectingGitHub, setConnectingGitHub] = useState(false);
  const [gitHubNotice, setGitHubNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searchRequest = useRef(0);
  const creatingRef = useRef(false);

  useEffect(() => {
    if (!visible || urlMode) return undefined;
    const request = ++searchRequest.current;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setRepositoryState((current) =>
        current.status === 'ready' ? current : { status: 'loading' },
      );
      cloudCodeApi
        .listRepositories(search.trim() || undefined, controller.signal)
        .then((list) => {
          if (request !== searchRequest.current) return;
          setRepositoryState(
            list.installationCount === 0
              ? { status: 'no-installation' }
              : {
                  status: 'ready',
                  repositories: list.repositories,
                  truncated: list.truncated,
                  unreachable: list.unreachable.map((entry) => entry.accountLogin),
                },
          );
        })
        .catch((loadError: unknown) => {
          if (request !== searchRequest.current || controller.signal.aborted) return;
          setRepositoryState({
            status: 'error',
            message: describeCloudCodeError(loadError, 'Repositories could not be loaded'),
          });
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [repositoryAttempt, search, urlMode, visible]);

  useEffect(() => {
    if (!visible || !repository) {
      setBranchState({ status: 'idle' });
      return undefined;
    }
    const controller = new AbortController();
    let cancelled = false;
    setBranchState({ status: 'loading' });
    cloudCodeApi
      .listBranches(
        { installationId: repository.installationId, fullName: repository.fullName },
        controller.signal,
      )
      .then((body) => {
        if (!cancelled) {
          setBranchState({ status: 'ready', branches: body.branches, truncated: body.truncated });
        }
      })
      .catch(() => {
        if (!cancelled && !controller.signal.aborted) setBranchState({ status: 'error' });
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [branchAttempt, repository, visible]);

  const chooseRepository = useCallback((next: CloudCodeRepository | null) => {
    setRepository(next);
    setBranch('');
    setBranchSearch('');
    if (next) setNetworkAccess((current) => (current === 'none' ? 'trusted' : current));
  }, []);

  const reset = useCallback(() => {
    setTask('');
    setSearch('');
    setRepository(null);
    setUrlMode(false);
    setRepositoryUrl('');
    setBranch('');
    setBranchSearch('');
    setNetworkAccess('trusted');
    setFullAccepted(false);
    setExtraHosts('');
    setRuntimeId('');
    setError(null);
  }, []);

  const goal = task.trim();
  const blocked = unavailableReason(availability);
  const clonesRepository = repository !== null || (urlMode && repositoryUrl.trim().length > 0);
  const canCreate =
    goal.length > 0 &&
    !creating &&
    blocked === null &&
    (networkAccess !== 'full' || fullAccepted) &&
    !(clonesRepository && networkAccess === 'none');

  const handleConnectGitHub = useCallback(async () => {
    setConnectingGitHub(true);
    setGitHubNotice(null);
    try {
      const started = await startGitHubInstallInApp();
      if (started.kind === 'returned') {
        onClose();
        router.push({ pathname: '/(app)/github/installed', params: started.result });
      } else if (started.kind === 'opened') {
        onClose();
      } else if (started.kind === 'failed') {
        setGitHubNotice(GITHUB_CONNECT_FAILED);
      }
    } catch (connectError: unknown) {
      setGitHubNotice(describeCloudCodeError(connectError, GITHUB_CONNECT_FAILED));
    } finally {
      setConnectingGitHub(false);
    }
  }, [onClose, router]);

  const handleCreate = useCallback(async () => {
    if (!canCreate || creatingRef.current) return;
    creatingRef.current = true;
    setCreating(true);
    setError(null);
    const hosts = networkAccess === 'full' ? [] : parseExtraHosts(extraHosts);
    try {
      const body = await cloudCodeApi.create({
        requestId: newCloudCodeIdempotencyKey(),
        title: titleFromTask(goal),
        repository: repository
          ? {
              installationId: repository.installationId,
              fullName: repository.fullName,
              branch: branch.trim() || null,
            }
          : null,
        ...(urlMode && !repository && repositoryUrl.trim()
          ? { repositoryUrl: repositoryUrl.trim(), repositoryBranch: branch.trim() || null }
          : {}),
        networkAccess,
        ...(networkAccess === 'full' ? { fullNetworkAcknowledged: fullAccepted } : {}),
        ...(runtimeId ? { runtimeId } : {}),
        ...(hosts.length > 0 ? { extraHosts: hosts } : {}),
      });
      reset();
      onCreated(body.session, goal);
    } catch (createError) {
      setError(describeCloudCodeError(createError, NEW_CLOUD_CODE_SESSION_ERROR));
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  }, [
    branch,
    canCreate,
    extraHosts,
    fullAccepted,
    goal,
    networkAccess,
    onCreated,
    repository,
    repositoryUrl,
    reset,
    runtimeId,
    urlMode,
  ]);

  const inputStyle = {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceElevated,
  } as const;

  const branchNeedle = branchSearch.trim();
  const branchMatches =
    branchState.status === 'ready'
      ? branchState.branches.filter((candidate) =>
          candidate.name.toLowerCase().includes(branchNeedle.toLowerCase()),
        )
      : [];
  const typedIsListed = branchMatches.some((candidate) => candidate.name === branchNeedle);
  const harnesses = runtimes.filter((runtime) => runtime.kind === 'harness');
  const images = runtimes.filter((runtime) => runtime.kind === 'image');

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
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <Text
              accessibilityRole="header"
              style={{
                flex: 1,
                color: colors.textPrimary,
                fontSize: typeScale.headline,
                fontWeight: '600',
              }}
            >
              New cloud session
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close new session"
              style={{
                minWidth: 44,
                minHeight: 44,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={18} color={colors.textMuted} />
            </Pressable>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: 18, paddingBottom: 32 }}
          >
            {blocked ? <Note tone="error">{blocked}</Note> : null}

            <Section title="Task">
              <TextInput
                value={task}
                onChangeText={setTask}
                placeholder="Describe what to build or fix"
                placeholderTextColor={colors.textMuted}
                multiline
                maxLength={CLOUD_CODE_LIMITS.task}
                accessibilityLabel="Task"
                testID="new-cloud-code-task"
                style={{ ...inputStyle, minHeight: 96, paddingTop: 10, textAlignVertical: 'top' }}
              />
            </Section>

            <Section title="Repository">
              {urlMode ? (
                <TextInput
                  value={repositoryUrl}
                  onChangeText={setRepositoryUrl}
                  placeholder="https://github.com/owner/repository"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  accessibilityLabel={COPY.repositoryUrlLabel}
                  style={inputStyle}
                />
              ) : repositoryState.status === 'no-installation' ? (
                <View style={{ gap: 6 }}>
                  <Text
                    style={{
                      color: colors.textPrimary,
                      fontSize: typeScale.body,
                      fontWeight: '600',
                    }}
                  >
                    {COPY.firstRunHeading}
                  </Text>
                  <Note>{`${COPY.firstRunConnect}. ${COPY.firstRunCopy}`}</Note>
                  <Button
                    title={COPY.firstRunAction}
                    variant="outline"
                    loading={connectingGitHub}
                    disabled={connectingGitHub}
                    onPress={() => void handleConnectGitHub()}
                  />
                  {gitHubNotice ? <Note tone="error">{gitHubNotice}</Note> : null}
                </View>
              ) : repositoryState.status === 'error' ? (
                <View style={{ gap: 6 }}>
                  <Note tone="error">{repositoryState.message}</Note>
                  <Button
                    title={COPY.retry}
                    variant="outline"
                    onPress={() => setRepositoryAttempt((value) => value + 1)}
                  />
                </View>
              ) : (
                <>
                  <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search repositories"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    accessibilityLabel="Search repositories"
                    style={inputStyle}
                  />
                  <View accessibilityRole="radiogroup">
                    {[
                      null,
                      ...(repositoryState.status === 'ready' ? repositoryState.repositories : []),
                    ].map((entry) => (
                      <Choice
                        key={entry ? `${entry.installationId}:${entry.fullName}` : 'none'}
                        label={entry ? entry.fullName : 'No repository'}
                        selected={(entry?.fullName ?? null) === (repository?.fullName ?? null)}
                        trailing={
                          entry?.isPrivate ? (
                            <Lock size={14} color={colors.textMuted} accessibilityLabel="Private" />
                          ) : null
                        }
                        testID={
                          entry
                            ? `new-cloud-code-repo-${entry.fullName}`
                            : 'new-cloud-code-repo-none'
                        }
                        onPress={() => chooseRepository(entry)}
                      />
                    ))}
                  </View>
                  {repositoryState.status === 'loading' ? (
                    <ActivityIndicator color={colors.textMuted} />
                  ) : null}
                  {repositoryState.status === 'ready' && repositoryState.truncated ? (
                    <Note>{COPY.repositoryTruncated}</Note>
                  ) : null}
                  {repositoryState.status === 'ready' && repositoryState.unreachable.length > 0 ? (
                    <Note>{`${COPY.repositoryUnreachable} ${repositoryState.unreachable.join(', ')}`}</Note>
                  ) : null}
                </>
              )}
              <Pressable
                onPress={() => {
                  chooseRepository(null);
                  setUrlMode((current) => !current);
                }}
                accessibilityRole="button"
                style={{ minHeight: 44, justifyContent: 'center' }}
              >
                <Text
                  style={{
                    color: colors.textPrimary,
                    fontSize: typeScale.subhead,
                    fontWeight: '600',
                  }}
                >
                  {urlMode ? COPY.repositoryUrlHide : COPY.repositoryUrlToggle}
                </Text>
              </Pressable>
            </Section>

            {repository || (urlMode && repositoryUrl.trim()) ? (
              <Section title={COPY.branchHeading}>
                {urlMode ? (
                  <TextInput
                    value={branch}
                    onChangeText={setBranch}
                    placeholder="Leave empty for the default branch"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    accessibilityLabel={COPY.branchHeading}
                    style={inputStyle}
                  />
                ) : (
                  <>
                    <TextInput
                      value={branchSearch}
                      onChangeText={setBranchSearch}
                      placeholder={COPY.branchSearchPlaceholder}
                      placeholderTextColor={colors.textMuted}
                      autoCapitalize="none"
                      autoCorrect={false}
                      accessibilityLabel={COPY.branchSearchPlaceholder}
                      style={inputStyle}
                    />
                    {branchState.status === 'loading' ? (
                      <ActivityIndicator
                        color={colors.textMuted}
                        accessibilityLabel={COPY.branchLoading}
                      />
                    ) : null}
                    {branchState.status === 'error' ? (
                      <View style={{ gap: 6 }}>
                        <Note tone="error">{COPY.branchLoadFailed}</Note>
                        <Button
                          title={COPY.retry}
                          variant="outline"
                          onPress={() => setBranchAttempt((value) => value + 1)}
                        />
                      </View>
                    ) : null}
                    <View accessibilityRole="radiogroup">
                      <Choice
                        label={
                          repository?.defaultBranch
                            ? `Default (${repository.defaultBranch})`
                            : 'Default branch'
                        }
                        selected={branch === ''}
                        onPress={() => setBranch('')}
                      />
                      {branchMatches.map((candidate) => (
                        <Choice
                          key={candidate.name}
                          label={candidate.name}
                          selected={branch === candidate.name}
                          trailing={
                            candidate.isProtected ? (
                              <Text
                                style={{ color: colors.textMuted, fontSize: typeScale.caption }}
                              >
                                {COPY.branchProtected}
                              </Text>
                            ) : null
                          }
                          onPress={() => setBranch(candidate.name)}
                        />
                      ))}
                      {branchNeedle && !typedIsListed ? (
                        <Choice
                          label={`${COPY.branchUseTyped} ${branchNeedle}`}
                          selected={branch === branchNeedle}
                          onPress={() => setBranch(branchNeedle)}
                        />
                      ) : null}
                    </View>
                    {branchState.status === 'ready' && branchState.truncated ? (
                      <Note>{COPY.branchTruncated}</Note>
                    ) : null}
                  </>
                )}
              </Section>
            ) : null}

            <Section title="Network access">
              <View accessibilityRole="radiogroup">
                {NETWORK_OPTIONS.map((option) => (
                  <Choice
                    key={option.id}
                    label={option.label}
                    description={option.description}
                    selected={networkAccess === option.id}
                    disabled={clonesRepository && option.id === 'none'}
                    onPress={() => {
                      setNetworkAccess(option.id);
                      if (option.id !== 'full') setFullAccepted(false);
                    }}
                  />
                ))}
              </View>
              {networkAccess === 'full' ? (
                <Pressable
                  onPress={() => setFullAccepted((current) => !current)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: fullAccepted }}
                  accessibilityLabel={COPY.fullNetworkAcknowledgement}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}
                >
                  <View
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 5,
                      borderWidth: 1,
                      borderColor: fullAccepted ? colors.textPrimary : colors.border,
                      backgroundColor: fullAccepted ? colors.textPrimary : undefined,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {fullAccepted ? <Check size={14} color={colors.accentText} /> : null}
                  </View>
                  <Text
                    style={{ flex: 1, color: colors.textSecondary, fontSize: typeScale.footnote }}
                  >
                    {COPY.fullNetworkAcknowledgement}
                  </Text>
                </Pressable>
              ) : (
                <View style={{ gap: 4 }}>
                  <TextInput
                    value={extraHosts}
                    onChangeText={setExtraHosts}
                    placeholder={COPY.extraHostsPlaceholder}
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    accessibilityLabel={COPY.extraHostsLabel}
                    style={inputStyle}
                  />
                  <Note>{`${COPY.extraHostsLabel}. ${COPY.extraHostsHelp}`}</Note>
                </View>
              )}
            </Section>

            {runtimes.length > 0 ? (
              <Section title={COPY.runtimeHeading}>
                <View accessibilityRole="radiogroup">
                  <Choice
                    label={COPY.defaultRuntime}
                    selected={runtimeId === ''}
                    onPress={() => setRuntimeId('')}
                  />
                  {[...harnesses, ...images].map((runtime) => (
                    <Choice
                      key={runtime.id}
                      label={describeRuntime(runtime)}
                      selected={runtimeId === runtime.id}
                      onPress={() => setRuntimeId(runtime.id)}
                    />
                  ))}
                </View>
                <Note>{COPY.runtimeFixed}</Note>
              </Section>
            ) : null}

            {error ? <Note tone="error">{error}</Note> : null}
            <Button
              title={creating ? 'Starting…' : 'Start session'}
              onPress={() => void handleCreate()}
              disabled={!canCreate}
              testID="new-cloud-code-start"
            />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
