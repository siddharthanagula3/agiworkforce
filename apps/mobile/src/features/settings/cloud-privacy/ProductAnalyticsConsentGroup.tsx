import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { View } from 'react-native';
import { BarChart3 } from 'lucide-react-native';
import {
  PRODUCT_ANALYTICS_CONSENT_PATH,
  PRODUCT_ANALYTICS_CONSENT_PURPOSE,
} from '@agiworkforce/types';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
  subscribeCloudAccountEpochChange,
  type CloudAccountEpoch,
} from '@/src/features/auth/services/cloudAccountSession';
import {
  parseProductAnalyticsChoice,
  parseProductAnalyticsReceipt,
  type ProductAnalyticsChoice,
} from './productAnalyticsConsent';
import { apiFetch } from '@/services/api';
import { SettingsGroup, SettingsSwitchRow } from '@/src/features/settings/Common';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

const LABEL = 'Product analytics';

type ConsentOwner = {
  account: CloudAccountEpoch;
  active: boolean;
  ready: ProductAnalyticsChoice | null;
  operation: AbortController | null;
};

type ConsentView = {
  owner: ConsentOwner | null;
  ready: ProductAnalyticsChoice | null;
  granted: boolean;
  busy: boolean;
  error: string | null;
};

function ownerIsCurrent(owner: ConsentOwner): boolean {
  const auth = useAuthStore.getState();
  return (
    owner.active &&
    isCloudAccountEpochCurrent(owner.account) &&
    auth.isClerkLoaded &&
    auth.isClerkSignedIn &&
    auth.clerkUserId === owner.account.ownerId &&
    useChatAppModeStore.getState().appMode === 'cloud'
  );
}

export function ProductAnalyticsConsentGroup() {
  const colors = useThemeColors();
  const ownerRef = useRef<ConsentOwner | null>(null);
  const [view, setView] = useState<ConsentView>({
    owner: null,
    ready: null,
    granted: false,
    busy: false,
    error: null,
  });

  const read = useCallback(
    async (
      owner: ConsentOwner,
      operation: AbortController,
      message: string | null = null,
      acknowledged: ProductAnalyticsChoice | null = null,
    ) => {
      const current = () =>
        ownerRef.current === owner &&
        ownerIsCurrent(owner) &&
        owner.operation === operation &&
        !operation.signal.aborted;
      try {
        const response = await apiFetch(
          PRODUCT_ANALYTICS_CONSENT_PATH,
          {},
          {
            accountEpoch: owner.account,
            signal: operation.signal,
          },
        );
        if (!current()) return;
        if (!response.ok) throw new Error('Consent unavailable');
        const body: unknown = await response.json();
        if (!current()) return;
        const ready = parseProductAnalyticsChoice(body);
        owner.ready = ready;
        setView({ owner, ready, granted: ready.granted, busy: false, error: message });
      } catch {
        if (!current()) return;
        owner.ready = null;
        setView({
          owner,
          ready: null,
          granted: acknowledged?.granted ?? false,
          busy: false,
          error: acknowledged
            ? `Product analytics was saved as ${acknowledged.granted ? 'on' : 'off'}, but the latest setting could not be loaded. Retry loading it.`
            : `${message ? `${message} ` : ''}Your product analytics choice could not be loaded. Retry loading it.`,
        });
      } finally {
        if (current()) owner.operation = null;
      }
    },
    [],
  );

  const load = useCallback(
    (owner: ConsentOwner) => {
      if (ownerRef.current !== owner || !ownerIsCurrent(owner) || owner.operation) return;
      const operation = new AbortController();
      owner.operation = operation;
      owner.ready = null;
      setView({ owner, ready: null, granted: false, busy: true, error: null });
      void read(owner, operation);
    },
    [read],
  );

  useFocusEffect(
    useCallback(() => {
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
        const owner: ConsentOwner | null = account
          ? { account, active: true, ready: null, operation: null }
          : null;
        if (!owner || !ownerIsCurrent(owner)) {
          setView({ owner: null, ready: null, granted: false, busy: false, error: null });
          return;
        }
        ownerRef.current = owner;
        load(owner);
      };
      renew();
      const stopAccount = subscribeCloudAccountEpochChange(renew);
      const stopAuth = useAuthStore.subscribe((next, previous) => {
        if (
          next.clerkUserId !== previous.clerkUserId ||
          next.isClerkSignedIn !== previous.isClerkSignedIn ||
          next.isClerkLoaded !== previous.isClerkLoaded
        )
          renew();
      });
      const stopMode = useChatAppModeStore.subscribe((next, previous) => {
        if (next.appMode !== previous.appMode) renew();
      });
      return () => {
        retire();
        stopAccount();
        stopAuth();
        stopMode();
      };
    }, [load]),
  );

  const save = async (owner: ConsentOwner, ready: ProductAnalyticsChoice, granted: boolean) => {
    if (
      ownerRef.current !== owner ||
      !ownerIsCurrent(owner) ||
      owner.ready !== ready ||
      owner.operation
    )
      return;
    const operation = new AbortController();
    owner.operation = operation;
    owner.ready = null;
    setView({ owner, ready: null, granted: ready.granted, busy: true, error: null });
    const current = () =>
      ownerRef.current === owner &&
      ownerIsCurrent(owner) &&
      owner.operation === operation &&
      !operation.signal.aborted;
    let acknowledged: ProductAnalyticsChoice | null = null;
    let message: string | null = null;
    try {
      const response = await apiFetch(
        PRODUCT_ANALYTICS_CONSENT_PATH,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            decisions: [{ purpose: PRODUCT_ANALYTICS_CONSENT_PURPOSE, granted }],
            surface: 'mobile-settings',
            noticeVersion: ready.noticeVersion,
          }),
        },
        { accountEpoch: owner.account, signal: operation.signal },
      );
      if (!current()) return;
      if (response.status === 409) {
        message = 'The privacy notice changed. Review it and choose again.';
      } else {
        if (!response.ok) throw new Error('Consent write unconfirmed');
        const body: unknown = await response.json();
        if (!current()) return;
        acknowledged = parseProductAnalyticsReceipt(body, { ...ready, granted });
      }
    } catch {
      if (!current()) return;
      message = 'The save could not be confirmed. Check the latest setting before choosing again.';
    }
    if (current()) await read(owner, operation, message, acknowledged);
  };

  const owner = view.owner;
  const ready =
    owner && ownerRef.current === owner && ownerIsCurrent(owner) && owner.ready === view.ready
      ? view.ready
      : null;
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
        Analytics
      </Text>
      <SettingsGroup>
        <SettingsSwitchRow
          label={LABEL}
          icon={BarChart3}
          value={owner && ownerIsCurrent(owner) ? view.granted : false}
          onValueChange={(value) => {
            if (owner && ready) void save(owner, ready, value);
          }}
          disabled={!ready || view.busy}
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
        Usage events like a stopped response, never your messages or files.
      </Text>
      {owner && ownerIsCurrent(owner) && !view.busy && !ready ? (
        <Button
          title="Retry loading analytics choice"
          accessibilityLabel="Retry loading analytics choice"
          variant="ghost"
          onPress={() => {
            if (!owner.ready) load(owner);
          }}
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
