import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { View } from 'react-native';
import { MapPin } from 'lucide-react-native';
import {
  BILLING_PLAN_PRICING,
  US_ONLY_ROUTING_TIERS,
  isBillingPlanTier,
  normalizeSubscriptionAccessTier,
  type BillingPlanTier,
} from '@agiworkforce/types';
import {
  ME_ROUTING_PREFERENCES_PATH,
  RoutingPreferencesSchema,
  type RoutingPreferences,
} from '@agiworkforce/cloud-contracts';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { api } from '@/services/api';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
  subscribeCloudAccountEpochChange,
  type CloudAccountEpoch,
} from '@/src/features/auth/services/cloudAccountSession';
import { useTierStore } from '@/src/features/billing/store';
import { SettingsGroup, SettingsSwitchRow } from '@/src/features/settings/Common';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

const ROUTING_PREFERENCES_PATH = ME_ROUTING_PREFERENCES_PATH;
const LABEL = 'Only use AI providers based in the US';
const US_ONLY_PLAN_LABELS = US_ONLY_ROUTING_TIERS.flatMap((tier) =>
  isBillingPlanTier(tier) ? [BILLING_PLAN_PRICING[tier].label] : [],
).join(' and ');

type RoutingOwner = {
  account: CloudAccountEpoch;
  tier: BillingPlanTier;
  active: boolean;
  ready: RoutingPreferences | null;
  operation: AbortController | null;
};

type RoutingView = {
  owner: RoutingOwner | null;
  ready: RoutingPreferences | null;
  usOnly: boolean;
  busy: boolean;
  error: string | null;
};

function ownerIsCurrent(owner: RoutingOwner): boolean {
  const auth = useAuthStore.getState();
  return owner.active && isCloudAccountEpochCurrent(owner.account) &&
    auth.isClerkLoaded && auth.isClerkSignedIn && auth.clerkUserId === owner.account.ownerId &&
    useChatAppModeStore.getState().appMode === 'cloud' &&
    useTierStore.getState().tier === owner.tier;
}

function tierIsEligible(tier: BillingPlanTier): boolean {
  return US_ONLY_ROUTING_TIERS.includes(normalizeSubscriptionAccessTier(tier));
}

export function UsOnlyRoutingGroup() {
  const colors = useThemeColors();
  const tier = useTierStore((state) => state.tier);
  const eligible = tierIsEligible(tier);
  const ownerRef = useRef<RoutingOwner | null>(null);
  const [view, setView] = useState<RoutingView>({
    owner: null, ready: null, usOnly: false, busy: false, error: null,
  });

  const read = useCallback(async (
    owner: RoutingOwner,
    operation: AbortController,
    message: string | null = null,
    acknowledged: RoutingPreferences | null = null,
  ) => {
    const current = () => ownerRef.current === owner && ownerIsCurrent(owner) &&
      owner.operation === operation && !operation.signal.aborted;
    try {
      const body = await api.get<unknown>(ROUTING_PREFERENCES_PATH, {
        accountEpoch: owner.account, signal: operation.signal,
      });
      if (!current()) return;
      const ready = RoutingPreferencesSchema.parse(body);
      owner.ready = ready;
      setView({ owner, ready, usOnly: ready.us_only === true, busy: false, error: message });
    } catch {
      if (!current()) return;
      owner.ready = null;
      setView({
        owner, ready: null, usOnly: acknowledged?.us_only === true, busy: false,
        error: acknowledged
          ? `Your US-only provider setting was saved as ${acknowledged.us_only ? 'on' : 'off'}, but the latest setting could not be loaded. Retry loading it.`
          : `${message ? `${message} ` : ''}Your provider location setting could not be loaded. Retry loading it.`,
      });
    } finally {
      if (current()) owner.operation = null;
    }
  }, []);

  const load = useCallback((owner: RoutingOwner) => {
    if (ownerRef.current !== owner || !ownerIsCurrent(owner) || owner.operation) return;
    const operation = new AbortController();
    owner.operation = operation;
    owner.ready = null;
    setView({ owner, ready: null, usOnly: false, busy: true, error: null });
    void read(owner, operation);
  }, [read]);

  useFocusEffect(useCallback(() => {
    const retire = () => {
      const owner = ownerRef.current;
      ownerRef.current = null;
      if (owner) {
        owner.active = false;
        owner.ready = null;
        owner.operation?.abort();
        owner.operation = null;
      }
    };
    const renew = () => {
      retire();
      const account = captureCloudAccountEpoch();
      const owner: RoutingOwner | null = account ? {
        account, tier: useTierStore.getState().tier, active: true, ready: null, operation: null,
      } : null;
      if (!owner || !ownerIsCurrent(owner)) {
        setView({ owner: null, ready: null, usOnly: false, busy: false, error: null });
        return;
      }
      ownerRef.current = owner;
      load(owner);
    };
    renew();
    const stopAccount = subscribeCloudAccountEpochChange(renew);
    const stopAuth = useAuthStore.subscribe((next, previous) => {
      if (next.clerkUserId !== previous.clerkUserId ||
        next.isClerkSignedIn !== previous.isClerkSignedIn ||
        next.isClerkLoaded !== previous.isClerkLoaded) renew();
    });
    const stopMode = useChatAppModeStore.subscribe((next, previous) => {
      if (next.appMode !== previous.appMode) renew();
    });
    const stopTier = useTierStore.subscribe((next, previous) => {
      if (next.tier !== previous.tier) renew();
    });
    return () => {
      retire();
      stopAccount();
      stopAuth();
      stopMode();
      stopTier();
    };
  }, [load]));

  const save = async (owner: RoutingOwner, ready: RoutingPreferences, usOnly: boolean) => {
    if (ownerRef.current !== owner || !ownerIsCurrent(owner) || !tierIsEligible(owner.tier) ||
      owner.ready !== ready || owner.operation) return;
    const operation = new AbortController();
    owner.operation = operation;
    owner.ready = null;
    setView({ owner, ready: null, usOnly: ready.us_only === true, busy: true, error: null });
    const current = () => ownerRef.current === owner && ownerIsCurrent(owner) &&
      owner.operation === operation && !operation.signal.aborted;
    let acknowledged: RoutingPreferences | null = null;
    let message: string | null = null;
    try {
      const body = await api.put<unknown>(ROUTING_PREFERENCES_PATH, { ...ready, us_only: usOnly }, {
        accountEpoch: owner.account, signal: operation.signal,
      });
      if (!current()) return;
      const receipt = RoutingPreferencesSchema.parse(body);
      if (typeof receipt.us_only !== 'boolean') throw new Error('Routing write unconfirmed');
      acknowledged = receipt;
    } catch {
      if (!current()) return;
      message = 'The save could not be confirmed. Check the latest setting before choosing again.';
    }
    if (current()) await read(owner, operation, message, acknowledged);
  };

  const owner = view.owner;
  const ready = owner && ownerRef.current === owner && ownerIsCurrent(owner) &&
    owner.ready === view.ready ? view.ready : null;
  const error = owner && ownerRef.current === owner && ownerIsCurrent(owner) ? view.error : null;

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
          value={owner && ownerIsCurrent(owner) ? view.usOnly : false}
          onValueChange={(value) => { if (owner && ready) void save(owner, ready, value); }}
          disabled={!eligible || !ready || view.busy}
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
          ? 'Only use models served by US-based providers.'
          : `Available on ${US_ONLY_PLAN_LABELS}.`}
      </Text>
      {owner && ownerIsCurrent(owner) && !view.busy && !ready ? (
        <Button
          title="Retry loading provider location"
          accessibilityLabel="Retry loading provider location"
          variant="ghost"
          onPress={() => { if (!owner.ready) load(owner); }}
        />
      ) : null}
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
