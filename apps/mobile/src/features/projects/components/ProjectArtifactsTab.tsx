import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { FileCode2 } from 'lucide-react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import {
  fetchProjectArtifacts,
  type IndexedProjectArtifact,
} from '@/src/features/projects/projectArtifacts';
import { formatRelativeTime } from '@agiworkforce/utils/format';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; artifacts: IndexedProjectArtifact[] };

export function ProjectArtifactsTab({ projectId }: { projectId: string }) {
  const colors = useThemeColors();
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    void fetchProjectArtifacts(projectId, controller.signal)
      .then((artifacts) => {
        if (!controller.signal.aborted) setState({ status: 'ready', artifacts });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'error' });
      });
    return () => controller.abort();
  }, [projectId]);

  if (state.status === 'loading') {
    return (
      <ActivityIndicator
        accessibilityLabel="Loading artifacts"
        color={colors.textSecondary}
        style={{ marginTop: 32 }}
      />
    );
  }

  if (state.status === 'error' || state.artifacts.length === 0) {
    return (
      <View testID="project-artifacts-empty" style={{ alignItems: 'center', padding: 32, gap: 6 }}>
        <Text style={{ color: colors.textPrimary, fontSize: typeScale.subhead, fontWeight: '600' }}>
          {state.status === 'error' ? 'Artifacts could not be loaded' : 'No artifacts yet'}
        </Text>
        <Text
          style={{ color: colors.textSecondary, fontSize: typeScale.footnote, textAlign: 'center' }}
        >
          {state.status === 'error'
            ? 'Check your connection and open this tab again.'
            : 'Documents, code and charts made in this project’s chats show up here.'}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 40 }}>
      {state.artifacts.map((artifact) => (
        <PressableBox
          key={artifact.id}
          onPress={() =>
            router.push({ pathname: '/(app)/chat/[id]', params: { id: artifact.conversationId } })
          }
          accessibilityRole="button"
          accessibilityLabel={`Open ${artifact.title ?? 'Untitled artifact'} in its chat`}
          style={{
            minHeight: 56,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingHorizontal: 14,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surfaceElevated,
          }}
        >
          <FileCode2 size={18} color={colors.textSecondary} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text numberOfLines={1} style={{ color: colors.textPrimary, fontSize: typeScale.body }}>
              {artifact.title ?? 'Untitled artifact'}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: typeScale.footnote }}>
              {`${artifact.type} · ${formatRelativeTime(artifact.createdAt)}`}
            </Text>
          </View>
        </PressableBox>
      ))}
    </ScrollView>
  );
}
