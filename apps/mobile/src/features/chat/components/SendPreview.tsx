/**
 * SendPreview (Mobile) — RN-native mirror of the shared web SendPreview.
 *
 * Both consume `SendPreviewPresentation` from `@agiworkforce/types` so the
 * destination/privacy semantics, banner copy, and detail labels stay aligned
 * across Web/Mobile without sharing JSX (React DOM vs React Native).
 *
 * Round-8 autonomous suite-transformation slice, 2026-05-21.
 */

import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { ChevronDown, ChevronUp, Cloud, HardDrive, Lock } from 'lucide-react-native';
import type { ReactElement } from 'react';
import type { SendPreviewPresentation } from '@agiworkforce/types';
import { Text } from '@/components/ui/text';
import { useThemeColors, type ColorScheme } from '@/src/ui/theme';

export interface SendPreviewProps {
  presentation: SendPreviewPresentation;
  defaultExpanded?: boolean;
  /**
   * `card` is the full trust-boundary explainer (unchanged; snapshotted).
   * `compact` is the composer-mounted form: a single low pill that keeps the
   * destination permanently visible above the input without consuming a banner
   * row, and expands in place to the same destination/privacy/banner/detail
   * block. Mirrors the shared web component's `variant="compact"`, which the
   * web composer renders at ChatComposerNew.tsx.
   */
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
}: {
  term: string;
  definition: string;
  colors: ColorScheme;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      <Text style={{ fontSize: 10, color: colors.textMuted, minWidth: 90 }}>{term}</Text>
      <Text style={{ flex: 1, fontSize: 10, color: colors.textSecondary }} numberOfLines={1}>
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
  return (
    <View testID="send-preview-details" style={{ gap: 3, paddingTop: 2 }}>
      {presentation.bodyCharLabel ? (
        <DetailRow term="Message" definition={presentation.bodyCharLabel} colors={colors} />
      ) : null}
      {presentation.attachmentLabel ? (
        <DetailRow term="Attachments" definition={presentation.attachmentLabel} colors={colors} />
      ) : null}
      {presentation.systemPromptLabel ? (
        <DetailRow
          term="System prompt"
          definition={presentation.systemPromptLabel}
          colors={colors}
        />
      ) : null}
      {presentation.contextLabel ? (
        <DetailRow term="Context budget" definition={presentation.contextLabel} colors={colors} />
      ) : null}
      {presentation.toolsLabel ? (
        <DetailRow term="Tools" definition={presentation.toolsLabel} colors={colors} />
      ) : null}
      {presentation.sourceSessionLabel ? (
        <DetailRow
          term="Source session"
          definition={presentation.sourceSessionLabel}
          colors={colors}
        />
      ) : null}
    </View>
  );
}

export function SendPreview({
  presentation,
  defaultExpanded = false,
  variant = 'card',
}: SendPreviewProps) {
  const colors = useThemeColors();
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
        <Pressable
          testID="send-preview-toggle"
          onPress={() => setExpanded((prev) => !prev)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={`${presentation.destinationLabel}. ${
            expanded ? 'Hide' : 'Show'
          } send details`}
          // 10pt text in a ~16pt box is well under the tap-target minimum for a
          // control that discloses WHERE a message is about to be sent — the one
          // thing a user must be able to check before hitting send. hitSlop grows
          // the touch area without changing the compact visual density.
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
          <Text style={{ fontSize: 10, fontWeight: '600', color: colors.textMuted }}>
            {getCompactDestinationLabel(presentation)}
          </Text>
          {expanded ? (
            <ChevronUp size={10} color={colors.textMuted} />
          ) : (
            <ChevronDown size={10} color={colors.textMuted} />
          )}
        </Pressable>
        {expanded ? (
          <View
            testID="send-preview-panel"
            style={{
              padding: 10,
              borderRadius: 8,
              backgroundColor: accent.bg,
              borderWidth: 1,
              borderColor: accent.border,
              gap: 6,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text
                style={{ flex: 1, fontSize: 12, fontWeight: '600', color: colors.textPrimary }}
                numberOfLines={1}
              >
                {getMobileDestinationLabel(presentation)}
              </Text>
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
                    fontSize: 9,
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
            {getMobileModelLabel(presentation) ? (
              <Text style={{ fontSize: 10, color: colors.textMuted }}>
                {getMobileModelLabel(presentation)}
              </Text>
            ) : null}
            <Text style={{ fontSize: 11, lineHeight: 15, color: colors.textSecondary }}>
              {getMobileBannerCopy(presentation)}
            </Text>
            {detailsAvailable ? <DetailBlock presentation={presentation} colors={colors} /> : null}
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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <DestinationIcon presentation={presentation} colors={colors} />
        <Text
          style={{ flex: 1, fontSize: 12, fontWeight: '600', color: colors.textPrimary }}
          numberOfLines={1}
        >
          {getMobileDestinationLabel(presentation)}
        </Text>
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
              fontSize: 9,
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
      {getMobileModelLabel(presentation) ? (
        <Text style={{ fontSize: 10, color: colors.textMuted }}>
          {getMobileModelLabel(presentation)}
        </Text>
      ) : null}
      <Text style={{ fontSize: 11, lineHeight: 15, color: colors.textSecondary }}>
        {getMobileBannerCopy(presentation)}
      </Text>
      {detailsAvailable ? (
        <Pressable
          onPress={() => setExpanded((prev) => !prev)}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Hide send details' : 'Show send details'}
          style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4 }}
        >
          {expanded ? (
            <ChevronUp size={12} color={colors.textMuted} />
          ) : (
            <ChevronDown size={12} color={colors.textMuted} />
          )}
          <Text
            style={{
              fontSize: 9,
              fontWeight: '700',
              color: colors.textMuted,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            {expanded ? 'Hide details' : 'Show details'}
          </Text>
        </Pressable>
      ) : null}
      {expanded && detailsAvailable ? (
        <DetailBlock presentation={presentation} colors={colors} />
      ) : null}
    </View>
  );
}
