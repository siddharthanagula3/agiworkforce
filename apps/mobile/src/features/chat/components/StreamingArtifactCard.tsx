import { useMemo, useState } from 'react';
import { View, Platform } from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import { Code2 } from 'lucide-react-native';
import {
  computeDerivedArtifactId,
  extractCodeBlocks,
  extractTrailingUnclosedBlock,
} from '@agiworkforce/artifacts';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import type { Artifact } from '@/types/chat';
import { ArtifactFullScreen } from './ArtifactFullScreen';

const STREAMING_ARTIFACT_MIN_LINES = 4;
const STREAMING_ARTIFACT_TITLE = 'Generating artifact';
const STOPPED_ARTIFACT_TITLE = 'Stopped artifact';
const INTERRUPTED_ARTIFACT_NOTICE =
  'This artifact stopped before it finished. What arrived is kept; regenerate for the whole document.';

interface StreamingArtifactCardProps {
  conversationId: string;
  messageId: string;
  content: string;
  isStreaming: boolean;
  failed: boolean;
  finalArtifacts: Artifact[];
}

export function StreamingArtifactCard({
  conversationId,
  messageId,
  content,
  isStreaming,
  failed,
  finalArtifacts,
}: StreamingArtifactCardProps) {
  const colors = useThemeColors();
  const [opened, setOpened] = useState<{ id: string; ordinal: number } | null>(null);

  const artifact = useMemo<(Artifact & { ordinal: number }) | null>(() => {
    const block = extractTrailingUnclosedBlock(content);
    if (!block) return null;
    if (block.content.split('\n').length < STREAMING_ARTIFACT_MIN_LINES) return null;
    return {
      ordinal: block.ordinal,
      id: computeDerivedArtifactId(conversationId, messageId, block.ordinal),
      type: 'code',
      title: isStreaming ? STREAMING_ARTIFACT_TITLE : STOPPED_ARTIFACT_TITLE,
      content: block.content,
      ...(block.language ? { language: block.language } : {}),
    };
  }, [content, conversationId, isStreaming, messageId]);
  const stateLabel = isStreaming ? 'Writing…' : failed ? 'Failed' : 'Stopped';

  const viewed = useMemo<Artifact | null>(() => {
    if (!opened) return null;
    if (artifact?.id === opened.id) return artifact;
    const saved = finalArtifacts.find((candidate) => candidate.id === opened.id);
    if (saved) return saved;
    const closed = extractCodeBlocks(content)[opened.ordinal];
    const unclosed = closed ? null : extractTrailingUnclosedBlock(content);
    const block = closed ?? unclosed;
    if (!block) return null;
    return {
      id: opened.id,
      type: 'code',
      title: closed ? STREAMING_ARTIFACT_TITLE : STOPPED_ARTIFACT_TITLE,
      content: block.content,
      ...(block.language ? { language: block.language } : {}),
    };
  }, [artifact, content, finalArtifacts, opened]);

  const viewer = viewed ? (
    <ArtifactFullScreen artifact={viewed} visible onClose={() => setOpened(null)} />
  ) : null;

  if (!artifact) return viewer;

  const tail = artifact.content
    .split('\n')
    .filter((line) => line.trim())
    .slice(-2)
    .join('\n');
  const typeLabel = (artifact.language ?? 'code').toUpperCase();

  return (
    <>
      <PressableBox
        onPress={() => setOpened({ id: artifact.id, ordinal: artifact.ordinal })}
        accessibilityRole="button"
        accessibilityLabel={`${artifact.title}, ${typeLabel}, ${stateLabel}`}
        style={{
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surfaceElevated,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 12,
            paddingTop: 10,
            paddingBottom: 6,
          }}
        >
          <Code2 size={14} color={colors.textSecondary} />
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              fontSize: typeScale.footnote,
              fontWeight: '600',
              color: colors.textPrimary,
            }}
          >
            {`${artifact.title} · ${typeLabel}`}
          </Text>
          <Text
            style={{
              fontSize: typeScale.caption,
              color: failed ? colors.agentError : colors.textMuted,
            }}
          >
            {stateLabel}
          </Text>
        </View>
        <Text
          style={{
            paddingHorizontal: 12,
            paddingBottom: 10,
            fontSize: typeScale.caption,
            lineHeight: 18,
            color: colors.textMuted,
            fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
          }}
          numberOfLines={2}
        >
          {tail}
        </Text>
        {isStreaming ? null : (
          <Text
            style={{
              paddingHorizontal: 12,
              paddingBottom: 10,
              fontSize: typeScale.caption,
              color: colors.textSecondary,
            }}
          >
            {INTERRUPTED_ARTIFACT_NOTICE}
          </Text>
        )}
      </PressableBox>
      {viewer}
    </>
  );
}
