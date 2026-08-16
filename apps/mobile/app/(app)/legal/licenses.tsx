import { useMemo } from 'react';
import { Platform, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors, cardRadius } from '@/src/ui/theme';
import { SettingsScreenShell } from '@/src/features/settings/common';
import {
  OSS_LICENSES_GENERATED_AT,
  OSS_PACKAGES,
  groupOssPackages,
  type OssLicenseGroup,
} from '@/src/features/legal';

const MONOSPACE = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

function formatGeneratedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString();
}

function packageLines(group: OssLicenseGroup): string {
  return group.packages
    .map((entry) => {
      const copyright = entry.copyright ? ` — ${entry.copyright}` : '';
      return `${entry.name} ${entry.version}${copyright}`;
    })
    .join('\n');
}

export default function LicensesScreen() {
  const colors = useThemeColors();
  const groups = useMemo(() => groupOssPackages(), []);
  const generatedAt = formatGeneratedAt(OSS_LICENSES_GENERATED_AT);

  return (
    <SettingsScreenShell title="Open source licenses" backHref="/(app)/about">
      <View
        style={{
          borderRadius: cardRadius,
          backgroundColor: colors.surfaceElevated,
          padding: 14,
          marginBottom: 20,
        }}
      >
        <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '700' }}>
          {OSS_PACKAGES.length} open source packages
        </Text>
        <Text
          style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 6 }}
          accessibilityLabel={`AGI Workforce is built with ${OSS_PACKAGES.length} open source packages. Their licenses and copyright notices are reproduced below.`}
        >
          AGI Workforce is built with open source software. Each package below is listed with its
          copyright notice and the license it ships under.
          {generatedAt ? ` Generated ${generatedAt} from the installed dependencies.` : ''}
        </Text>
      </View>

      {groups.map((group) => (
        <View
          key={group.bodyId ?? `declared:${group.licenses.join('+')}`}
          style={{
            borderRadius: cardRadius,
            backgroundColor: colors.surfaceElevated,
            padding: 14,
            marginBottom: 16,
            gap: 10,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '700', flex: 1 }}>
              {group.licenses.join(' · ')}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>
              {group.packages.length} package{group.packages.length === 1 ? '' : 's'}
            </Text>
          </View>

          <Text selectable style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 18 }}>
            {packageLines(group)}
          </Text>

          {group.body ? (
            <Text
              selectable
              style={{
                color: colors.textMuted,
                fontFamily: MONOSPACE,
                fontSize: 11,
                lineHeight: 16,
              }}
            >
              {group.body}
            </Text>
          ) : (
            <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 18 }}>
              These packages bundle no license file. The license id above is the one they declare in
              their package manifest.
            </Text>
          )}
        </View>
      ))}
    </SettingsScreenShell>
  );
}
