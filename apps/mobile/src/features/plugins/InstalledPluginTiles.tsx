import { ScrollView } from 'react-native';

import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import { HEADER_TEXT_SCALE_LIMIT, typeScale } from '@/src/ui/theme/tokens';
import { pluginTileLetter } from './pluginsModel';

export const SCREEN_GUTTER = 16;

const TILE_SIZE = 48;
const TILE_RADIUS = 12;
const TILE_GAP = 12;

export interface InstalledPluginTile {
  id: string;
  name: string;
}

export function InstalledPluginTiles({
  tiles,
  overflow,
  onOpen,
  onShowAll,
}: {
  tiles: readonly InstalledPluginTile[];
  overflow: number;
  onOpen: (id: string) => void;
  onShowAll: () => void;
}) {
  const colors = useThemeColors();
  const tileStyle = {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: TILE_RADIUS,
    borderCurve: 'continuous' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.neutralSurface,
  };
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -SCREEN_GUTTER }}
      contentContainerStyle={{ paddingHorizontal: SCREEN_GUTTER, gap: TILE_GAP }}
    >
      {tiles.map((tile) => (
        <PressableBox
          key={tile.id}
          onPress={() => onOpen(tile.id)}
          accessibilityRole="button"
          accessibilityLabel={`${tile.name}, installed`}
          style={({ pressed }) => [tileStyle, pressed ? { opacity: 0.7 } : null]}
        >
          <Text
            maxFontSizeMultiplier={HEADER_TEXT_SCALE_LIMIT}
            style={{ color: colors.textPrimary, fontSize: typeScale.headline, fontWeight: '600' }}
          >
            {pluginTileLetter(tile.name)}
          </Text>
        </PressableBox>
      ))}
      {overflow > 0 ? (
        <PressableBox
          onPress={onShowAll}
          accessibilityRole="button"
          accessibilityLabel={`${overflow} more installed ${overflow === 1 ? 'plugin' : 'plugins'}`}
          accessibilityHint="Shows every plugin you added"
          style={({ pressed }) => [tileStyle, pressed ? { opacity: 0.7 } : null]}
        >
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            maxFontSizeMultiplier={HEADER_TEXT_SCALE_LIMIT}
            style={{ color: colors.textSecondary, fontSize: typeScale.body, fontWeight: '600' }}
          >
            {`+${overflow}`}
          </Text>
        </PressableBox>
      ) : null}
    </ScrollView>
  );
}
