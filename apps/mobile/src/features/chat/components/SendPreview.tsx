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
import { ChevronDown, ChevronUp, Cloud, HardDrive, KeyRound, Lock } from 'lucide-react-native';
import type { ReactElement } from 'react';
import type { SendPreviewPresentation } from '@agiworkforce/types';
import { Text } from '@/components/ui/text';
import { colors } from '@/src/ui/theme';

export interface SendPreviewProps {
  presentation: SendPreviewPresentation;
  defaultExpanded?: boolean;
}

function DestinationIcon({
  presentation,
}: {
  presentation: SendPreviewPresentation;
}): ReactElement {
  if (presentation.staysLocal) {
    return <HardDrive size={14} color={colors.agentSuccess} />;
  }
  if (presentation.providerMode === 'DirectByok') {
    return <KeyRound size={14} color={colors.agentWarning} />;
  }
  return <Cloud size={14} color="#7dd3fc" />;
}

function getAccent(presentation: SendPreviewPresentation): { bg: string; border: string } {
  if (presentation.staysLocal) {
    return { bg: 'rgba(16, 185, 129, 0.06)', border: 'rgba(16, 185, 129, 0.3)' };
  }
  if (presentation.providerMode === 'DirectByok') {
    return { bg: 'rgba(245, 158, 11, 0.06)', border: 'rgba(245, 158, 11, 0.3)' };
  }
  return { bg: 'rgba(56, 189, 248, 0.06)', border: 'rgba(56, 189, 248, 0.3)' };
}

function DetailRow({ term, definition }: { term: string; definition: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      <Text style={{ fontSize: 10, color: colors.textMuted, minWidth: 90 }}>{term}</Text>
      <Text style={{ flex: 1, fontSize: 10, color: colors.textSecondary }} numberOfLines={1}>
        {definition}
      </Text>
    </View>
  );
}

export function SendPreview({ presentation, defaultExpanded = false }: SendPreviewProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const accent = getAccent(presentation);
  const detailsAvailable = Boolean(
    presentation.bodyCharLabel ||
    presentation.attachmentLabel ||
    presentation.systemPromptLabel ||
    presentation.contextLabel ||
    presentation.toolsLabel ||
    presentation.sourceSessionLabel,
  );

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
        <DestinationIcon presentation={presentation} />
        <Text
          style={{ flex: 1, fontSize: 12, fontWeight: '600', color: colors.textPrimary }}
          numberOfLines={1}
        >
          {presentation.destinationLabel}
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
            backgroundColor: 'rgba(255, 255, 255, 0.04)',
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
            {presentation.privacyShortLabel}
          </Text>
        </View>
      </View>
      {presentation.modelLabel ? (
        <Text style={{ fontSize: 10, color: colors.textMuted }}>{presentation.modelLabel}</Text>
      ) : null}
      <Text style={{ fontSize: 11, lineHeight: 15, color: colors.textSecondary }}>
        {presentation.bannerCopy}
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
        <View testID="send-preview-details" style={{ gap: 3, paddingTop: 2 }}>
          {presentation.bodyCharLabel ? (
            <DetailRow term="Message" definition={presentation.bodyCharLabel} />
          ) : null}
          {presentation.attachmentLabel ? (
            <DetailRow term="Attachments" definition={presentation.attachmentLabel} />
          ) : null}
          {presentation.systemPromptLabel ? (
            <DetailRow term="System prompt" definition={presentation.systemPromptLabel} />
          ) : null}
          {presentation.contextLabel ? (
            <DetailRow term="Context budget" definition={presentation.contextLabel} />
          ) : null}
          {presentation.toolsLabel ? (
            <DetailRow term="Tools" definition={presentation.toolsLabel} />
          ) : null}
          {presentation.sourceSessionLabel ? (
            <DetailRow term="Source session" definition={presentation.sourceSessionLabel} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
