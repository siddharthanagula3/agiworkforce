import { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import {
  Code2,
  Mail,
  BookOpen,
  Image as ImageIcon,
  FileText,
  BarChart3,
  ExternalLink,
  Share2,
} from 'lucide-react-native';
import { withoutTitleDirectives } from '@agiworkforce/artifacts';
import { bareMediaType, summarizeGeneratedFileBundle } from '@agiworkforce/types';
import { Text } from '@/components/ui/Text';
import { useThemeColors, type ColorScheme } from '@/src/ui/theme';
import { codeFontFamily } from '@/src/ui/theme/codeFont';
import { typeScale } from '@/src/ui/theme/tokens';
import type { Artifact } from '@/types/chat';
import { ArtifactAudienceChip } from './ArtifactAudienceChip';
import { ImageFullScreen } from './ImageFullScreen';
import { StoredImageView } from './artifact-viewers/StoredImageView';
import { localFileCopy } from './artifact-viewers/useLocalFileCopy';
import { storedImagePath } from './artifact-viewers/viewerKind';
import { deckSlides, isDeckArtifact } from './artifact-viewers/presentation/deckContent';
import {
  studyArtifactContent,
  studyArtifactTitle,
  studySummary,
} from './artifact-viewers/study/studyContent';
import { withoutArtifactMarker } from '@/src/features/chat/utils/artifactMarker';
import { shareFile } from '@/services/fileCreation';
import { toUserMessage } from '@/services/userMessage';
import { radii } from '@/src/ui/theme/tokens';

interface InlineArtifactCardProps {
  artifact: Artifact;
  onExpand: (artifact: Artifact) => void;
}

type ArtifactTypeConfig = {
  icon: typeof Code2;
  badgeColor: 'teal' | 'terra-cotta' | 'green' | 'red' | 'yellow' | 'purple' | 'blue' | 'gray';
  label: string;
};

const FALLBACK_CONFIG: ArtifactTypeConfig = {
  icon: FileText,
  badgeColor: 'gray',
  label: 'Content',
};

const TYPE_CONFIG: Record<string, ArtifactTypeConfig> = {
  code: {
    icon: Code2,
    badgeColor: 'teal',
    label: 'Code',
  },
  email: {
    icon: Mail,
    badgeColor: 'blue',
    label: 'Email',
  },
  research: {
    icon: BookOpen,
    badgeColor: 'purple',
    label: 'Research',
  },
  image: {
    icon: ImageIcon,
    badgeColor: 'green',
    label: 'Image',
  },
  chart: {
    icon: BarChart3,
    badgeColor: 'yellow',
    label: 'Chart',
  },
  document: {
    icon: FileText,
    badgeColor: 'gray',
    label: 'Document',
  },
};

function artifactSurface(color: ArtifactTypeConfig['badgeColor'], colors: ColorScheme): string {
  switch (color) {
    case 'green':
      return colors.successSurface;
    case 'yellow':
      return colors.warningSurface;
    case 'red':
    case 'terra-cotta':
      return colors.dangerSurface;
    case 'purple':
      return colors.purpleSurface;
    case 'blue':
    case 'teal':
      return colors.accentSurface;
    case 'gray':
      return colors.surfaceElevated;
  }
}

function withoutSourceDirectives(content: string): string {
  return withoutTitleDirectives(withoutArtifactMarker(content)).trimStart();
}

function getPreview(artifact: Artifact): string {
  const { type, content, metadata } = artifact;
  if (isDeckArtifact(artifact.language, content)) {
    const count = deckSlides(content).length;
    return `Presentation, ${count} slide${count === 1 ? '' : 's'}`;
  }
  const study = studyArtifactContent(artifact.language, content);
  if (study !== null) return studySummary(study) || 'Open to practise';

  switch (type) {
    case 'code':
      return withoutSourceDirectives(content)
        .split('\n')
        .filter((line) => line.trim())
        .slice(0, 2)
        .join('\n');
    case 'email': {
      const from = (metadata?.from as string) ?? '';
      const to = (metadata?.to as string) ?? '';
      const subject = (metadata?.subject as string) ?? '';
      const parts: string[] = [];
      if (from) parts.push(`From: ${from}`);
      if (to) parts.push(`To: ${to}`);
      if (subject) parts.push(`Subject: ${subject}`);
      return parts.join('\n') || content.slice(0, 80);
    }
    case 'research': {
      const citations = (metadata?.citations as number) ?? 0;
      const summary = content.slice(0, 100);
      return citations ? `${citations} citations - ${summary}` : summary;
    }
    case 'image': {
      return (metadata?.alt as string) ?? (metadata?.description as string) ?? 'Image';
    }
    default:
      return withoutSourceDirectives(content).slice(0, 100);
  }
}

function generatedImagePath(artifact: Artifact): string | null {
  const file = artifact.generatedFile;
  if (!file?.uri || !bareMediaType(file.mimeType).startsWith('image/')) return null;
  return storedImagePath(file.uri);
}

function GeneratedImageCard({ artifact, path }: { artifact: Artifact; path: string }) {
  const [viewing, setViewing] = useState(false);
  const name = artifact.generatedFile?.fileName ?? artifact.title;
  return (
    <>
      <PressableBox
        testID="generated-image-card"
        onPress={() => setViewing(true)}
        accessibilityRole="imagebutton"
        accessibilityLabel={name}
        accessibilityHint="Opens the image full screen"
        style={{ marginVertical: 6, borderRadius: radii.lg, overflow: 'hidden' }}
      >
        <StoredImageView path={path} label={name} />
      </PressableBox>
      <ImageFullScreen
        imageUrl={path}
        kind="attachment"
        name={name}
        mimeType={artifact.generatedFile?.mimeType}
        visible={viewing}
        onClose={() => setViewing(false)}
      />
    </>
  );
}

function GeneratedFileShareButton({ artifact }: { artifact: Artifact }) {
  const colors = useThemeColors();
  const [sharing, setSharing] = useState(false);
  const file = artifact.generatedFile;
  const handleShare = useCallback(() => {
    if (!file?.uri || sharing) return;
    setSharing(true);
    void localFileCopy(file.uri, file.fileName)
      .then((uri) => shareFile(uri))
      .catch((error: unknown) =>
        Alert.alert('Could not share file', toUserMessage(error, 'Try again in a moment.')),
      )
      .finally(() => setSharing(false));
  }, [file, sharing]);
  if (!file?.uri) return null;
  return (
    <PressableBox
      testID="generated-file-share"
      onPress={handleShare}
      disabled={sharing}
      accessibilityRole="button"
      accessibilityLabel={`Share ${file.fileName}`}
      accessibilityState={{ disabled: sharing, busy: sharing }}
      hitSlop={12}
      style={{ minWidth: 20, minHeight: 20, alignItems: 'center', justifyContent: 'center' }}
    >
      <Share2 size={14} color={colors.textMuted} />
    </PressableBox>
  );
}

export function InlineArtifactCard({ artifact, onExpand }: InlineArtifactCardProps) {
  const imagePath = generatedImagePath(artifact);
  if (imagePath) return <GeneratedImageCard artifact={artifact} path={imagePath} />;
  return <ArtifactSummaryCard artifact={artifact} onExpand={onExpand} />;
}

function ArtifactSummaryCard({ artifact, onExpand }: InlineArtifactCardProps) {
  const colors = useThemeColors();
  const config = TYPE_CONFIG[artifact.type] ?? FALLBACK_CONFIG;
  const Icon = config.icon;
  const title = studyArtifactTitle(artifact.language, artifact.content) ?? artifact.title;
  const generatedFileSummary = summarizeGeneratedFileBundle({
    computeSession: artifact.computeSession,
    generatedFile: artifact.generatedFile,
    artifactManifest: artifact.artifactManifest,
    fallbackFileName: title,
    fallbackKind: artifact.generatedFile?.kind ?? artifact.language ?? artifact.type,
    fallbackMimeType: artifact.generatedFile?.mimeType,
    fallbackUri: artifact.generatedFile?.uri,
    fallbackStatus:
      (typeof artifact.metadata?.status === 'string' ? artifact.metadata.status : undefined) ??
      artifact.computeSession?.status,
  });
  const hasGeneratedFileManifest = Boolean(
    artifact.computeSession || artifact.generatedFile || artifact.artifactManifest,
  );
  const fileMeta = hasGeneratedFileManifest
    ? [
        generatedFileSummary.statusLabel,
        generatedFileSummary.kindLabel,
        generatedFileSummary.byteCountLabel,
      ]
        .filter(Boolean)
        .join(' · ')
    : null;
  const preview = getPreview(artifact).trim() || (fileMeta ? '' : 'Open to view details');

  return (
    <PressableBox
      onPress={() => onExpand(title === artifact.title ? artifact : { ...artifact, title })}
      style={{
        backgroundColor: artifactSurface(config.badgeColor, colors),
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        marginVertical: 6,
        overflow: 'hidden',
      }}
      accessibilityLabel={`${config.label}: ${title}`}
      accessibilityRole="button"
      accessibilityHint={
        hasGeneratedFileManifest ? 'Tap for file details and download options' : 'Tap to expand'
      }
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 12,
          paddingTop: 10,
          paddingBottom: 6,
          gap: 8,
        }}
      >
        <Icon size={16} color={colors.textSecondary} />
        <Text
          style={{
            flex: 1,
            fontSize: typeScale.footnote,
            fontWeight: '600',
            color: colors.textPrimary,
          }}
          numberOfLines={1}
        >
          {title}
        </Text>
        {fileMeta ? null : (
          <Text
            style={{
              fontSize: typeScale.caption,
              color: colors.textMuted,
              textTransform: 'uppercase',
            }}
          >
            {artifact.language ?? config.label}
          </Text>
        )}
        <ArtifactAudienceChip artifactId={artifact.id} />
        {hasGeneratedFileManifest ? <GeneratedFileShareButton artifact={artifact} /> : null}
        <ExternalLink size={12} color={colors.textMuted} />
      </View>

      <View
        style={{
          paddingHorizontal: 12,
          paddingBottom: 10,
        }}
      >
        {preview ? (
          <Text
            style={{
              fontSize: typeScale.caption,
              lineHeight: 18,
              color: colors.textMuted,
              fontFamily: artifact.type === 'code' ? codeFontFamily : undefined,
            }}
            numberOfLines={3}
          >
            {preview}
          </Text>
        ) : null}
        {fileMeta ? (
          <Text
            testID="generated-file-meta"
            style={{
              ...(preview ? { marginTop: 8 } : {}),
              fontSize: typeScale.caption,
              color: colors.textMuted,
            }}
            numberOfLines={1}
          >
            {fileMeta}
          </Text>
        ) : null}
      </View>
    </PressableBox>
  );
}
