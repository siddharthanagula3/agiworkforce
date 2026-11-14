import { View } from 'react-native';
import { DollarSign, Eye, FileText, Zap, type LucideIcon } from 'lucide-react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { MODEL_FILTERS, type ModelFilterId } from '@/src/features/model-picker/modelFilters';
import { useThemeColors, radii } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

const FILTER_ICON: Record<ModelFilterId, LucideIcon> = {
  instant: Zap,
  economy: DollarSign,
  images: Eye,
  files: FileText,
};

interface ModelFilterChipsProps {
  active: readonly ModelFilterId[];
  onToggle: (id: ModelFilterId) => void;
}

export function ModelFilterChips({ active, onToggle }: ModelFilterChipsProps) {
  const colors = useThemeColors();
  return (
    <View
      testID="model-filters"
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        marginHorizontal: 16,
        marginBottom: 12,
      }}
    >
      {MODEL_FILTERS.map((filter) => {
        const on = active.includes(filter.id);
        const Icon = FILTER_ICON[filter.id];
        const ink = on ? colors.surfaceBase : colors.textPrimary;
        return (
          <PressableBox
            key={filter.id}
            testID={`model-filter-${filter.id}`}
            onPress={() => onToggle(filter.id)}
            hitSlop={{ top: 4, bottom: 4 }}
            accessibilityRole="button"
            accessibilityLabel={`${filter.label} models only`}
            accessibilityState={{ selected: on }}
            style={{
              minHeight: 36,
              paddingHorizontal: 10,
              borderRadius: radii.full,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              backgroundColor: on ? colors.textPrimary : colors.neutralSurface,
            }}
          >
            <Icon size={15} color={ink} />
            <Text style={{ color: ink, fontSize: typeScale.footnote, fontWeight: '600' }}>
              {filter.label}
            </Text>
          </PressableBox>
        );
      })}
    </View>
  );
}
