import { Alert, View } from 'react-native';
import { useRouter } from 'expo-router';
import { FileText } from 'lucide-react-native';
import {
  PROJECT_FILE_CITATIONS_METADATA_KEY,
  dedupeProjectFileCitations,
  formatProjectFileAnchor,
  orderProjectFileCitationsByAnswer,
  parseProjectFileCitations,
  PROJECT_FILE_CITATION_FILE_PARAM,
  PROJECT_FILE_CITATION_PAGE_PARAM,
  projectFileCitationKey,
  projectFileCitationTarget,
  type ProjectFileCitation,
} from '@agiworkforce/types';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { radii, useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

const CHIP_HEIGHT = 28;
const CHIP_HIT_SLOP = { top: 8, bottom: 8, left: 2, right: 2 };

export function projectFileCitationsFromMetadata(metadata: unknown): ProjectFileCitation[] {
  if (typeof metadata !== 'object' || metadata === null) return [];
  return dedupeProjectFileCitations(
    parseProjectFileCitations(
      (metadata as Record<string, unknown>)[PROJECT_FILE_CITATIONS_METADATA_KEY],
    ),
  );
}

function projectFileRoute(citation: ProjectFileCitation) {
  const target = projectFileCitationTarget(citation);
  if (!target) return null;
  return {
    pathname: '/(app)/projects/[id]' as const,
    params: {
      id: target.projectId,
      [PROJECT_FILE_CITATION_FILE_PARAM]: target.fileId,
      ...(target.page !== undefined
        ? { [PROJECT_FILE_CITATION_PAGE_PARAM]: String(target.page) }
        : {}),
    },
  };
}

function ProjectFileChip({ citation }: { citation: ProjectFileCitation }) {
  const colors = useThemeColors();
  const router = useRouter();
  const location = formatProjectFileAnchor(citation.anchor);
  const target = projectFileRoute(citation);
  const label = location
    ? `Project file ${citation.fileName}, ${location}`
    : `Project file ${citation.fileName}`;
  const canPreview = Boolean(target || citation.snippet);

  const preview = () => {
    const message = [location, citation.snippet].filter(Boolean).join('\n\n');
    Alert.alert(
      citation.fileName,
      message || undefined,
      target
        ? [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open file', onPress: () => router.push(target) },
          ]
        : [{ text: 'OK' }],
    );
  };

  return (
    <PressableBox
      onPress={canPreview ? preview : undefined}
      disabled={!canPreview}
      hitSlop={CHIP_HIT_SLOP}
      accessibilityRole={target ? 'link' : 'text'}
      accessibilityLabel={label}
      accessibilityHint={
        target ? 'Shows the passage, then opens the file in the project' : undefined
      }
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        maxWidth: '100%',
        minHeight: CHIP_HEIGHT,
        paddingHorizontal: 10,
        borderRadius: radii.full,
        backgroundColor: pressed ? colors.surfaceHover : colors.inputSurface,
      })}
    >
      <FileText size={14} color={colors.textMuted} />
      <Text
        numberOfLines={1}
        style={{ flexShrink: 1, fontSize: typeScale.footnote, color: colors.textSecondary }}
      >
        {citation.fileName}
      </Text>
      {location ? (
        <Text numberOfLines={1} style={{ fontSize: typeScale.footnote, color: colors.textMuted }}>
          {`· ${location}`}
        </Text>
      ) : null}
    </PressableBox>
  );
}

export function ProjectFileCitations({
  citations,
  answerText = '',
}: {
  citations: readonly ProjectFileCitation[];
  answerText?: string;
}) {
  if (citations.length === 0) return null;
  const ordered = orderProjectFileCitationsByAnswer(citations, answerText);
  return (
    <View
      accessibilityLabel="Project files used in this answer"
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}
    >
      {ordered.map((citation) => (
        <ProjectFileChip key={projectFileCitationKey(citation)} citation={citation} />
      ))}
    </View>
  );
}
