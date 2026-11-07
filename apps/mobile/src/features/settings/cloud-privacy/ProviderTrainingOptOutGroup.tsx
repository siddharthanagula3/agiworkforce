import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { View } from 'react-native';
import { EyeOff } from 'lucide-react-native';
import {
  MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH,
  managedCloudPreferencesNamespacePath,
} from '@agiworkforce/cloud-contracts';
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
  parseProviderTrainingChoice,
  parseProviderTrainingReceipt,
  PRIVACY_NAMESPACE,
  PROVIDER_TRAINING_OPT_OUT_KEY,
  type ProviderTrainingChoice,
} from './providerTrainingPreference';
import { apiFetch } from '@/services/api';
import { SettingsGroup, SettingsSwitchRow } from '@/src/features/settings/Common';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

const LABEL = 'Only use models that do not train on your chats';

type TrainingOwner = {
  account: CloudAccountEpoch;
  active: boolean;
  ready: ProviderTrainingChoice | null;
  operation: AbortController | null;
};

type TrainingView = {
  owner: TrainingOwner | null;
  ready: ProviderTrainingChoice | null;
  optedOut: boolean;
  busy: boolean;
  error: string | null;
};

function ownerIsCurrent(owner: TrainingOwner): boolean {
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

export function ProviderTrainingOptOutGroup() {
  const colors = useThemeColors();
  const ownerRef = useRef<TrainingOwner | null>(null);
  const [view, setView] = useState<TrainingView>({
    owner: null,
    ready: null,
    optedOut: false,
    busy: false,
    error: null,
  });

  const read = useCallback(
    async (
      owner: TrainingOwner,
      operation: AbortController,
      message: string | null = null,
      acknowledged: ProviderTrainingChoice | null = null,
    ) => {
      const current = () =>
        ownerRef.current === owner &&
        ownerIsCurrent(owner) &&
        owner.operation === operation &&
        !operation.signal.aborted;
      try {
        const response = await apiFetch(
          managedCloudPreferencesNamespacePath(PRIVACY_NAMESPACE),
          {},
          {
            accountEpoch: owner.account,
            signal: operation.signal,
          },
        );
        if (!current()) return;
        if (!response.ok) throw new Error('Provider training preference unavailable');
        const body: unknown = await response.json();
        if (!current()) return;
        const ready = parseProviderTrainingChoice(body);
        owner.ready = ready;
        setView({ owner, ready, optedOut: ready.optedOut, busy: false, error: message });
      } catch {
        if (!current()) return;
        owner.ready = null;
        setView({
          owner,
          ready: null,
          optedOut: acknowledged?.optedOut ?? false,
          busy: false,
          error: acknowledged
            ? `Your model training setting was saved as ${acknowledged.optedOut ? 'on' : 'off'}, but the latest setting could not be loaded. Retry loading it.`
            : `${message ? `${message} ` : ''}Your model training setting could not be loaded. Retry loading it.`,
        });
      } finally {
        if (current()) owner.operation = null;
      }
    },
    [],
  );

  const load = useCallback(
    (owner: TrainingOwner) => {
      if (ownerRef.current !== owner || !ownerIsCurrent(owner) || owner.operation) return;
      const operation = new AbortController();
      owner.operation = operation;
      owner.ready = null;
      setView({ owner, ready: null, optedOut: false, busy: true, error: null });
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
        const owner: TrainingOwner | null = account
          ? { account, active: true, ready: null, operation: null }
          : null;
        if (!owner || !ownerIsCurrent(owner)) {
          setView({ owner: null, ready: null, optedOut: false, busy: false, error: null });
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

  const save = async (owner: TrainingOwner, ready: ProviderTrainingChoice, optedOut: boolean) => {
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
    setView({ owner, ready: null, optedOut: ready.optedOut, busy: true, error: null });
    const current = () =>
      ownerRef.current === owner &&
      ownerIsCurrent(owner) &&
      owner.operation === operation &&
      !operation.signal.aborted;
    let acknowledged: ProviderTrainingChoice | null = null;
    let message: string | null = null;
    try {
      const response = await apiFetch(
        MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            namespace: PRIVACY_NAMESPACE,
            patch: { [PROVIDER_TRAINING_OPT_OUT_KEY]: optedOut },
            expectedVersion: ready.version,
          }),
        },
        { accountEpoch: owner.account, signal: operation.signal },
      );
      if (!current()) return;
      if (response.status === 412) {
        message = 'Your settings changed elsewhere. Review the latest setting and choose again.';
      } else {
        if (!response.ok) throw new Error('Provider training preference write unconfirmed');
        const body: unknown = await response.json();
        if (!current()) return;
        acknowledged = parseProviderTrainingReceipt(body, optedOut);
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
        Model training
      </Text>
      <SettingsGroup>
        <SettingsSwitchRow
          label={LABEL}
          icon={EyeOff}
          value={owner && ownerIsCurrent(owner) ? view.optedOut : false}
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
        On the Free plan, this replaces free models whose providers may train on your chats.
      </Text>
      {owner && ownerIsCurrent(owner) && !view.busy && !ready ? (
        <Button
          title="Retry loading model training setting"
          accessibilityLabel="Retry loading model training setting"
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
