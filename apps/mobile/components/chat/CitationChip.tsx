import { Pressable, Linking } from 'react-native';
import { ExternalLink } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { colors } from '@/lib/theme';

interface CitationChipProps {
  index: number;
  title: string;
  url?: string;
}

export function CitationChip({ index, title, url }: CitationChipProps) {
  const handlePress = () => {
    if (url) {
      Linking.openURL(url);
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      className="flex-row items-center gap-1.5 px-2.5 py-1 rounded-full bg-teal-500/15 active:bg-teal-500/25"
    >
      <Text className="text-[11px] font-medium text-teal-400">
        [{index}]
      </Text>
      <Text className="text-[11px] text-teal-300" numberOfLines={1}>
        {title}
      </Text>
      {url && <ExternalLink size={10} color={colors.teal} />}
    </Pressable>
  );
}
