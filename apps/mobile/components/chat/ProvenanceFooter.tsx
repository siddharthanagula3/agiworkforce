import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/hooks/useTheme';

interface ProvenanceFooterProps {
  /** Provider label shown at base of each assistant message bubble */
  provider?: string;
  model?: string;
}

/**
 * Minimal one-line footer shown beneath each assistant message.
 * Displays the provider and model name used to generate the response.
 * Omitted entirely for user messages.
 */
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
