import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { BarChart3 } from 'lucide-react-native';
import {
  PRODUCT_ANALYTICS_CONSENT_PATH,
  PRODUCT_ANALYTICS_CONSENT_PURPOSE,
  readProductAnalyticsConsent,
} from '@agiworkforce/types';
import { Text } from '@/components/ui/text';
import { apiFetch } from '@/services/api';
import { SettingsGroup, SettingsSwitchRow } from '@/src/features/settings/common';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

const LABEL = 'Product analytics';

type ConsentState = { granted: boolean; noticeVersion: string } | null;

export function ProductAnalyticsConsentGroup() {
  const colors = useThemeColors();
  const [consent, setConsent] = useState<ConsentState>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await apiFetch(PRODUCT_ANALYTICS_CONSENT_PATH);
    if (!response.ok) throw new Error('consent unavailable');
    const body = (await response.json()) as { noticeVersion?: unknown };
    setConsent({
      granted: readProductAnalyticsConsent(body),
      noticeVersion: typeof body.noticeVersion === 'string' ? body.noticeVersion : '',
    });
  }, []);

  useEffect(() => {
    load().catch(() => setError('Your product analytics choice could not be loaded.'));
  }, [load]);

  const save = async (granted: boolean) => {
    if (!consent) return;
    setSaving(true);
    setError(null);
    try {
      const response = await apiFetch(PRODUCT_ANALYTICS_CONSENT_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decisions: [{ purpose: PRODUCT_ANALYTICS_CONSENT_PURPOSE, granted }],
          surface: 'mobile-settings',
          noticeVersion: consent.noticeVersion,
        }),
      });
      if (!response.ok) {
        setError(
          response.status === 409
            ? 'The privacy notice changed. Review it and choose again.'
            : 'The setting was not saved. Try again.',
        );
      }
      await load();
    } catch {
      setError('The setting was not saved. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ marginBottom: 18 }}>
      <Text
        accessibilityRole="header"
        style={{
          color: colors.textMuted,
          fontSize: typeScale.caption,
          fontWeight: '700',
          textTransform: 'uppercase',
          marginBottom: 8,
          paddingHorizontal: 2,
        }}
      >
        Analytics
      </Text>
      <SettingsGroup>
        <SettingsSwitchRow
          label={LABEL}
          icon={BarChart3}
          value={consent?.granted === true}
          onValueChange={(value) => void save(value)}
          disabled={consent === null || saving}
          isLast
        />
      </SettingsGroup>
      <Text
        style={{
          color: colors.textMuted,
          fontSize: typeScale.caption,
          lineHeight: 17,
          marginTop: 8,
          paddingHorizontal: 2,
        }}
      >
        Product usage events from every AGI app, such as a stopped or regenerated response, recorded
        against your account. Never your messages or files. The same choice applies on the web, and
        a workspace administrator can turn it off for every member.
      </Text>
      {error ? (
        <Text
          accessibilityRole="alert"
          style={{
            color: colors.agentError,
            fontSize: typeScale.caption,
            lineHeight: 17,
            marginTop: 4,
          }}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}
