import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/expo';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import {
  completeGitHubInstall,
  describeGitHubInstallOutcome,
  fetchPendingGitHubInstall,
  readGitHubInstallReturn,
} from '@/src/features/cloud-code/githubInstall';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { useGoBack } from '@/src/shared/hooks/useGoBack';

type Stage =
  | { name: 'loading' }
  | { name: 'confirm'; accountLogin: string; accountType: 'User' | 'Organization' }
  | { name: 'finishing' }
  | { name: 'done'; message: string | null };

const CLOUD_CODE_ROUTE = '/(app)/cloud-code';
const CLOUD_CODE_HREF = CLOUD_CODE_ROUTE as Parameters<ReturnType<typeof useRouter>['replace']>[0];

export default function GitHubInstallReturnRoute() {
  const router = useRouter();
  const colors = useThemeColors();
  const handleBack = useGoBack(CLOUD_CODE_ROUTE);
  const { user } = useUser();
  const params = useLocalSearchParams<{ state?: string; code?: string; error?: string }>();
  const returned = useMemo(() => readGitHubInstallReturn(params), [params]);
  const [stage, setStage] = useState<Stage>({ name: 'loading' });
  const accountEmail = user?.primaryEmailAddress?.emailAddress ?? 'this AGI account';
  const routerRef = useRef(router);
  routerRef.current = router;

  const finish = useCallback(
    async (decision: 'link' | 'cancel') => {
      if (!returned) return;
      setStage({ name: 'finishing' });
      try {
        const status = await completeGitHubInstall(
          decision === 'link' && !returned.error
            ? returned
            : { state: returned.state, error: 'denied' },
        );
        if (status === 'connected') {
          routerRef.current.replace(CLOUD_CODE_HREF);
          return;
        }
        setStage({ name: 'done', message: describeGitHubInstallOutcome(status) });
      } catch {
        setStage({ name: 'done', message: describeGitHubInstallOutcome('failed') });
      }
    },
    [returned],
  );

  useEffect(() => {
    let cancelled = false;
    if (!returned) {
      setStage({ name: 'done', message: describeGitHubInstallOutcome('invalid_state') });
      return undefined;
    }
    if (returned.error) {
      void finish('cancel');
      return undefined;
    }
    fetchPendingGitHubInstall(returned.state)
      .then((pending) => {
        if (cancelled) return;
        if (pending.status === 'ready') {
          setStage({
            name: 'confirm',
            accountLogin: pending.accountLogin,
            accountType: pending.accountType,
          });
        } else {
          setStage({
            name: 'done',
            message: describeGitHubInstallOutcome(
              pending.status === 'invalid_state' ? 'invalid_state' : 'failed',
            ),
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStage({ name: 'done', message: describeGitHubInstallOutcome('failed') });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [finish, returned]);

  return (
    <SafeAreaView
      style={{
        flex: 1,
        justifyContent: 'center',
        padding: 24,
        backgroundColor: colors.surfaceBase,
      }}
    >
      {stage.name === 'confirm' ? (
        <View style={{ gap: 16 }}>
          <Text
            accessibilityRole="header"
            style={{ color: colors.textPrimary, fontSize: typeScale.title3, fontWeight: '600' }}
          >
            Link GitHub?
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: typeScale.body }}>
            {`Link GitHub installation ${stage.accountLogin}${
              stage.accountType === 'Organization' ? ' (organization)' : ''
            } to ${accountEmail}?`}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: typeScale.footnote }}>
            Only link it if you just started this from the AGI Workforce app yourself.
          </Text>
          <Button title="Link GitHub" size="lg" onPress={() => void finish('link')} />
          <Button
            title="Cancel"
            size="lg"
            variant="outline"
            onPress={() => void finish('cancel')}
          />
        </View>
      ) : stage.name === 'done' ? (
        <View style={{ gap: 16 }}>
          <Text style={{ color: colors.textPrimary, fontSize: typeScale.body }}>
            {stage.message ?? 'GitHub was not linked.'}
          </Text>
          <Button title="Back" size="lg" variant="outline" onPress={handleBack} />
        </View>
      ) : (
        <View
          style={{ alignItems: 'center', gap: 16 }}
          accessibilityLabel="Finishing the GitHub connection"
        >
          <ActivityIndicator color={colors.textPrimary} />
          <Button
            title="Cancel"
            variant="outline"
            onPress={() => {
              if (returned && stage.name === 'loading') void finish('cancel');
              else handleBack();
            }}
          />
        </View>
      )}
    </SafeAreaView>
  );
}
