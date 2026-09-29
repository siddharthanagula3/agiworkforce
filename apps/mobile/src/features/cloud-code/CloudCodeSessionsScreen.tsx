import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { ArrowLeft, Code2, Plus, RefreshCw } from 'lucide-react-native';
import {
  CLOUD_CODE_SESSION_STATUS_FILTERS,
  CLOUD_CODE_SESSION_STATUS_FILTER_LABELS,
  MOBILE_REMOTE_SCREEN_LABEL,
  type CloudCodeSession,
  type CloudCodeSessionStatusFilter,
} from '@agiworkforce/types';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { CloudCodeGate } from './components/CloudCodeGate';
import { CloudCodeSessionRow } from './components/CloudCodeSessionRow';
import { NewCloudCodeSessionSheet } from './components/NewCloudCodeSessionSheet';
import { useCloudCodeAccess } from './useCloudCodeAccess';
import { useCloudCodeSessions } from './useCloudCodeSessions';
import { CLOUD_CODE_SCREEN_TITLE } from './presentation';

const DEFAULT_FILTER: CloudCodeSessionStatusFilter = 'open';
const REMOTE_NOTE = `Sessions running on your computer are in ${MOBILE_REMOTE_SCREEN_LABEL}.`;

function Header({ onBack, onNew }: { onBack: () => void; onNew?: () => void }) {
  const colors = useThemeColors();

  return (
    <View
      style={{
        minHeight: 52,
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
      <Text
        variant="subheading"
        accessibilityRole="header"
        style={{ flex: 1, color: colors.textPrimary }}
      >
        {CLOUD_CODE_SCREEN_TITLE}
      </Text>
      {onNew ? (
        <PressableBox
          onPress={onNew}
          accessibilityRole="button"
          accessibilityLabel="New cloud session"
          hitSlop={8}
          testID="cloud-code-new-session"
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <Plus size={20} color={colors.textSecondary} />
        </PressableBox>
      ) : null}
    </View>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  const colors = useThemeColors();

  return (
    <View style={{ minHeight: 260, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <Code2 size={32} color={colors.textMuted} />
      <Text
        variant="subheading"
        style={{ color: colors.textPrimary, textAlign: 'center', marginTop: 16 }}
      >
        {filtered ? 'No sessions match this filter' : 'No cloud sessions yet'}
      </Text>
      <Text style={{ color: colors.textMuted, textAlign: 'center', lineHeight: 20, marginTop: 7 }}>
        Start one with the + button, on the web or in the desktop app. It shows up here, where you
        can follow it, answer its approvals and send the next task.
      </Text>
    </View>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = useThemeColors();

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <RefreshCw size={28} color={colors.agentError} />
      <Text
        variant="subheading"
        style={{ color: colors.textPrimary, textAlign: 'center', marginTop: 16 }}
      >
        Cloud sessions could not be loaded
      </Text>
      <Text
        selectable
        style={{ color: colors.textMuted, textAlign: 'center', lineHeight: 20, marginTop: 7 }}
      >
        {message}
      </Text>
      <Button title="Try again" variant="outline" onPress={onRetry} style={{ marginTop: 20 }} />
    </View>
  );
}

function SessionList({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  const colors = useThemeColors();
  const [filter, setFilter] = useState<CloudCodeSessionStatusFilter>(DEFAULT_FILTER);
  const { status, sessions, availability, runtimes, error, refreshing, load } =
    useCloudCodeSessions(filter);
  const loadRef = useRef(load);
  loadRef.current = load;
  const focusedOnce = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (!focusedOnce.current) {
        focusedOnce.current = true;
        return;
      }
      void loadRef.current('background');
    }, []),
  );

  const handleOpen = useCallback(
    (sessionId: string) => {
      router.push({
        pathname: '/(app)/cloud-code/[sessionId]',
        params: { sessionId },
      } as Parameters<typeof router.push>[0]);
    },
    [router],
  );

  const [newSessionOpen, setNewSessionOpen] = useState(false);

  const handleCreated = useCallback(
    (session: CloudCodeSession, goal: string) => {
      setNewSessionOpen(false);
      void load('background');
      router.push({
        pathname: '/(app)/cloud-code/[sessionId]',
        params: { sessionId: session.id, goal },
      } as Parameters<typeof router.push>[0]);
    },
    [load, router],
  );

  const handleOpenRemote = useCallback(() => {
    router.push('/(app)/companion' as Parameters<typeof router.push>[0]);
  }, [router]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceBase }}>
      <Header onBack={onBack} onNew={() => setNewSessionOpen(true)} />
      <NewCloudCodeSessionSheet
        visible={newSessionOpen}
        availability={availability}
        runtimes={runtimes}
        onClose={() => setNewSessionOpen(false)}
        onCreated={handleCreated}
      />

      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 12 }}>
        {CLOUD_CODE_SESSION_STATUS_FILTERS.map((key) => {
          const selected = key === filter;
          return (
            <PressableBox
              key={key}
              onPress={() => setFilter(key)}
              accessibilityRole="button"
              accessibilityLabel={`Filter sessions: ${CLOUD_CODE_SESSION_STATUS_FILTER_LABELS[key]}`}
              accessibilityState={{ selected }}
              hitSlop={4}
              style={{
                height: 36,
                borderRadius: 18,
                paddingHorizontal: 14,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: selected ? colors.textPrimary : colors.surfaceElevated,
                borderWidth: 1,
                borderColor: selected ? colors.textPrimary : colors.border,
              }}
            >
              <Text
                style={{
                  color: selected ? colors.accentText : colors.textSecondary,
                  fontSize: typeScale.footnote,
                  fontWeight: '600',
                }}
              >
                {CLOUD_CODE_SESSION_STATUS_FILTER_LABELS[key]}
              </Text>
            </PressableBox>
          );
        })}
      </View>

      {status === 'loading' ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <ActivityIndicator color={colors.textPrimary} />
          <Text style={{ color: colors.textMuted }}>Loading cloud sessions</Text>
        </View>
      ) : status === 'error' ? (
        <ErrorState
          message={error ?? 'Cloud sessions could not be loaded'}
          onRetry={() => void load('initial')}
        />
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(session) => session.id}
          renderItem={({ item }) => <CloudCodeSessionRow session={item} onOpen={handleOpen} />}
          contentContainerStyle={{ paddingHorizontal: 4, paddingBottom: 40, flexGrow: 1 }}
          ListHeaderComponent={
            <View style={{ paddingHorizontal: 12, paddingBottom: 8, gap: 8 }}>
              {error ? (
                <Text
                  accessibilityRole="alert"
                  style={{ color: colors.agentError, fontSize: typeScale.footnote, lineHeight: 19 }}
                >
                  {error}
                </Text>
              ) : null}
              <PressableBox
                onPress={handleOpenRemote}
                accessibilityRole="button"
                accessibilityLabel={`Open ${MOBILE_REMOTE_SCREEN_LABEL}`}
                style={{ minHeight: 44, justifyContent: 'center' }}
              >
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontSize: typeScale.footnote,
                    lineHeight: 19,
                  }}
                >
                  {REMOTE_NOTE}{' '}
                  <Text
                    style={{
                      color: colors.textPrimary,
                      fontSize: typeScale.footnote,
                      fontWeight: '700',
                    }}
                  >
                    {`Open ${MOBILE_REMOTE_SCREEN_LABEL}`}
                  </Text>
                </Text>
              </PressableBox>
            </View>
          }
          ListEmptyComponent={<EmptyState filtered={filter !== DEFAULT_FILTER} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load('refresh')}
              tintColor={colors.textPrimary}
              progressBackgroundColor={colors.surfaceElevated}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

export function CloudCodeSessionsScreen() {
  const router = useRouter();
  const access = useCloudCodeAccess();

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)' as Parameters<typeof router.replace>[0]);
  }, [router]);

  if (!access.ready) {
    return (
      <CloudCodeGate signedIn={access.signedIn} onBack={handleBack} onContinue={access.activate} />
    );
  }

  return <SessionList key={access.accountKey} onBack={handleBack} />;
}
