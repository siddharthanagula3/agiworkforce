import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  TextInput,
  View,
  type TextStyle,
} from 'react-native';
import { Check, GitBranch, Lock, Plus, X } from 'lucide-react-native';
import type { CloudCodeRepository } from '@agiworkforce/cloud-contracts';
import {
  CLOUD_CODE_LIMITS,
  type CloudCodeNetworkAccess,
  type CloudCodeSession,
} from '@agiworkforce/types';
import { Button } from '@/components/ui/button';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { API_URL } from '@/lib/constants';
import { openInAppBrowser } from '@/lib/safeOpenURL';
import { dialogPadding, useThemeColors } from '@/src/ui/theme';
import { CLOUD_CODE_BRANCH_LIMIT } from '../presentation';
import { cloudCodeApi, describeCloudCodeError, newCloudCodeIdempotencyKey } from '../service';
import {
  useCloudCodeBranches,
  useCloudCodeRepositories,
  type CloudCodeBranchState,
  type CloudCodeRepositoryState,
} from '../useCloudCodeRepositories';

export const NEW_CLOUD_CODE_SESSION_ERROR = 'The session could not be started';
const TITLE_WORDS = 6;
const GITHUB_INSTALL_PATH = '/api/github/install/start';

export const NEW_CLOUD_CODE_SESSION_COPY = {
  repositoryLoading: 'Loading repositories',
  repositoryLoadFailed: 'Repositories could not be loaded.',
  repositoryNoMatches: 'No repositories match that search.',
  repositoryNoneReachable:
    'The installed app can reach no repositories yet. Give it access to one on GitHub.',
  repositoryTruncated: 'More repositories exist. Search to narrow the list.',
  repositoryUnreachablePrefix: 'These installations could not be read:',
  repositoryPrivate: 'Private',
  firstRunHeading: 'Two steps to work in your repository',
  firstRunConnectTitle: 'Connect your GitHub account',
  firstRunConnectCopy: 'Sign in so this surface can see the repositories you can reach.',
  firstRunInstallTitle: 'Install the GitHub app',
  firstRunInstallCopy: 'Choose which repositories the environment may clone and push.',
  firstRunAction: 'Connect GitHub',
  branchLabel: 'Branch',
  branchSearchLabel: 'Search branches',
  branchSearchPlaceholder: 'Search or type a branch name',
  branchLoading: 'Loading branches',
  branchLoadFailed: 'Branches could not be loaded.',
  branchNoMatches: 'This repository has no branches yet.',
  branchTruncated: 'Some branches are not listed. Type the full name to use one.',
  branchUseTyped: 'Use branch',
  branchDefault: 'Default',
  branchProtected: 'Protected',
  retry: 'Retry',
} as const;

const COPY = NEW_CLOUD_CODE_SESSION_COPY;

const NETWORK_OPTIONS: ReadonlyArray<{
  id: Exclude<CloudCodeNetworkAccess, 'full'>;
  label: string;
  description: string;
}> = [
  { id: 'none', label: 'Isolated', description: 'Commands cannot reach the internet.' },
  {
    id: 'trusted',
    label: 'Trusted hosts',
    description: 'Package registries and code hosts only. Required to clone a repository.',
  },
];

export function titleFromTask(task: string): string {
  const words = task.trim().split(/\s+/).slice(0, TITLE_WORDS).join(' ');
  return (words || 'AGI Code').slice(0, CLOUD_CODE_LIMITS.title);
}

interface NewCloudCodeSessionSheetProps {
  visible: boolean;
  onClose: () => void;
  onCreated: (session: CloudCodeSession, goal: string) => void;
}

export function NewCloudCodeSessionSheet({
  visible,
  onClose,
  onCreated,
}: NewCloudCodeSessionSheetProps) {
  const colors = useThemeColors();
  const [task, setTask] = useState('');
  const [search, setSearch] = useState('');
  const [repository, setRepository] = useState<CloudCodeRepository | null>(null);
  const [branch, setBranch] = useState('');
  const [branchSearch, setBranchSearch] = useState('');
  const [networkAccess, setNetworkAccess] = useState<'none' | 'trusted'>('trusted');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const repositories = useCloudCodeRepositories(visible, search);
  const branches = useCloudCodeBranches(visible ? repository : null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const chooseRepository = useCallback((next: CloudCodeRepository | null) => {
    setRepository(next);
    setBranch(next?.defaultBranch ?? '');
    setBranchSearch('');
    if (next) setNetworkAccess('trusted');
  }, []);

  const chooseBranch = useCallback((name: string) => {
    setBranch(name);
    setBranchSearch('');
  }, []);

  const reloadRepositories = repositories.reload;
  const installGitHubApp = useCallback(async () => {
    await openInAppBrowser(new URL(GITHUB_INSTALL_PATH, API_URL).toString());
    if (mounted.current) reloadRepositories();
  }, [reloadRepositories]);

  const reset = useCallback(() => {
    setTask('');
    setSearch('');
    setRepository(null);
    setBranch('');
    setBranchSearch('');
    setNetworkAccess('trusted');
    setError(null);
  }, []);

  const goal = task.trim();
  const canCreate = goal.length > 0 && !creating;

  const handleCreate = useCallback(async () => {
    if (!canCreate) return;
    setCreating(true);
    setError(null);
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
        networkAccess: repository ? 'trusted' : networkAccess,
      });
      reset();
      onCreated(body.session, goal);
    } catch (createError) {
      setError(describeCloudCodeError(createError, NEW_CLOUD_CODE_SESSION_ERROR));
    } finally {
      setCreating(false);
    }
  }, [branch, canCreate, goal, networkAccess, onCreated, repository, reset]);

  const inputStyle = {
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
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <Text
              accessibilityRole="header"
              style={{ flex: 1, color: colors.textPrimary, fontSize: 17, fontWeight: '600' }}
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
            contentContainerStyle={{ gap: 16, paddingBottom: 32 }}
          >
            <View style={{ gap: 6 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Task</Text>
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
            </View>

            <View style={{ gap: 6 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Repository</Text>
              {repositories.state.status === 'no-installation' ? (
                <RepositoryFirstRun onInstall={() => void installGitHubApp()} />
              ) : (
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
              )}
              <RepositoryOptions
                state={repositories.state}
                search={search}
                selected={repository}
                onChoose={chooseRepository}
                onRetry={repositories.reload}
              />
            </View>

            {repository ? (
              <BranchPicker
                repository={repository}
                state={branches.state}
                branch={branch}
                search={branchSearch}
                onSearchChange={setBranchSearch}
                onChoose={chooseBranch}
                onRetry={branches.reload}
                inputStyle={inputStyle}
              />
            ) : null}

            <View style={{ gap: 6 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Network access</Text>
              <View accessibilityRole="radiogroup">
                {NETWORK_OPTIONS.map((option) => {
                  const locked = repository !== null && option.id === 'none';
                  const selected = (repository ? 'trusted' : networkAccess) === option.id;
                  return (
                    <Pressable
                      key={option.id}
                      onPress={() => setNetworkAccess(option.id)}
                      disabled={locked}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected, disabled: locked }}
                      accessibilityLabel={`${option.label}. ${option.description}`}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        minHeight: 52,
                        gap: 8,
                        opacity: locked ? 0.5 : 1,
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.textPrimary, fontSize: 15 }}>
                          {option.label}
                        </Text>
                        <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                          {option.description}
                        </Text>
                      </View>
                      {selected ? <Check size={16} color={colors.textPrimary} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {error ? (
              <Text accessibilityRole="alert" style={{ color: colors.agentError, fontSize: 13 }}>
                {error}
              </Text>
            ) : null}
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

function Notice({ children }: { children: string }) {
  const colors = useThemeColors();
  return <Text style={{ color: colors.textMuted, fontSize: 13 }}>{children}</Text>;
}

function LoadFailure({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = useThemeColors();
  return (
    <View style={{ gap: 8, alignItems: 'flex-start' }}>
      <Text accessibilityRole="alert" style={{ color: colors.agentError, fontSize: 13 }}>
        {message}
      </Text>
      <Button title={COPY.retry} variant="secondary" onPress={onRetry} />
    </View>
  );
}

function RepositoryFirstRun({ onInstall }: { onInstall: () => void }) {
  const colors = useThemeColors();
  const steps = [
    { id: 'connect', title: COPY.firstRunConnectTitle, copy: COPY.firstRunConnectCopy },
    { id: 'install', title: COPY.firstRunInstallTitle, copy: COPY.firstRunInstallCopy },
  ];
  return (
    <View testID="new-cloud-code-first-run" style={{ gap: 10, paddingVertical: 4 }}>
      <Text accessibilityRole="header" style={{ color: colors.textPrimary, fontSize: 15 }}>
        {COPY.firstRunHeading}
      </Text>
      {steps.map((step, index) => (
        <View key={step.id} style={{ flexDirection: 'row', gap: 8 }}>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>{`${index + 1}.`}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 14 }}>{step.title}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>{step.copy}</Text>
          </View>
        </View>
      ))}
      <Button title={COPY.firstRunAction} onPress={onInstall} testID="new-cloud-code-install" />
    </View>
  );
}

function RepositoryOptions({
  state,
  search,
  selected,
  onChoose,
  onRetry,
}: {
  state: CloudCodeRepositoryState;
  search: string;
  selected: CloudCodeRepository | null;
  onChoose: (repository: CloudCodeRepository | null) => void;
  onRetry: () => void;
}) {
  const colors = useThemeColors();
  const listed = state.status === 'ready' ? state.repositories : [];
  const entries: Array<CloudCodeRepository | null> = [null, ...listed];
  if (selected && !listed.some((entry) => sameRepository(entry, selected))) {
    entries.splice(1, 0, selected);
  }

  return (
    <>
      <View accessibilityRole="radiogroup">
        {entries.map((entry) => {
          const checked = entry && selected ? sameRepository(entry, selected) : entry === selected;
          const label = entry ? entry.fullName : 'No repository';
          return (
            <Pressable
              key={entry ? `${entry.installationId}:${entry.fullName}` : 'none'}
              onPress={() => onChoose(entry)}
              accessibilityRole="radio"
              accessibilityState={{ checked }}
              accessibilityLabel={entry?.isPrivate ? `${label}, ${COPY.repositoryPrivate}` : label}
              testID={entry ? `new-cloud-code-repo-${entry.fullName}` : 'new-cloud-code-repo-none'}
              style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 8 }}
            >
              <Text style={{ flex: 1, color: colors.textPrimary, fontSize: 15 }}>{label}</Text>
              {entry?.isPrivate ? <Lock size={14} color={colors.textMuted} /> : null}
              {checked ? <Check size={16} color={colors.textPrimary} /> : null}
            </Pressable>
          );
        })}
      </View>
      {state.status === 'loading' || state.status === 'idle' ? (
        <ActivityIndicator
          color={colors.textMuted}
          accessibilityLabel={COPY.repositoryLoading}
          testID="new-cloud-code-repositories-loading"
        />
      ) : null}
      {state.status === 'error' ? (
        <LoadFailure message={COPY.repositoryLoadFailed} onRetry={onRetry} />
      ) : null}
      {state.status === 'ready' && state.repositories.length === 0 ? (
        <Notice>{search.trim() ? COPY.repositoryNoMatches : COPY.repositoryNoneReachable}</Notice>
      ) : null}
      {state.status === 'ready' && state.truncated ? (
        <Notice>{COPY.repositoryTruncated}</Notice>
      ) : null}
      {state.status === 'ready' && state.unreachable.length > 0 ? (
        <Notice>{`${COPY.repositoryUnreachablePrefix} ${state.unreachable.join(', ')}`}</Notice>
      ) : null}
    </>
  );
}

function sameRepository(a: CloudCodeRepository, b: CloudCodeRepository): boolean {
  return a.installationId === b.installationId && a.fullName === b.fullName;
}

function BranchPicker({
  repository,
  state,
  branch,
  search,
  onSearchChange,
  onChoose,
  onRetry,
  inputStyle,
}: {
  repository: CloudCodeRepository;
  state: CloudCodeBranchState;
  branch: string;
  search: string;
  onSearchChange: (value: string) => void;
  onChoose: (name: string) => void;
  onRetry: () => void;
  inputStyle: TextStyle;
}) {
  const colors = useThemeColors();
  const needle = search.trim();
  const listed = state.status === 'ready' ? state.branches : [];
  const matches = listed.filter((candidate) =>
    candidate.name.toLowerCase().includes(needle.toLowerCase()),
  );
  const typedIsListed = listed.some((candidate) => candidate.name === needle);
  const chosenIsListed = listed.some((candidate) => candidate.name === branch);
  const rows =
    branch && !chosenIsListed && !needle
      ? [{ name: branch, isProtected: false }, ...matches]
      : matches;

  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{COPY.branchLabel}</Text>
      <TextInput
        value={search}
        onChangeText={onSearchChange}
        onSubmitEditing={() => {
          if (needle) onChoose(needle);
        }}
        placeholder={COPY.branchSearchPlaceholder}
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={CLOUD_CODE_BRANCH_LIMIT}
        returnKeyType="done"
        accessibilityLabel={COPY.branchSearchLabel}
        testID="new-cloud-code-branch-search"
        style={inputStyle}
      />
      <View accessibilityRole="radiogroup" accessibilityLabel={COPY.branchLabel}>
        {rows.map((candidate) => {
          const checked = candidate.name === branch;
          const isDefault = candidate.name === repository.defaultBranch;
          const tags: string[] = [];
          if (isDefault) tags.push(COPY.branchDefault);
          if (candidate.isProtected) tags.push(COPY.branchProtected);
          return (
            <Pressable
              key={candidate.name}
              onPress={() => onChoose(candidate.name)}
              accessibilityRole="radio"
              accessibilityState={{ checked }}
              accessibilityLabel={[candidate.name, ...tags].join(', ')}
              testID={`new-cloud-code-branch-${candidate.name}`}
              style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 8 }}
            >
              <GitBranch size={14} color={colors.textMuted} />
              <Text style={{ flex: 1, color: colors.textPrimary, fontSize: 15 }} numberOfLines={1}>
                {candidate.name}
              </Text>
              {tags.length > 0 ? (
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>{tags.join(' · ')}</Text>
              ) : null}
              {checked ? <Check size={16} color={colors.textPrimary} /> : null}
            </Pressable>
          );
        })}
        {needle && !typedIsListed && state.status !== 'loading' ? (
          <Pressable
            onPress={() => onChoose(needle)}
            accessibilityRole="button"
            accessibilityLabel={`${COPY.branchUseTyped} ${needle}`}
            testID="new-cloud-code-branch-use-typed"
            style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 8 }}
          >
            <Plus size={14} color={colors.textMuted} />
            <Text style={{ flex: 1, color: colors.textPrimary, fontSize: 15 }} numberOfLines={1}>
              {`${COPY.branchUseTyped} ${needle}`}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {state.status === 'loading' ? (
        <ActivityIndicator
          color={colors.textMuted}
          accessibilityLabel={COPY.branchLoading}
          testID="new-cloud-code-branches-loading"
        />
      ) : null}
      {state.status === 'error' ? (
        <LoadFailure message={COPY.branchLoadFailed} onRetry={onRetry} />
      ) : null}
      {state.status === 'ready' && state.branches.length === 0 && !needle ? (
        <Notice>{COPY.branchNoMatches}</Notice>
      ) : null}
      {state.status === 'ready' && state.truncated ? <Notice>{COPY.branchTruncated}</Notice> : null}
    </View>
  );
}
