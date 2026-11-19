import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
  type CloudAccountEpoch,
} from '@/src/features/auth/services/cloudAccountSession';
import {
  addPublishedArtifactViewer,
  listPublishedArtifactViewers,
  normalizePublishedArtifactViewerEmail,
  removePublishedArtifactViewer,
  viewersFailureMessage,
  type PublishedArtifactViewer,
} from '../services/artifactPublishing';

const VIEWER_LIST_HEIGHT_RATIO = 0.3;

interface PublishedArtifactViewersProps {
  shareUrl: string;
}

type ViewersState =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; viewers: PublishedArtifactViewer[] };

function confirmRemoval(email: string) {
  return new Promise<boolean>((resolve) => {
    Alert.alert(
      `Remove ${email}?`,
      'They will lose access to the link right away.',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Remove', style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

export function PublishedArtifactViewers({ shareUrl }: PublishedArtifactViewersProps) {
  const colors = useThemeColors();
  const { height: windowHeight } = useWindowDimensions();
  const [state, setState] = useState<ViewersState>({ status: 'loading' });
  const [email, setEmail] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const generation = useRef(0);

  const isCurrent = useCallback(
    (sequence: number, account: CloudAccountEpoch | null) =>
      generation.current === sequence && isCloudAccountEpochCurrent(account),
    [],
  );

  const load = useCallback(async () => {
    const sequence = ++generation.current;
    const account = captureCloudAccountEpoch();
    setState({ status: 'loading' });
    try {
      const viewers = await listPublishedArtifactViewers(shareUrl);
      if (isCurrent(sequence, account)) setState({ status: 'ready', viewers });
    } catch {
      if (isCurrent(sequence, account)) setState({ status: 'failed' });
    }
  }, [isCurrent, shareUrl]);

  useEffect(() => {
    setEmail('');
    setAddError(null);
    setAdding(false);
    setRemoving(null);
    void load();
    return () => {
      generation.current += 1;
    };
  }, [load]);

  const normalizedEmail = normalizePublishedArtifactViewerEmail(email);
  const busy = adding || removing !== null;

  const invite = useCallback(async () => {
    if (!normalizedEmail || busy) return;
    const sequence = generation.current;
    const account = captureCloudAccountEpoch();
    setAdding(true);
    setAddError(null);
    try {
      const viewers = await addPublishedArtifactViewer(shareUrl, normalizedEmail);
      if (!isCurrent(sequence, account)) return;
      setState({ status: 'ready', viewers });
      setEmail('');
    } catch (error) {
      if (isCurrent(sequence, account)) setAddError(viewersFailureMessage(error));
    } finally {
      if (isCurrent(sequence, account)) setAdding(false);
    }
  }, [busy, isCurrent, normalizedEmail, shareUrl]);

  const remove = useCallback(
    async (viewerEmail: string) => {
      if (busy) return;
      const sequence = generation.current;
      const account = captureCloudAccountEpoch();
      if (!(await confirmRemoval(viewerEmail))) return;
      if (!isCurrent(sequence, account)) return;
      setRemoving(viewerEmail);
      try {
        const viewers = await removePublishedArtifactViewer(shareUrl, viewerEmail);
        if (isCurrent(sequence, account)) setState({ status: 'ready', viewers });
      } catch (error) {
        if (isCurrent(sequence, account)) {
          Alert.alert('Could not remove this person', viewersFailureMessage(error));
        }
      } finally {
        if (isCurrent(sequence, account)) setRemoving(null);
      }
    },
    [busy, isCurrent, shareUrl],
  );

  return (
    <View style={{ marginTop: 8, gap: 6 }} testID="artifact-viewers">
      <Text style={{ fontSize: typeScale.caption, color: colors.textMuted }}>Invited people</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TextInput
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            if (addError) setAddError(null);
          }}
          onSubmitEditing={() => void invite()}
          editable={!adding}
          placeholder="Email address"
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.teal}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          returnKeyType="send"
          accessibilityLabel="Email address to invite"
          testID="artifact-viewer-email"
          style={{
            flex: 1,
            minHeight: 44,
            paddingHorizontal: 12,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: addError ? colors.agentError : colors.border,
            fontSize: typeScale.footnote,
            color: colors.textPrimary,
          }}
        />
        <Pressable
          onPress={() => void invite()}
          disabled={!normalizedEmail || busy}
          accessibilityRole="button"
          accessibilityLabel="Invite"
          accessibilityState={{ disabled: !normalizedEmail || busy, busy: adding }}
          testID="artifact-viewer-invite"
          style={{
            minWidth: 64,
            minHeight: 44,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 12,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.border,
            opacity: !normalizedEmail || busy ? 0.5 : 1,
          }}
        >
          {adding ? (
            <ActivityIndicator size="small" color={colors.textSecondary} />
          ) : (
            <Text
              style={{
                fontSize: typeScale.footnote,
                fontWeight: '500',
                color: colors.textPrimary,
              }}
            >
              Invite
            </Text>
          )}
        </Pressable>
      </View>
      {addError ? (
        <Text
          accessibilityRole="alert"
          style={{ fontSize: typeScale.caption, color: colors.agentError }}
          testID="artifact-viewer-add-error"
        >
          {addError}
        </Text>
      ) : null}
      {state.status === 'loading' ? (
        <View
          style={{ minHeight: 44, alignItems: 'flex-start', justifyContent: 'center' }}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Loading invited people"
          testID="artifact-viewers-loading"
        >
          <ActivityIndicator size="small" color={colors.textSecondary} />
        </View>
      ) : state.status === 'failed' ? (
        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}
          testID="artifact-viewers-failed"
        >
          <Text style={{ fontSize: typeScale.footnote, color: colors.textSecondary }}>
            Could not load who this is shared with
          </Text>
          <Pressable
            onPress={() => void load()}
            accessibilityRole="button"
            accessibilityLabel="Retry loading invited people"
            testID="artifact-viewers-retry"
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Text
              style={{ fontSize: typeScale.footnote, fontWeight: '500', color: colors.textPrimary }}
            >
              Retry
            </Text>
          </Pressable>
        </View>
      ) : state.viewers.length === 0 ? (
        <Text
          style={{ fontSize: typeScale.footnote, color: colors.textSecondary }}
          testID="artifact-viewers-empty"
        >
          No one is invited yet. Only you can open it.
        </Text>
      ) : (
        <ScrollView
          nestedScrollEnabled
          style={{ maxHeight: windowHeight * VIEWER_LIST_HEIGHT_RATIO }}
          testID="artifact-viewers-list"
        >
          {state.viewers.map((viewer) => (
            <View
              key={viewer.email}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
              testID={`artifact-viewer-${viewer.email}`}
            >
              <Text
                style={{ flex: 1, fontSize: typeScale.footnote, color: colors.textPrimary }}
                numberOfLines={1}
              >
                {viewer.email}
              </Text>
              <Pressable
                onPress={() => void remove(viewer.email)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${viewer.email}`}
                accessibilityState={{ disabled: busy, busy: removing === viewer.email }}
                testID={`artifact-viewer-remove-${viewer.email}`}
                style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 }}
              >
                {removing === viewer.email ? (
                  <ActivityIndicator size="small" color={colors.agentError} />
                ) : (
                  <Text
                    style={{
                      fontSize: typeScale.footnote,
                      fontWeight: '500',
                      color: colors.agentError,
                    }}
                  >
                    Remove
                  </Text>
                )}
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
