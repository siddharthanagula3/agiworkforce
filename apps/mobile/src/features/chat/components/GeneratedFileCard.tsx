/**
 * GeneratedFileCard (Mobile) — RN-native mirror of the shared
 * web GeneratedFileCard in `packages/ui/unified-chat`. Both consume the
 * same `GeneratedFilePresentation` type from `@agiworkforce/types`,
 * so the visual treatment, chips, and status semantics stay aligned
 * across Web/Mobile without sharing JSX (React DOM vs React Native).
 *
 * Round-7 autonomous suite-transformation slice, 2026-05-21.
 */

import { Image, Pressable, View } from 'react-native';
import type { ReactElement } from 'react';
import {
  AlertTriangle,
  Archive,
  Clock,
  Code2,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Layers,
  Loader,
  Lock,
  Presentation,
  ShieldCheck,
} from 'lucide-react-native';
import type { GeneratedFilePresentation } from '@agiworkforce/types';
import { Text } from '@/components/ui/text';
import { useThemeColors, type ColorScheme } from '@/src/ui/theme';

export interface GeneratedFileCardProps {
  presentation: GeneratedFilePresentation;
  /** Optional jump-to-source-session affordance. */
  onOpenSourceSession?: () => void;
}

function getKindIcon(kindLabel: string, colors: ColorScheme, size = 16): ReactElement {
  const lower = kindLabel.toLowerCase();
  if (lower.includes('pdf')) {
    return <FileText size={size} color={colors.agentError} />;
  }
  if (lower.includes('word') || lower.includes('docx') || lower.includes('document')) {
    return <FileText size={size} color={colors.agentActive} />;
  }
  if (
    lower.includes('excel') ||
    lower.includes('xlsx') ||
    lower.includes('csv') ||
    lower.includes('spreadsheet')
  ) {
    return <FileSpreadsheet size={size} color={colors.agentSuccess} />;
  }
  if (lower.includes('pptx') || lower.includes('presentation')) {
    return <Presentation size={size} color={colors.agentWarning} />;
  }
  if (lower.includes('archive') || lower.includes('zip')) {
    return <Archive size={size} color={colors.textSecondary} />;
  }
  if (lower.includes('image')) {
    return <ImageIcon size={size} color={colors.agentThinking} />;
  }
  if (lower.includes('html')) {
    return <Code2 size={size} color={colors.agentWarning} />;
  }
  return <Layers size={size} color={colors.textMuted} />;
}

function StatusBadge({
  presentation,
  colors,
}: {
  presentation: GeneratedFilePresentation;
  colors: ColorScheme;
}) {
  let bg: string = colors.neutralSurface;
  let fg: string = colors.textSecondary;
  let Icon: typeof Loader = Clock;
  if (presentation.isRunning) {
    bg = colors.warningSurface;
    fg = colors.agentWarning;
    Icon = Loader;
  } else if (presentation.isFailed) {
    bg = colors.dangerSurface;
    fg = colors.agentError;
    Icon = AlertTriangle;
  } else if (presentation.isComplete) {
    bg = colors.successSurface;
    fg = colors.agentSuccess;
    Icon = ShieldCheck;
  }
  return (
    <View
      testID="generated-file-status-badge"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 9999,
        backgroundColor: bg,
      }}
    >
      <Icon size={10} color={fg} />
      <Text
        style={{
          fontSize: 10,
          fontWeight: '600',
          color: fg,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        {presentation.statusLabel}
      </Text>
    </View>
  );
}

function Chip({
  icon,
  label,
  colors,
}: {
  icon?: ReactElement;
  label: string;
  colors: ColorScheme;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 6,
        paddingVertical: 3,
        borderRadius: 9999,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.neutralSurface,
      }}
    >
      {icon}
      <Text style={{ fontSize: 10, fontWeight: '600', color: colors.textSecondary }}>{label}</Text>
    </View>
  );
}

export function GeneratedFileCard({ presentation, onOpenSourceSession }: GeneratedFileCardProps) {
  const colors = useThemeColors();
  const showChips = Boolean(
    presentation.privacyShortLabel || presentation.providerLabel || presentation.sourceSurfaceLabel,
  );

  return (
    <View
      testID="generated-file-card"
      style={{
        padding: 12,
        borderRadius: 8,
        backgroundColor: colors.surfaceElevated,
        borderWidth: 1,
        borderColor: colors.border,
        gap: 8,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        {presentation.previewUri ? (
          <Image
            source={{ uri: presentation.previewUri }}
            accessibilityLabel={`${presentation.title} preview`}
            style={{ width: 48, height: 48, borderRadius: 6 }}
          />
        ) : (
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 6,
              backgroundColor: colors.neutralSurface,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {getKindIcon(presentation.kindLabel, colors)}
          </View>
        )}
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text
              style={{
                flex: 1,
                fontSize: 13,
                fontWeight: '600',
                color: colors.textPrimary,
              }}
              numberOfLines={1}
            >
              {presentation.title}
            </Text>
            <StatusBadge presentation={presentation} colors={colors} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <Text style={{ fontSize: 11, color: colors.textSecondary }}>
              {presentation.kindLabel}
            </Text>
            {presentation.byteCountLabel ? (
              <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                · {presentation.byteCountLabel}
              </Text>
            ) : null}
            {presentation.checksumShort ? (
              <Text
                style={{ fontSize: 11, color: colors.textMuted }}
                accessibilityLabel={`SHA-256 ${presentation.checksumShort}`}
              >
                · {presentation.checksumShort}
              </Text>
            ) : null}
            {presentation.retentionLabel ? (
              <Text style={{ fontSize: 11, color: colors.textMuted }}>
                · {presentation.retentionLabel}
              </Text>
            ) : null}
          </View>
          {showChips ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 2 }}>
              {presentation.privacyShortLabel ? (
                <Chip
                  icon={<Lock size={10} color={colors.textSecondary} />}
                  label={presentation.privacyShortLabel}
                  colors={colors}
                />
              ) : null}
              {presentation.providerLabel ? (
                <Chip label={presentation.providerLabel} colors={colors} />
              ) : null}
              {presentation.sourceSurfaceLabel ? (
                <Chip label={presentation.sourceSurfaceLabel} colors={colors} />
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
      {presentation.localOnly ? (
        <Text style={{ fontSize: 11, color: colors.textMuted }}>
          Local file. Sharing uses the native sheet and does not upload it to AGI cloud.
        </Text>
      ) : null}
      {onOpenSourceSession && presentation.sourceSessionLabel ? (
        <Pressable
          onPress={onOpenSourceSession}
          accessibilityRole="button"
          accessibilityLabel={`Open ${presentation.sourceSessionLabel}`}
          style={{ alignSelf: 'flex-end' }}
        >
          <Text
            style={{
              fontSize: 11,
              fontWeight: '600',
              color: colors.textSecondary,
              textDecorationLine: 'underline',
            }}
          >
            {presentation.sourceSessionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
