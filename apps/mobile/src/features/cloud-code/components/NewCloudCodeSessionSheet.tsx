import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { Check, X } from 'lucide-react-native';
import type { CloudCodeRepository } from '@agiworkforce/cloud-contracts';
import {
  CLOUD_CODE_LIMITS,
  type CloudCodeNetworkAccess,
  type CloudCodeSession,
} from '@agiworkforce/types';
import { Button } from '@/components/ui/button';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { dialogPadding, useThemeColors, typeScale } from '@/src/ui/theme';
import { cloudCodeApi, describeCloudCodeError, newCloudCodeIdempotencyKey } from '../service';

export const NEW_CLOUD_CODE_SESSION_ERROR = 'The session could not be started';
const TITLE_WORDS = 6;
const SEARCH_DEBOUNCE_MS = 300;

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
  const [repositories, setRepositories] = useState<CloudCodeRepository[]>([]);
  const [repositoriesError, setRepositoriesError] = useState<string | null>(null);
  const [loadingRepositories, setLoadingRepositories] = useState(false);
  const [repository, setRepository] = useState<CloudCodeRepository | null>(null);
  const [branch, setBranch] = useState('');
  const [networkAccess, setNetworkAccess] = useState<'none' | 'trusted'>('trusted');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchRequest = useRef(0);

  useEffect(() => {
    if (!visible) return;
    const request = ++searchRequest.current;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoadingRepositories(true);
      cloudCodeApi
        .listRepositories(search.trim() || undefined, controller.signal)
        .then((list) => {
          if (request !== searchRequest.current) return;
          setRepositories(list.repositories);
          setRepositoriesError(null);
        })
        .catch((loadError: unknown) => {
          if (request !== searchRequest.current || controller.signal.aborted) return;
          setRepositoriesError(
            describeCloudCodeError(loadError, 'Repositories could not be loaded'),
          );
        })
        .finally(() => {
          if (request === searchRequest.current) setLoadingRepositories(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search, visible]);

  const chooseRepository = useCallback((next: CloudCodeRepository | null) => {
    setRepository(next);
    setBranch('');
    if (next) setNetworkAccess('trusted');
  }, []);

  const reset = useCallback(() => {
    setTask('');
    setSearch('');
    setRepository(null);
    setBranch('');
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
            contentContainerStyle={{ gap: 16, paddingBottom: 32 }}
          >
            <View style={{ gap: 6 }}>
              <Text style={{ color: colors.textSecondary, fontSize: typeScale.footnote }}>
                Task
              </Text>
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
              <Text style={{ color: colors.textSecondary, fontSize: typeScale.footnote }}>
                Repository
              </Text>
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
                {[null, ...repositories].map((entry) => {
                  const selected = (entry?.fullName ?? null) === (repository?.fullName ?? null);
                  const label = entry ? entry.fullName : 'No repository';
                  return (
                    <Pressable
                      key={entry ? `${entry.installationId}:${entry.fullName}` : 'none'}
                      onPress={() => chooseRepository(entry)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      accessibilityLabel={label}
                      testID={
                        entry ? `new-cloud-code-repo-${entry.fullName}` : 'new-cloud-code-repo-none'
                      }
                      style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 8 }}
                    >
                      <Text
                        style={{ flex: 1, color: colors.textPrimary, fontSize: typeScale.body }}
                      >
                        {label}
                      </Text>
                      {selected ? <Check size={16} color={colors.textPrimary} /> : null}
                    </Pressable>
                  );
                })}
              </View>
              {loadingRepositories ? <ActivityIndicator color={colors.textMuted} /> : null}
              {repositoriesError ? (
                <Text
                  accessibilityRole="alert"
                  style={{ color: colors.agentError, fontSize: typeScale.footnote }}
                >
                  {repositoriesError}
                </Text>
              ) : null}
              {repository ? (
                <TextInput
                  value={branch}
                  onChangeText={setBranch}
                  placeholder={
                    repository.defaultBranch
                      ? `Branch (default ${repository.defaultBranch})`
                      : 'Branch'
                  }
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  accessibilityLabel="Branch"
                  style={inputStyle}
                />
              ) : null}
            </View>

            <View style={{ gap: 6 }}>
              <Text style={{ color: colors.textSecondary, fontSize: typeScale.footnote }}>
                Network access
              </Text>
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
                        <Text style={{ color: colors.textPrimary, fontSize: typeScale.body }}>
                          {option.label}
                        </Text>
                        <Text style={{ color: colors.textMuted, fontSize: typeScale.footnote }}>
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
              <Text
                accessibilityRole="alert"
                style={{ color: colors.agentError, fontSize: typeScale.footnote }}
              >
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
