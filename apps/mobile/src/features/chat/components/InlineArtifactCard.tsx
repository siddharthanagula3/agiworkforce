import { View, Pressable, Platform } from 'react-native';
import {
  Code2,
  Mail,
  BookOpen,
  Image as ImageIcon,
  FileText,
  BarChart3,
  ExternalLink,
  Shield,
} from 'lucide-react-native';
import { summarizeGeneratedFileBundle } from '@agiworkforce/types';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { useThemeColors, type ColorScheme } from '@/src/ui/theme';
import type { Artifact } from '@/types/chat';

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

function getPreview(artifact: Artifact): string {
  const { type, content, metadata } = artifact;

  switch (type) {
    case 'code': {
      const lines = content
        .split('\n')
        .filter((l) => l.trim())
        .slice(0, 2);
      return lines.join('\n');
    }
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
      return content.slice(0, 100);
  }
}

export function InlineArtifactCard({ artifact, onExpand }: InlineArtifactCardProps) {
  const colors = useThemeColors();
  const config = TYPE_CONFIG[artifact.type] ?? FALLBACK_CONFIG;
  const Icon = config.icon;
  const generatedFileSummary = summarizeGeneratedFileBundle({
    computeSession: artifact.computeSession,
    generatedFile: artifact.generatedFile,
    artifactManifest: artifact.artifactManifest,
    fallbackFileName: artifact.title,
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
  const preview =
    getPreview(artifact).trim() ||
    (hasGeneratedFileManifest
      ? [
          generatedFileSummary.statusLabel,
          generatedFileSummary.kindLabel,
          generatedFileSummary.byteCountLabel,
        ]
          .filter(Boolean)
          .join(' · ')
      : 'Open to view details');

  return (
    <Pressable
      onPress={() => onExpand(artifact)}
      style={{
        backgroundColor: artifactSurface(config.badgeColor, colors),
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        marginVertical: 6,
        overflow: 'hidden',
      }}
      accessibilityLabel={`${config.label}: ${artifact.title}`}
      accessibilityRole="button"
      accessibilityHint={
        hasGeneratedFileManifest ? 'Tap for file details and download options' : 'Tap to expand'
      }
    >
      {/* Header */}
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
            fontSize: 13,
            fontWeight: '600',
            color: colors.textPrimary,
          }}
          numberOfLines={1}
        >
          {artifact.title}
        </Text>
        <Badge label={artifact.language ?? config.label} color={config.badgeColor} />
        {hasGeneratedFileManifest && generatedFileSummary.privacyShortLabel ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 3,
              borderRadius: 6,
              paddingHorizontal: 6,
              paddingVertical: 3,
              backgroundColor: colors.neutralSurface,
            }}
          >
            <Shield size={10} color={colors.textMuted} />
            <Text style={{ fontSize: 10, fontWeight: '600', color: colors.textMuted }}>
              {generatedFileSummary.privacyShortLabel}
            </Text>
          </View>
        ) : null}
        <ExternalLink size={12} color={colors.textMuted} />
      </View>

      {/* Preview content */}
      <View
        style={{
          paddingHorizontal: 12,
          paddingBottom: 10,
        }}
      >
        <Text
          style={{
            fontSize: 12,
            lineHeight: 18,
            color: colors.textMuted,
            fontFamily:
              artifact.type === 'code'
                ? Platform.select({ ios: 'Menlo', default: 'monospace' })
                : undefined,
          }}
          numberOfLines={3}
        >
          {preview}
        </Text>
        {hasGeneratedFileManifest ? (
          <View style={{ marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <Text style={{ fontSize: 10, color: colors.textMuted }}>
              {generatedFileSummary.statusLabel}
            </Text>
            <Text style={{ fontSize: 10, color: colors.textMuted }}>
              {generatedFileSummary.kindLabel}
            </Text>
            {generatedFileSummary.byteCountLabel ? (
              <Text style={{ fontSize: 10, color: colors.textMuted }}>
                {generatedFileSummary.byteCountLabel}
              </Text>
            ) : null}
            {generatedFileSummary.sourceSurfaceLabel ? (
              <Text style={{ fontSize: 10, color: colors.textMuted }}>
                Source: {generatedFileSummary.sourceSurfaceLabel}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
