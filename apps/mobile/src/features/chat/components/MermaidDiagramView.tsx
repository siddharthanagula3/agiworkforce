import { useCallback, useMemo, useState } from 'react';
import {
  ScrollView,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/src/ui/theme';
import { codeFontFamily } from '@/src/ui/theme/codeFont';
import { spacing, typeScale } from '@/src/ui/theme/tokens';
import { SafeArtifactPreview, type MermaidDrawing } from './SafeArtifactPreview';

export function diagramFailureText(reason: string): string {
  return reason
    ? `This diagram could not be drawn: ${reason}.`
    : 'This diagram could not be drawn.';
}

interface MermaidDiagramViewProps {
  source: string;
  style?: StyleProp<ViewStyle>;
  fitToWidth?: boolean;
  onViewSource?: () => void;
  onDrawn?: (svg: string | null) => void;
}

/** A diagram drawn in the theme the app shows, which says why and keeps its source when it fails. */
export function MermaidDiagramView({
  source,
  style,
  fitToWidth = false,
  onViewSource,
  onDrawn,
}: MermaidDiagramViewProps) {
  const { colors, isDark } = useTheme();
  const { fontScale } = useWindowDimensions();
  const [failure, setFailure] = useState<{ source: string; reason: string } | null>(null);
  const appearance = useMemo(
    () => ({ background: colors.surfaceBase, dark: isDark, fontScale, fitToWidth }),
    [colors.surfaceBase, isDark, fontScale, fitToWidth],
  );
  const handleFailed = useCallback(
    (reason: string) => {
      setFailure({ source, reason });
      onDrawn?.(null);
    },
    [source, onDrawn],
  );
  const handleRendered = useCallback(
    (_height: number, drawing: MermaidDrawing) => {
      setFailure(null);
      onDrawn?.(drawing.svg);
    },
    [onDrawn],
  );

  if (failure?.source === source) {
    return (
      <View
        testID="mermaid-diagram-failure"
        style={[
          style,
          { padding: spacing.lg, gap: spacing.md, backgroundColor: colors.surfaceBase },
        ]}
      >
        <Text
          accessibilityRole="alert"
          style={{ fontSize: typeScale.footnote, color: colors.textSecondary }}
        >
          {diagramFailureText(failure.reason)}
        </Text>
        <ScrollView style={{ flexShrink: 1 }}>
          <Text
            selectable
            style={{
              fontFamily: codeFontFamily,
              fontSize: typeScale.caption,
              color: colors.textPrimary,
            }}
          >
            {source}
          </Text>
        </ScrollView>
        {onViewSource ? (
          <Button
            title="View source"
            variant="ghost"
            size="sm"
            accessibilityLabel="Show the diagram source"
            onPress={onViewSource}
          />
        ) : null}
      </View>
    );
  }

  return (
    <SafeArtifactPreview
      content={source}
      kind="mermaid"
      appearance={appearance}
      style={[style, { backgroundColor: colors.surfaceBase }]}
      scrollEnabled
      onDiagramRendered={handleRendered}
      onDiagramFailed={handleFailed}
      {...(onViewSource ? { onViewSource } : {})}
    />
  );
}
