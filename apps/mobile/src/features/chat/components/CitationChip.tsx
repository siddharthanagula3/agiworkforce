import { Alert } from 'react-native';
import type { AgentEventSource } from '@agiworkforce/types';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { ExternalLink } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { hostnameOf, isValidExternalHttpUrl } from '@/src/features/chat/utils/externalUrls';
import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import { formatSourcePublishedDate } from '@/src/features/chat/utils/sourcePublishedDate';

const MAX_PREVIEW_SNIPPET_LENGTH = 300;

function previewSnippet(snippet: string | undefined): string {
  const text = snippet?.trim() ?? '';
  return text.length > MAX_PREVIEW_SNIPPET_LENGTH
    ? `${text.slice(0, MAX_PREVIEW_SNIPPET_LENGTH).trimEnd()}…`
    : text;
}

export interface CitationSource extends Partial<AgentEventSource> {
  publishedDate?: string;
}

export function canPreviewCitation(source: CitationSource): boolean {
  return Boolean(source.url && isValidExternalHttpUrl(source.url));
}

export function previewCitation(source: CitationSource): void {
  const url = source.url;
  if (!url || !isValidExternalHttpUrl(url)) return;
  const published = formatSourcePublishedDate(source.publishedDate);
  const site = published ? `${hostnameOf(url)} · Published ${published}` : hostnameOf(url);
  const preview = previewSnippet(source.snippet);
  const openSource = async () => {
    const opened = await openUntrustedUrlInAppBrowser(url);
    if (!opened) {
      Alert.alert('Could not open citation', 'Check your connection and try again.');
    }
  };
  Alert.alert(source.title || hostnameOf(url), preview ? `${site}\n\n${preview}` : site, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Open page', onPress: () => void openSource() },
  ]);
}

interface CitationChipProps {
  index: number;
  title: string;
  url?: string;
  snippet?: string;
  publishedDate?: string;
}

export function CitationChip({ index, title, url, snippet, publishedDate }: CitationChipProps) {
  const colors = useThemeColors();
  const canOpen = canPreviewCitation(url ? { url } : {});
  const published = formatSourcePublishedDate(publishedDate);
  const handlePress = () => {
    previewCitation({
      title,
      ...(url ? { url } : {}),
      ...(snippet ? { snippet } : {}),
      ...(publishedDate ? { publishedDate } : {}),
    });
  };

  return (
    <Pressable
      onPress={canOpen ? handlePress : undefined}
      className="flex-row items-center gap-1.5 px-2.5 py-1 rounded-full"
      style={({ pressed }) => ({
        backgroundColor: pressed ? colors.surfaceHover : colors.accentSurface,
      })}
      accessibilityLabel={`Citation ${index}: ${title}${published ? `, published ${published}` : ''}`}
      accessibilityRole={canOpen ? 'link' : undefined}
      accessibilityHint={canOpen ? 'Shows the source, then opens it in the browser' : undefined}
    >
      <Text className="text-xs font-medium" style={{ color: colors.teal }}>
        [{index}]
      </Text>
      <Text className="text-xs" style={{ color: colors.textSecondary }} numberOfLines={1}>
        {title}
      </Text>
      {canOpen && <ExternalLink size={10} color={colors.teal} />}
    </Pressable>
  );
}
