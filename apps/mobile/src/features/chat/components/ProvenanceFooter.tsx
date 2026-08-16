import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';

interface ProvenanceFooterProps {
  provider?: string;
  model?: string;
}

export function ProvenanceFooter({ provider, model }: ProvenanceFooterProps) {
  const c = useThemeColors();
  if (!provider && !model) return null;

  const label = [provider, model].filter(Boolean).join(' · ');

  return (
    <View style={{ marginTop: 4, paddingHorizontal: 2 }}>
      <Text
        style={{
          fontSize: 11,
          color: c.textMuted,
          letterSpacing: 0.1,
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}
