import { Alert } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { ExternalLink } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { hostnameOf, isValidExternalHttpUrl } from '@/src/features/chat/utils/externalUrls';
import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';

const MAX_PREVIEW_SNIPPET_LENGTH = 300;

function previewSnippet(snippet: string | undefined): string {
  const text = snippet?.trim() ?? '';
  return text.length > MAX_PREVIEW_SNIPPET_LENGTH
    ? `${text.slice(0, MAX_PREVIEW_SNIPPET_LENGTH).trimEnd()}…`
    : text;
}

interface CitationChipProps {
  index: number;
  title: string;
  url?: string;
  snippet?: string;
}

export function CitationChip({ index, title, url, snippet }: CitationChipProps) {
  const colors = useThemeColors();
  const canOpen = Boolean(url && isValidExternalHttpUrl(url));
  const openSource = async () => {
    if (!canOpen || !url) return;
    const opened = await openUntrustedUrlInAppBrowser(url);
    if (!opened) {
      Alert.alert('Could not open citation', 'Check your connection and try again.');
    }
  };
  const handlePress = () => {
    if (!canOpen || !url) return;
    const site = hostnameOf(url);
    const preview = previewSnippet(snippet);
    Alert.alert(title, preview ? `${site}\n\n${preview}` : site, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Open page', onPress: () => void openSource() },
    ]);
  };

  return (
    <Pressable
      onPress={canOpen ? handlePress : undefined}
      className="flex-row items-center gap-1.5 px-2.5 py-1 rounded-full"
      style={({ pressed }) => ({
        backgroundColor: pressed ? colors.surfaceHover : colors.accentSurface,
      })}
      accessibilityLabel={`Citation ${index}: ${title}`}
      accessibilityRole={canOpen ? 'link' : undefined}
      accessibilityHint={canOpen ? 'Shows the source, then opens it in the browser' : undefined}
    >
      <Text className="text-[11px] font-medium" style={{ color: colors.teal }}>
        [{index}]
      </Text>
      <Text className="text-[11px]" style={{ color: colors.textSecondary }} numberOfLines={1}>
        {title}
      </Text>
      {canOpen && <ExternalLink size={10} color={colors.teal} />}
    </Pressable>
  );
}
