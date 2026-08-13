import { Alert } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { ExternalLink } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { isValidExternalHttpUrl } from '@/src/features/chat/utils/externalUrls';
import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';

interface CitationChipProps {
  index: number;
  title: string;
  url?: string;
}

export function CitationChip({ index, title, url }: CitationChipProps) {
  const colors = useThemeColors();
  const canOpen = Boolean(url && isValidExternalHttpUrl(url));
  const handlePress = async () => {
    if (canOpen && url) {
      const opened = await openUntrustedUrlInAppBrowser(url);
      if (!opened) {
        Alert.alert('Could not open citation', 'Check your connection and try again.');
      }
    }
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
      accessibilityHint={canOpen ? 'Opens source in browser' : undefined}
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
