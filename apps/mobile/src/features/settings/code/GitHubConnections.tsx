import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Github, Plus } from 'lucide-react-native';
import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import {
  disconnectGitHubInstallation,
  fetchGitHubInstallations,
  startGitHubInstallInApp,
  type GitHubInstallation,
} from '@/src/features/cloud-code/githubInstall';
import { describeCloudCodeError } from '@/src/features/cloud-code/service';

export const GITHUB_CONNECT_FAILED = 'GitHub could not be connected';
export const GITHUB_CONNECTIONS_LOAD_FAILED = 'Connections could not be loaded.';
export const GITHUB_DISCONNECT_FAILED = 'GitHub could not be disconnected';
const NO_CONNECTION = 'No GitHub account connected';

export function disconnectConfirmation(login: string): { title: string; message: string } {
  return {
    title: `Disconnect ${login}?`,
    message:
      'Cloud sessions can no longer clone or push its repositories. You can connect it again later.',
  };
}

type Load =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; installations: GitHubInstallation[] };

function RowFrame({ children, isLast }: { children: ReactNode; isLast?: boolean }) {
  const colors = useThemeColors();
  return (
    <View
      style={{
        minHeight: 52,
        paddingHorizontal: 14,
        paddingVertical: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: colors.border,
      }}
    >
      {children}
    </View>
  );
}

export function GitHubConnections() {
  const colors = useThemeColors();
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [adding, setAdding] = useState(false);
  const [disconnecting, setDisconnecting] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const request = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    const current = ++request.current;
    try {
      const installations = await fetchGitHubInstallations();
      if (current === request.current && mounted.current) {
        setLoad({ status: 'ready', installations });
      }
    } catch {
      if (current === request.current && mounted.current) {
        setLoad((previous) => (previous.status === 'ready' ? previous : { status: 'error' }));
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const retry = useCallback(() => {
    setLoad({ status: 'loading' });
    void reload();
  }, [reload]);

  const add = useCallback(async () => {
    setAdding(true);
    setNotice(null);
    try {
      const started = await startGitHubInstallInApp();
      if (!mounted.current) return;
      if (started.kind === 'returned') {
        router.push({ pathname: '/(app)/github/installed', params: started.result });
      } else if (started.kind === 'failed') {
        setNotice(GITHUB_CONNECT_FAILED);
      }
    } catch (error: unknown) {
      if (mounted.current) setNotice(describeCloudCodeError(error, GITHUB_CONNECT_FAILED));
    } finally {
      if (mounted.current) setAdding(false);
    }
  }, [router]);

  const disconnect = useCallback(async (installation: GitHubInstallation) => {
    setDisconnecting(installation.installation_id);
    setNotice(null);
    try {
      await disconnectGitHubInstallation(installation.installation_id);
      if (mounted.current) {
        setLoad((previous) =>
          previous.status === 'ready'
            ? {
                status: 'ready',
                installations: previous.installations.filter(
                  (entry) => entry.installation_id !== installation.installation_id,
                ),
              }
            : previous,
        );
      }
    } catch (error: unknown) {
      if (mounted.current) setNotice(describeCloudCodeError(error, GITHUB_DISCONNECT_FAILED));
    } finally {
      if (mounted.current) setDisconnecting(null);
    }
  }, []);

  const confirmDisconnect = useCallback(
    (installation: GitHubInstallation) => {
      const { title, message } = disconnectConfirmation(installation.account_login);
      Alert.alert(title, message, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Disconnect', style: 'destructive', onPress: () => void disconnect(installation) },
      ]);
    },
    [disconnect],
  );

  const installations = load.status === 'ready' ? load.installations : [];

  return (
    <>
      {load.status === 'loading' ? (
        <RowFrame>
          <LoadingIndicator size="small" />
          <Text style={{ flex: 1, color: colors.textMuted, fontSize: typeScale.body }}>
            Loading GitHub accounts
          </Text>
        </RowFrame>
      ) : null}
      {load.status === 'error' ? (
        <Pressable
          onPress={retry}
          accessibilityRole="button"
          accessibilityLabel={`${GITHUB_CONNECTIONS_LOAD_FAILED} Try again`}
          testID="github-connections-retry"
        >
          <RowFrame>
            <Github size={19} color={colors.agentError} />
            <Text
              accessibilityRole="alert"
              style={{ flex: 1, color: colors.agentError, fontSize: typeScale.footnote }}
            >
              {`${GITHUB_CONNECTIONS_LOAD_FAILED} `}
              <Text
                style={{
                  color: colors.textPrimary,
                  fontSize: typeScale.footnote,
                  fontWeight: '700',
                }}
              >
                Try again
              </Text>
            </Text>
          </RowFrame>
        </Pressable>
      ) : null}
      {load.status === 'ready' && installations.length === 0 ? (
        <RowFrame>
          <Github size={19} color={colors.textMuted} />
          <Text style={{ flex: 1, color: colors.textMuted, fontSize: typeScale.body }}>
            {NO_CONNECTION}
          </Text>
        </RowFrame>
      ) : null}
      {installations.map((installation) => {
        const kind = installation.account_type === 'Organization' ? 'Organization' : 'Personal';
        const busy = disconnecting === installation.installation_id;
        return (
          <RowFrame key={installation.installation_id}>
            <Github size={19} color={colors.textSecondary} />
            <View style={{ flex: 1 }}>
              <Text
                numberOfLines={2}
                style={{ color: colors.textPrimary, fontSize: typeScale.body }}
              >
                {installation.account_login}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: typeScale.footnote }}>{kind}</Text>
            </View>
            {busy ? (
              <LoadingIndicator size="small" />
            ) : (
              <Pressable
                onPress={() => confirmDisconnect(installation)}
                disabled={disconnecting !== null}
                accessibilityRole="button"
                accessibilityLabel={`Disconnect ${installation.account_login}`}
                testID={`github-disconnect-${installation.installation_id}`}
                style={{ minHeight: 44, minWidth: 44, justifyContent: 'center' }}
              >
                <Text style={{ color: colors.agentError, fontSize: typeScale.body }}>
                  Disconnect
                </Text>
              </Pressable>
            )}
          </RowFrame>
        );
      })}
      {notice ? (
        <RowFrame>
          <Text
            accessibilityRole="alert"
            style={{ flex: 1, color: colors.agentError, fontSize: typeScale.footnote }}
          >
            {notice}
          </Text>
        </RowFrame>
      ) : null}
      <Pressable
        onPress={() => void add()}
        disabled={adding}
        accessibilityRole="button"
        accessibilityLabel="Add connection"
        accessibilityState={{ busy: adding, disabled: adding }}
        testID="github-add-connection"
      >
        <RowFrame isLast>
          {adding ? (
            <LoadingIndicator size="small" />
          ) : (
            <Plus size={19} color={colors.textSecondary} />
          )}
          <Text style={{ flex: 1, color: colors.textPrimary, fontSize: typeScale.body }}>
            Add connection
          </Text>
        </RowFrame>
      </Pressable>
    </>
  );
}
