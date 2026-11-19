import { Alert } from 'react-native';
import type { AgentEventSource } from '@agiworkforce/types';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { ExternalLink } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import {
  canOpenSource,
  openSource,
  sourcePublisher,
  sourceSnippet,
} from '@/src/features/chat/utils/sourceDisplay';
import { formatSourcePublishedDate } from '@/src/features/chat/utils/sourcePublishedDate';
import {
  citationRetrievedLabel,
  citationSnippet,
} from '@agiworkforce/unified-chat/citation-publisher';

const CHIP_HIT_SLOP = { top: 10, bottom: 10, left: 4, right: 4 };

export interface CitationSource extends Partial<AgentEventSource> {
  publishedDate?: string;
  retrievedAt?: string;
}

export function canPreviewCitation(source: CitationSource): boolean {
  return canOpenSource(source.url);
}

export function citationPreviewSite(source: CitationSource & { url: string }): string {
  const published = formatSourcePublishedDate(source.publishedDate);
  const retrieved = citationRetrievedLabel(source);
  return [
    sourcePublisher({ url: source.url, ...(source.title ? { title: source.title } : {}) }),
    published ? `Published ${published}` : null,
    retrieved ?? null,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function previewCitation(source: CitationSource): void {
  const url = source.url;
  if (!canOpenSource(url)) return;
  const site = citationPreviewSite({ ...source, url });
  const preview = citationSnippet({ snippet: sourceSnippet(source) }) ?? '';
  Alert.alert(source.title || sourcePublisher({ url }), preview ? `${site}\n\n${preview}` : site, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Open page', onPress: () => void openSource(url, 'Could not open citation') },
  ]);
}

interface CitationChipProps {
  index: number;
  title: string;
  url?: string;
  snippet?: string;
  publishedDate?: string;
  retrievedAt?: string;
}

export function CitationChip({
  index,
  title,
  url,
  snippet,
  publishedDate,
  retrievedAt,
}: CitationChipProps) {
  const colors = useThemeColors();
  const canOpen = canOpenSource(url);
  const published = formatSourcePublishedDate(publishedDate);
  const handlePress = () => {
    previewCitation({
      title,
      ...(url ? { url } : {}),
      ...(snippet ? { snippet } : {}),
      ...(publishedDate ? { publishedDate } : {}),
      ...(retrievedAt ? { retrievedAt } : {}),
    });
  };

  return (
    <Pressable
      onPress={canOpen ? handlePress : undefined}
      disabled={!canOpen}
      hitSlop={CHIP_HIT_SLOP}
      className="flex-row items-center gap-1.5 px-2.5 py-1 rounded-full"
      style={({ pressed }) => ({
        minHeight: 24,
        backgroundColor: pressed ? colors.surfaceHover : colors.accentSurface,
      })}
      accessibilityLabel={`Citation ${index}: ${title}${published ? `, published ${published}` : ''}`}
      accessibilityRole={canOpen ? 'link' : 'text'}
      accessibilityHint={canOpen ? 'Shows the source, then opens it in the browser' : undefined}
    >
      <Text className="text-sm font-medium" style={{ color: colors.teal }}>
        [{index}]
      </Text>
      <Text className="text-sm" style={{ color: colors.textSecondary }} numberOfLines={1}>
        {title}
      </Text>
      {canOpen && <ExternalLink size={10} color={colors.teal} />}
    </Pressable>
  );
}
