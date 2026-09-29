import { ScrollView } from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import { FileCode } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import type { Artifact } from '@/types/chat';

interface ArtifactSwitcherProps {
  artifacts: Artifact[];
  activeId: string;
  onSelect: (artifact: Artifact) => void;
}

export function ArtifactSwitcher({ artifacts, activeId, onSelect }: ArtifactSwitcherProps) {
  const colors = useThemeColors();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 6 }}
      style={{ flexGrow: 0, marginTop: 8 }}
      accessibilityRole="tablist"
      accessibilityLabel={`${artifacts.length} artifacts in this chat`}
    >
      {artifacts.map((item) => {
        const selected = item.id === activeId;
        return (
          <PressableBox
            key={item.id}
            onPress={() => {
              if (!selected) onSelect(item);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={item.title}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              maxWidth: 200,
              minHeight: 32,
              paddingHorizontal: 10,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: selected ? colors.accentBorder : colors.border,
              backgroundColor: selected ? colors.neutralSurface : colors.transparent,
            }}
          >
            <FileCode size={13} color={colors.textSecondary} />
            <Text
              numberOfLines={1}
              style={{
                flexShrink: 1,
                fontSize: typeScale.caption,
                fontWeight: selected ? '600' : '500',
                color: selected ? colors.textPrimary : colors.textSecondary,
              }}
            >
              {item.title}
            </Text>
          </PressableBox>
        );
      })}
    </ScrollView>
  );
}
