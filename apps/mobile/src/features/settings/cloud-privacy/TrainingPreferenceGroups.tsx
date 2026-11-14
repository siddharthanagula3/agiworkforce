import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { View } from 'react-native';
import { EyeOff, MessageSquare, Mic, type LucideIcon } from 'lucide-react-native';
import {
  MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH,
  managedCloudPreferencesNamespacePath,
} from '@agiworkforce/cloud-contracts';
import { PRODUCT_COPYRIGHT_NAME } from '@agiworkforce/types';
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
  CHAT_MODEL_IMPROVEMENT_KEY,
  parseTrainingPreferenceReceipt,
  parseTrainingPreferences,
  PRIVACY_NAMESPACE,
  PROVIDER_TRAINING_OPT_OUT_KEY,
  TRAINING_PREFERENCES_OFF,
  VOICE_MODEL_IMPROVEMENT_KEY,
  type TrainingPreferenceKey,
  type TrainingPreferences,
  type TrainingPreferenceValues,
} from './trainingPreferences';
import { apiFetch } from '@/services/api';
import { SettingsGroup, SettingsSwitchRow } from '@/src/features/settings/Common';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

type Section = 'provider' | 'improvement';

type RowSpec = {
  key: TrainingPreferenceKey;
  label: string;
  description?: string;
  icon: LucideIcon;
  setting: string;
};

const PROVIDER_ROW: RowSpec = {
  key: PROVIDER_TRAINING_OPT_OUT_KEY,
  label: 'Only use models that do not train on your chats',
  icon: EyeOff,
  setting: 'model training',
};

const IMPROVEMENT_ROWS: readonly RowSpec[] = [
  {
    key: CHAT_MODEL_IMPROVEMENT_KEY,
    label: 'Use my chats',
    description: `Allow ${PRODUCT_COPYRIGHT_NAME} to use your chats to improve its own models.`,
    icon: MessageSquare,
    setting: 'chat improvement',
  },
  {
    key: VOICE_MODEL_IMPROVEMENT_KEY,
    label: 'Use my voice',
    description: `Allow ${PRODUCT_COPYRIGHT_NAME} to use your voice recordings to improve its own models.`,
    icon: Mic,
    setting: 'voice improvement',
  },
];

const IMPROVEMENT_HEADING = `Help improve ${PRODUCT_COPYRIGHT_NAME} models`;
const IMPROVEMENT_NOTE = `Both are off unless you turn them on. Nothing is used for this today. These choices apply only if ${PRODUCT_COPYRIGHT_NAME} starts improving its own models, and they don’t change which providers serve your chats.`;
const RETRY_LABEL = 'Retry loading model training settings';

function sectionOf(key: TrainingPreferenceKey): Section {
  return key === PROVIDER_TRAINING_OPT_OUT_KEY ? 'provider' : 'improvement';
}

function settingOf(key: TrainingPreferenceKey): string {
  return [PROVIDER_ROW, ...IMPROVEMENT_ROWS].find((row) => row.key === key)?.setting ?? '';
}

type Acknowledged = { key: TrainingPreferenceKey; preferences: TrainingPreferences };

type TrainingOwner = {
  account: CloudAccountEpoch;
  active: boolean;
  ready: TrainingPreferences | null;
  operation: AbortController | null;
};

type TrainingView = {
  owner: TrainingOwner | null;
  ready: TrainingPreferences | null;
  values: TrainingPreferenceValues;
  busy: boolean;
  error: string | null;
  errorSection: Section;
};

const IDLE_VIEW: TrainingView = {
  owner: null,
  ready: null,
  values: TRAINING_PREFERENCES_OFF,
  busy: false,
  error: null,
  errorSection: 'provider',
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

export function TrainingPreferenceGroups() {
  const colors = useThemeColors();
  const ownerRef = useRef<TrainingOwner | null>(null);
  const [view, setView] = useState<TrainingView>(IDLE_VIEW);

  const read = useCallback(
    async (
      owner: TrainingOwner,
      operation: AbortController,
      message: string | null = null,
      section: Section = 'provider',
      acknowledged: Acknowledged | null = null,
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
        if (!response.ok) throw new Error('Training preferences unavailable');
        const body: unknown = await response.json();
        if (!current()) return;
        const ready = parseTrainingPreferences(body);
        owner.ready = ready;
        setView({
          owner,
          ready,
          values: ready.values,
          busy: false,
          error: message,
          errorSection: section,
        });
      } catch {
        if (!current()) return;
        owner.ready = null;
        const saved = acknowledged?.preferences.values[acknowledged.key];
        setView({
          owner,
          ready: null,
          values: acknowledged?.preferences.values ?? TRAINING_PREFERENCES_OFF,
          busy: false,
          error: acknowledged
            ? `Your ${settingOf(acknowledged.key)} setting was saved as ${saved ? 'on' : 'off'}, but the latest settings could not be loaded. Retry loading them.`
            : `${message ? `${message} ` : ''}Your model training settings could not be loaded. Retry loading them.`,
          errorSection: section,
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
      setView({ ...IDLE_VIEW, owner, busy: true });
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
          setView(IDLE_VIEW);
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

  const save = async (
    owner: TrainingOwner,
    ready: TrainingPreferences,
    key: TrainingPreferenceKey,
    value: boolean,
  ) => {
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
    const section = sectionOf(key);
    setView({
      owner,
      ready: null,
      values: ready.values,
      busy: true,
      error: null,
      errorSection: section,
    });
    const current = () =>
      ownerRef.current === owner &&
      ownerIsCurrent(owner) &&
      owner.operation === operation &&
      !operation.signal.aborted;
    let acknowledged: Acknowledged | null = null;
    let message: string | null = null;
    try {
      const response = await apiFetch(
        MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            namespace: PRIVACY_NAMESPACE,
            patch: { [key]: value },
            expectedVersion: ready.version,
          }),
        },
        { accountEpoch: owner.account, signal: operation.signal },
      );
      if (!current()) return;
      if (response.status === 412) {
        message = 'Your settings changed elsewhere. Review the latest setting and choose again.';
      } else {
        if (!response.ok) throw new Error('Training preference write unconfirmed');
        const body: unknown = await response.json();
        if (!current()) return;
        acknowledged = { key, preferences: parseTrainingPreferenceReceipt(body, key, value) };
      }
    } catch {
      if (!current()) return;
      message = 'The save could not be confirmed. Check the latest setting before choosing again.';
    }
    if (current()) await read(owner, operation, message, section, acknowledged);
  };

  const owner = view.owner;
  const live = owner !== null && ownerRef.current === owner && ownerIsCurrent(owner);
  const ready = owner && live && owner.ready === view.ready ? view.ready : null;
  const error = live ? view.error : null;

  const header = (title: string) => (
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
      {title}
    </Text>
  );

  const note = (body: string) => (
    <Text
      style={{
        color: colors.textMuted,
        fontSize: typeScale.caption,
        lineHeight: 17,
        marginTop: 8,
        paddingHorizontal: 2,
      }}
    >
      {body}
    </Text>
  );

  const row = (spec: RowSpec, isLast: boolean) => (
    <SettingsSwitchRow
      key={spec.key}
      label={spec.label}
      description={spec.description}
      icon={spec.icon}
      value={live ? view.values[spec.key] : false}
      onValueChange={(value) => {
        if (owner && ready) void save(owner, ready, spec.key, value);
      }}
      disabled={!ready || view.busy}
      isLast={isLast}
    />
  );

  const status = (section: Section) =>
    view.errorSection === section ? (
      <>
        {live && !view.busy && !ready ? (
          <Button
            title={RETRY_LABEL}
            accessibilityLabel={RETRY_LABEL}
            variant="ghost"
            onPress={() => {
              if (owner && !owner.ready) load(owner);
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
      </>
    ) : null;

  return (
    <>
      <View style={{ marginBottom: 18 }}>
        {header('Model training')}
        <SettingsGroup>{row(PROVIDER_ROW, true)}</SettingsGroup>
        {note(
          'On the Free plan, this replaces free models whose providers may train on your chats.',
        )}
        {status('provider')}
      </View>
      <View style={{ marginBottom: 18 }}>
        {header(IMPROVEMENT_HEADING)}
        <SettingsGroup>
          {IMPROVEMENT_ROWS.map((spec, index) => row(spec, index === IMPROVEMENT_ROWS.length - 1))}
        </SettingsGroup>
        {note(IMPROVEMENT_NOTE)}
        {status('improvement')}
      </View>
    </>
  );
}
