import { useState } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { ChevronDown, ChevronUp, Cloud, HardDrive, Lock } from 'lucide-react-native';
import type { ReactElement } from 'react';
import type { SendPreviewPresentation } from '@agiworkforce/types';
import { Text } from '@/components/ui/Text';
import { useThemeColors, type ColorScheme } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { useLargeTextRows } from '@/src/shared/hooks/useLargeTextRows';
import { HEADER_TEXT_SCALE_LIMIT } from './WorkModeSwitch';

export interface SendPreviewProps {
  presentation: SendPreviewPresentation;
  defaultExpanded?: boolean;
  variant?: 'card' | 'compact';
}

function getCompactDestinationLabel(presentation: SendPreviewPresentation): string {
  if (presentation.staysLocal) return 'Stays on device';
  if (presentation.providerMode === 'DirectByok') return 'Sign in for AGI Cloud';
  return 'Sent to AGI Cloud';
}

function DestinationIcon({
  presentation,
  colors,
}: {
  presentation: SendPreviewPresentation;
  colors: ColorScheme;
}): ReactElement {
  if (presentation.staysLocal) {
    return <HardDrive size={14} color={colors.agentSuccess} />;
  }
  return <Cloud size={14} color={colors.agentActive} />;
}

function getAccent(
  presentation: SendPreviewPresentation,
  colors: ColorScheme,
): { bg: string; border: string } {
  if (presentation.staysLocal) {
    return { bg: colors.surfaceElevated, border: colors.successBorder };
  }
  return { bg: colors.surfaceElevated, border: colors.accentBorder };
}

function getMobileDestinationLabel(presentation: SendPreviewPresentation): string {
  if (presentation.providerMode === 'DirectByok') return 'Sign in for AGI Cloud';
  return presentation.destinationLabel;
}

function getMobilePrivacyLabel(presentation: SendPreviewPresentation): string {
  if (presentation.providerMode === 'DirectByok') return 'Cloud';
  return presentation.privacyShortLabel;
}

function getMobileBannerCopy(presentation: SendPreviewPresentation): string {
  if (presentation.providerMode === 'DirectByok') {
    return 'Sign in to use AGI Cloud chat. Local Mode stays available on this device.';
  }
  if (presentation.staysLocal) {
    return 'The model runs on your device. Nothing is uploaded unless you choose Cloud.';
  }
  return presentation.bannerCopy;
}

function getMobileModelLabel(presentation: SendPreviewPresentation): string | undefined {
  if (presentation.providerMode === 'DirectByok') return undefined;
  return presentation.modelLabel;
}

function DetailRow({
  term,
  definition,
  colors,
  stacked,
}: {
  term: string;
  definition: string;
  colors: ColorScheme;
  stacked: boolean;
}) {
  return (
    <View style={{ flexDirection: stacked ? 'column' : 'row', gap: stacked ? 2 : 6 }}>
      <Text
        style={{
          fontSize: typeScale.caption,
          color: colors.textMuted,
          ...(stacked ? {} : { minWidth: 90 }),
        }}
      >
        {term}
      </Text>
      <Text style={{ flexShrink: 1, fontSize: typeScale.caption, color: colors.textSecondary }}>
        {definition}
      </Text>
    </View>
  );
}

function DetailBlock({
  presentation,
  colors,
}: {
  presentation: SendPreviewPresentation;
  colors: ColorScheme;
}) {
  const stacked = useLargeTextRows();
  const details = [
    ['Message', presentation.bodyCharLabel],
    ['Attachments', presentation.attachmentLabel],
    ['System prompt', presentation.systemPromptLabel],
    ['Context budget', presentation.contextLabel],
    ['Tools', presentation.toolsLabel],
    ['Source session', presentation.sourceSessionLabel],
  ] as const;
  return (
    <View testID="send-preview-details" style={{ gap: stacked ? 8 : 3, paddingTop: 2 }}>
      {details.map(([term, definition]) =>
        definition ? (
          <DetailRow
            key={term}
            term={term}
            definition={definition}
            colors={colors}
            stacked={stacked}
          />
        ) : null,
      )}
    </View>
  );
}

function PreviewSummary({
  presentation,
  colors,
  showIcon,
}: {
  presentation: SendPreviewPresentation;
  colors: ColorScheme;
  showIcon: boolean;
}) {
  const stacked = useLargeTextRows();
  const model = getMobileModelLabel(presentation);
  return (
    <>
      <View
        style={{
          flexDirection: stacked ? 'column' : 'row',
          alignItems: stacked ? 'flex-start' : 'center',
          gap: 8,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            ...(stacked ? {} : { flex: 1, minWidth: 0 }),
          }}
        >
          {showIcon ? <DestinationIcon presentation={presentation} colors={colors} /> : null}
          <Text
            style={{
              flexShrink: 1,
              fontSize: typeScale.caption,
              fontWeight: '600',
              color: colors.textPrimary,
            }}
          >
            {getMobileDestinationLabel(presentation)}
          </Text>
        </View>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 3,
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderRadius: 9999,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surfaceBase,
          }}
        >
          <Lock size={10} color={colors.textSecondary} />
          <Text
            style={{
              flexShrink: 1,
              fontSize: typeScale.caption,
              fontWeight: '700',
              color: colors.textSecondary,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            {getMobilePrivacyLabel(presentation)}
          </Text>
        </View>
      </View>
      {model ? (
        <Text style={{ fontSize: typeScale.caption, color: colors.textMuted }}>{model}</Text>
      ) : null}
      <Text style={{ fontSize: typeScale.caption, color: colors.textSecondary }}>
        {getMobileBannerCopy(presentation)}
      </Text>
    </>
  );
}

export function SendPreview({
  presentation,
  defaultExpanded = false,
  variant = 'card',
}: SendPreviewProps) {
  const colors = useThemeColors();
  const { height } = useWindowDimensions();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const accent = getAccent(presentation, colors);
  const detailsAvailable = Boolean(
    presentation.bodyCharLabel ||
    presentation.attachmentLabel ||
    presentation.systemPromptLabel ||
    presentation.contextLabel ||
    presentation.toolsLabel ||
    presentation.sourceSessionLabel,
  );

  if (variant === 'compact') {
    return (
      <View testID="send-preview" style={{ gap: 6 }}>
        <PressableBox
          testID="send-preview-toggle"
          onPress={() => setExpanded((prev) => !prev)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={`${getMobileDestinationLabel(presentation)}. ${
            expanded ? 'Hide' : 'Show'
          } send details`}
          hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
          style={{
            alignSelf: 'flex-start',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            minHeight: 24,
            paddingVertical: 4,
            paddingHorizontal: 4,
          }}
        >
          <DestinationIcon presentation={presentation} colors={colors} />
          <Text
            maxFontSizeMultiplier={HEADER_TEXT_SCALE_LIMIT}
            style={{
              flexShrink: 1,
              fontSize: typeScale.caption,
              fontWeight: '600',
              color: colors.textMuted,
            }}
          >
            {getCompactDestinationLabel(presentation)}
          </Text>
          {expanded ? (
            <ChevronUp size={10} color={colors.textMuted} />
          ) : (
            <ChevronDown size={10} color={colors.textMuted} />
          )}
        </PressableBox>
        {expanded ? (
          <View
            testID="send-preview-panel"
            style={{
              padding: 10,
              borderRadius: 8,
              backgroundColor: accent.bg,
              borderWidth: 1,
              borderColor: accent.border,
            }}
          >
            <ScrollView
              style={{ maxHeight: height * 0.3 }}
              contentContainerStyle={{ gap: 6 }}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              testID="send-preview-scroll"
            >
              <PreviewSummary presentation={presentation} colors={colors} showIcon={false} />
              {detailsAvailable ? (
                <DetailBlock presentation={presentation} colors={colors} />
              ) : null}
            </ScrollView>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View
      testID="send-preview"
      style={{
        padding: 10,
        borderRadius: 8,
        backgroundColor: accent.bg,
        borderWidth: 1,
        borderColor: accent.border,
        gap: 6,
      }}
    >
      <PreviewSummary presentation={presentation} colors={colors} showIcon />
      {detailsAvailable ? (
        <PressableBox
          onPress={() => setExpanded((prev) => !prev)}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Hide send details' : 'Show send details'}
          accessibilityState={{ expanded }}
          style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4 }}
        >
          {expanded ? (
            <ChevronUp size={12} color={colors.textMuted} />
          ) : (
            <ChevronDown size={12} color={colors.textMuted} />
          )}
          <Text
            style={{
              fontSize: typeScale.caption,
              fontWeight: '700',
              color: colors.textMuted,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            {expanded ? 'Hide details' : 'Show details'}
          </Text>
        </PressableBox>
      ) : null}
      {expanded && detailsAvailable ? (
        <DetailBlock presentation={presentation} colors={colors} />
      ) : null}
    </View>
  );
}
