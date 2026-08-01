/**
 * ProjectHeader (Mobile) — RN-native mirror of the shared web ProjectHeader.
 *
 * Both consume `ProjectHeaderPresentation` from `@agiworkforce/types` so the
 * accent palette, chip set, surface ordering, and imported-from labelling
 * stay aligned across Web / Desktop / Mobile without sharing JSX (React DOM
 * vs React Native).
 *
 * Round-10 autonomous suite-transformation slice, 2026-05-21.
 */

import { View } from 'react-native';
import { Cloud, Folder, Lock, Users } from 'lucide-react-native';
import type { ProjectAccentColor, ProjectHeaderPresentation } from '@agiworkforce/types';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';

export interface ProjectHeaderProps {
  presentation: ProjectHeaderPresentation;
}

interface AccentTokens {
  bg: string;
  border: string;
  fg: string;
}

const ACCENT_TOKENS: Record<ProjectAccentColor, AccentTokens> = {
  emerald: {
    bg: 'rgba(16, 185, 129, 0.16)',
    border: 'rgba(16, 185, 129, 0.32)',
    fg: '#6ee7b7',
  },
  sky: {
    bg: 'rgba(56, 189, 248, 0.16)',
    border: 'rgba(56, 189, 248, 0.32)',
    fg: '#7dd3fc',
  },
  amber: {
    bg: 'rgba(245, 158, 11, 0.16)',
    border: 'rgba(245, 158, 11, 0.32)',
    fg: '#fcd34d',
  },
  rose: {
    bg: 'rgba(244, 63, 94, 0.16)',
    border: 'rgba(244, 63, 94, 0.32)',
    fg: '#fda4af',
  },
  violet: {
    bg: 'rgba(139, 92, 246, 0.16)',
    border: 'rgba(139, 92, 246, 0.32)',
    fg: '#c4b5fd',
  },
  zinc: {
    bg: 'rgba(113, 113, 122, 0.16)',
    border: 'rgba(113, 113, 122, 0.32)',
    fg: '#d4d4d8',
  },
};

function PrivacyChip({ presentation }: { presentation: ProjectHeaderPresentation }) {
  const Icon = presentation.staysLocal ? Lock : Cloud;
  const privacyLabel =
    presentation.providerMode === 'DirectByok' ? 'Cloud' : presentation.privacyLabel;
  const tone = presentation.staysLocal
    ? {
        bg: 'rgba(16, 185, 129, 0.12)',
        border: 'rgba(16, 185, 129, 0.4)',
        fg: '#6ee7b7',
      }
    : {
        bg: 'rgba(113, 113, 122, 0.16)',
        border: 'rgba(113, 113, 122, 0.4)',
        fg: '#e4e4e7',
      };
  return (
    <View
      testID="project-header-privacy-chip"
      accessibilityLabel={`Privacy: ${privacyLabel}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 9999,
        borderWidth: 1,
        backgroundColor: tone.bg,
        borderColor: tone.border,
      }}
    >
      <Icon size={11} color={tone.fg} />
      <Text style={{ fontSize: 11, fontWeight: '500', color: tone.fg }}>{privacyLabel}</Text>
    </View>
  );
}

function ProviderChip({ presentation }: { presentation: ProjectHeaderPresentation }) {
  let tone: AccentTokens;
  if (presentation.providerMode === 'DirectByok') {
    tone = ACCENT_TOKENS.sky;
  } else if (
    presentation.providerMode === 'ManagedGateway' ||
    presentation.providerMode === 'ManagedNative'
  ) {
    tone = ACCENT_TOKENS.sky;
  } else {
    tone = ACCENT_TOKENS.emerald;
  }
  return (
    <View
      testID="project-header-provider-chip"
      accessibilityLabel={`Provider mode: ${presentation.providerMode}`}
      style={{
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 9999,
        borderWidth: 1,
        backgroundColor: tone.bg,
        borderColor: tone.border,
      }}
    >
      <Text style={{ fontSize: 11, fontWeight: '500', color: tone.fg }}>
        {presentation.providerMode === 'DirectByok' ? 'Cloud sign-in' : presentation.providerLabel}
      </Text>
    </View>
  );
}

function MetaRow({ presentation }: { presentation: ProjectHeaderPresentation }) {
  const colors = useThemeColors();
  const items = [
    presentation.knowledgeFileCountLabel,
    presentation.memberCountLabel,
    presentation.lastUsedLabel,
    presentation.defaultModelLabel ? `Default model: ${presentation.defaultModelLabel}` : undefined,
  ].filter((value): value is string => Boolean(value));

  if (items.length === 0) return null;

  return (
    <View
      testID="project-header-meta-row"
      style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 4 }}
    >
      {items.map((item, index) => (
        <View
          key={`${item}-${index}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
        >
          {index === 0 && !item.startsWith('Default model:') ? (
            <Users size={11} color={colors.textMuted} />
          ) : null}
          <Text style={{ fontSize: 11, color: colors.textMuted }}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function SurfaceChips({ presentation }: { presentation: ProjectHeaderPresentation }) {
  const colors = useThemeColors();
  if (presentation.surfaceChips.length === 0) return null;
  return (
    <View
      testID="project-header-surface-chips"
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}
    >
      {presentation.surfaceChips.map((label) => (
        <View
          key={label}
          style={{
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderRadius: 4,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surfaceOverlay,
          }}
        >
          <Text
            style={{
              fontSize: 10,
              fontWeight: '500',
              color: colors.textSecondary,
              textTransform: 'uppercase',
              letterSpacing: 0.4,
            }}
          >
            {label}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function ProjectHeader({ presentation }: ProjectHeaderProps) {
  const colors = useThemeColors();
  const accent = ACCENT_TOKENS[presentation.accentColor] ?? ACCENT_TOKENS.zinc;
  return (
    <View
      testID="project-header"
      accessibilityLabel={`Project: ${presentation.title}`}
      style={{
        flexDirection: 'column',
        gap: 12,
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        backgroundColor: colors.surfaceElevated,
        borderColor: colors.border,
      }}
    >
      {/* Top row: icon + title + imported-from */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            borderWidth: 1,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: accent.bg,
            borderColor: accent.border,
          }}
        >
          {presentation.iconEmoji ? (
            <Text style={{ fontSize: 22, color: accent.fg }}>{presentation.iconEmoji}</Text>
          ) : (
            <Folder size={22} color={accent.fg} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              flexWrap: 'wrap',
            }}
          >
            <Text
              numberOfLines={1}
              style={{ fontSize: 16, fontWeight: '600', color: colors.textPrimary }}
            >
              {presentation.title}
            </Text>
            {presentation.importedFromLabel ? (
              <View
                testID="project-header-imported-from"
                style={{
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  borderRadius: 9999,
                  borderWidth: 1,
                  backgroundColor: ACCENT_TOKENS.violet.bg,
                  borderColor: ACCENT_TOKENS.violet.border,
                }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: '500',
                    color: ACCENT_TOKENS.violet.fg,
                    textTransform: 'uppercase',
                    letterSpacing: 0.4,
                  }}
                >
                  {presentation.importedFromLabel}
                </Text>
              </View>
            ) : null}
          </View>
          {presentation.description ? (
            <Text
              numberOfLines={2}
              style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}
            >
              {presentation.description}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Chip row */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <PrivacyChip presentation={presentation} />
        <ProviderChip presentation={presentation} />
      </View>

      <MetaRow presentation={presentation} />
      <SurfaceChips presentation={presentation} />
    </View>
  );
}
