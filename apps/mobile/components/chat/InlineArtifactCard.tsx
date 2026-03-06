import { View, Pressable, Platform } from 'react-native';
import {
  Code2,
  Mail,
  BookOpen,
  Image as ImageIcon,
  FileText,
  BarChart3,
  ExternalLink,
} from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { colors } from '@/lib/theme';
import type { Artifact } from '@/types/chat';

interface InlineArtifactCardProps {
  artifact: Artifact;
  onExpand: (artifact: Artifact) => void;
}

type ArtifactTypeConfig = {
  icon: typeof Code2;
  badgeColor: 'teal' | 'terra-cotta' | 'green' | 'red' | 'yellow' | 'purple' | 'blue' | 'gray';
  bgColor: string;
  label: string;
};

const FALLBACK_CONFIG: ArtifactTypeConfig = {
  icon: FileText,
  badgeColor: 'gray',
  bgColor: 'rgba(255, 255, 255, 0.05)',
  label: 'Content',
};

const TYPE_CONFIG: Record<string, ArtifactTypeConfig> = {
  code: {
    icon: Code2,
    badgeColor: 'teal',
    bgColor: 'rgba(33, 128, 141, 0.1)',
    label: 'Code',
  },
  email: {
    icon: Mail,
    badgeColor: 'blue',
    bgColor: 'rgba(59, 130, 246, 0.1)',
    label: 'Email',
  },
  research: {
    icon: BookOpen,
    badgeColor: 'purple',
    bgColor: 'rgba(168, 85, 247, 0.1)',
    label: 'Research',
  },
  image: {
    icon: ImageIcon,
    badgeColor: 'green',
    bgColor: 'rgba(16, 185, 129, 0.1)',
    label: 'Image',
  },
  chart: {
    icon: BarChart3,
    badgeColor: 'yellow',
    bgColor: 'rgba(245, 158, 11, 0.1)',
    label: 'Chart',
  },
  document: {
    icon: FileText,
    badgeColor: 'gray',
    bgColor: 'rgba(255, 255, 255, 0.05)',
    label: 'Document',
  },
};

/**
 * Generates a preview string for the artifact content.
 */
function getPreview(artifact: Artifact): string {
  const { type, content, metadata } = artifact;

  switch (type) {
    case 'code': {
      // Show first 2 non-empty lines
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

/**
 * ChatGPT-style inline rich card for artifacts.
 * Tappable to expand to full screen view.
 */
export function InlineArtifactCard({ artifact, onExpand }: InlineArtifactCardProps) {
  const config = TYPE_CONFIG[artifact.type] ?? FALLBACK_CONFIG;
  const Icon = config.icon;
  const preview = getPreview(artifact);

  return (
    <Pressable
      onPress={() => onExpand(artifact)}
      style={{
        backgroundColor: config.bgColor,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.06)',
        marginVertical: 6,
        overflow: 'hidden',
      }}
      accessibilityLabel={`${config.label}: ${artifact.title}`}
      accessibilityRole="button"
      accessibilityHint="Tap to expand"
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
            color: 'rgba(245, 247, 251, 0.55)',
            fontFamily:
              artifact.type === 'code'
                ? Platform.select({ ios: 'Menlo', default: 'monospace' })
                : undefined,
          }}
          numberOfLines={3}
        >
          {preview}
        </Text>
      </View>
    </Pressable>
  );
}
