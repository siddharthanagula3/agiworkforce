import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { MapPin } from 'lucide-react-native';
import {
  BILLING_PLAN_PRICING,
  US_ONLY_ROUTING_TIERS,
  isBillingPlanTier,
  normalizeSubscriptionAccessTier,
} from '@agiworkforce/types';
import {
  ME_ROUTING_PREFERENCES_PATH,
  RoutingPreferencesSchema,
  type RoutingPreferences,
} from '@agiworkforce/cloud-contracts';
import { Text } from '@/components/ui/text';
import { api } from '@/services/api';
import { useTierStore } from '@/src/features/billing/store';
import { SettingsGroup, SettingsSwitchRow } from '@/src/features/settings/common';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

const ROUTING_PREFERENCES_PATH = ME_ROUTING_PREFERENCES_PATH;
const LABEL = 'Only use AI providers based in the US';
const US_ONLY_PLAN_LABELS = US_ONLY_ROUTING_TIERS.flatMap((tier) =>
  isBillingPlanTier(tier) ? [BILLING_PLAN_PRICING[tier].label] : [],
).join(' and ');

function readPreferences(body: unknown): RoutingPreferences {
  const parsed = RoutingPreferencesSchema.safeParse(body);
  return parsed.success ? parsed.data : {};
}

export function UsOnlyRoutingGroup() {
  const colors = useThemeColors();
  const tier = useTierStore((state) => state.tier);
  const eligible = US_ONLY_ROUTING_TIERS.includes(normalizeSubscriptionAccessTier(tier));
  const [preferences, setPreferences] = useState<RoutingPreferences | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<unknown>(ROUTING_PREFERENCES_PATH)
      .then((body) => {
        if (!cancelled) setPreferences(readPreferences(body));
      })
      .catch(() => {
        if (!cancelled) setError('Your provider location setting could not be loaded.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async (usOnly: boolean) => {
    const previous = preferences;
    const next = { ...preferences, us_only: usOnly };
    setPreferences(next);
    setSaving(true);
    setError(null);
    try {
      await api.put(ROUTING_PREFERENCES_PATH, next);
    } catch {
      setPreferences(previous);
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
        Provider location
      </Text>
      <SettingsGroup>
        <SettingsSwitchRow
          label={LABEL}
          icon={MapPin}
          value={preferences?.us_only === true}
          onValueChange={(value) => void save(value)}
          disabled={!eligible || preferences === null || saving}
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
        {eligible
          ? 'Auto and the models you pick are served only by providers based in the United States. Models without one are unavailable while this is on.'
          : `Available on ${US_ONLY_PLAN_LABELS}.`}
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
