import { useCallback, useState, type ReactNode } from 'react';
import { Alert, View, type AccessibilityActionEvent } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Check, Layers } from 'lucide-react-native';
import { CLOUD_CODE_BUILT_IN_ENVIRONMENT } from '@agiworkforce/types';
import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { ActionMenuSheet } from '@/src/features/conversation-actions/RenameConversationModal';
import type { ConversationMenuAction } from '@/src/features/conversation-actions/useConversationActions';
import { useActionMenu } from '@/src/shared/hooks/useActionMenu';
import {
  CloudAccountRequired,
  CloudSyncBlockedBanner,
  SettingsGroup,
  SettingsInfo,
  SettingsScreenShell,
} from '@/src/features/settings/Common';
import { useCloudCodeAccess } from '@/src/features/cloud-code/useCloudCodeAccess';
import { describeCloudCodeError } from '@/src/features/cloud-code/service';
import {
  BUILT_IN_ENVIRONMENT_SUMMARY,
  CLOUD_ENVIRONMENTS_LOAD_FAILED,
  CLOUD_ENVIRONMENTS_SCREEN_TITLE,
  CLOUD_ENVIRONMENT_DEFAULT_FAILED,
  CLOUD_ENVIRONMENT_DELETE_FAILED,
  deleteEnvironmentConfirmation,
  describeCloudEnvironment,
  useCloudCodeEnvironments,
} from '@/src/features/cloud-code/cloudCodeEnvironments';

const SET_AS_DEFAULT = 'Set as default';
const DELETE = 'Delete';
const BUILT_IN_KEY = 'built-in';

function RowFrame({ children, isLast }: { children: ReactNode; isLast?: boolean }) {
  const colors = useThemeColors();
  return (
    <View
      style={{
        minHeight: 52,
        paddingHorizontal: 14,
        paddingVertical: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: colors.border,
        backgroundColor: colors.surfaceElevated,
      }}
    >
      {children}
    </View>
  );
}

function SwipeActions({
  actions,
  onDone,
}: {
  actions: ConversationMenuAction[];
  onDone: () => void;
}) {
  const colors = useThemeColors();
  return (
    <View style={{ flexDirection: 'row' }}>
      {actions.map((action) => (
        <Pressable
          key={action.key}
          onPress={() => {
            onDone();
            action.run();
          }}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          testID={`environment-swipe-${action.key}`}
          style={{
            minWidth: 88,
            minHeight: 44,
            paddingHorizontal: 14,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: action.destructive ? colors.dangerSurface : colors.neutralSurface,
          }}
        >
          <Text
            style={{
              color: action.destructive ? colors.agentError : colors.textPrimary,
              fontSize: typeScale.footnote,
              fontWeight: '600',
            }}
          >
            {action.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function EnvironmentRow({
  testID,
  name,
  summary,
  isDefault,
  busy,
  actions,
  onOpenMenu,
  isLast,
}: {
  testID: string;
  name: string;
  summary: string;
  isDefault: boolean;
  busy: boolean;
  actions: ConversationMenuAction[];
  onOpenMenu: () => void;
  isLast?: boolean;
}) {
  const colors = useThemeColors();
  const offersActions = actions.length > 0 && !busy;
  const runAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      actions.find((action) => action.key === event.nativeEvent.actionName)?.run();
    },
    [actions],
  );

  const row = (
    <Pressable
      testID={testID}
      onLongPress={offersActions ? onOpenMenu : undefined}
      accessible
      accessibilityLabel={`${name}. ${summary}`}
      accessibilityState={{ selected: isDefault, busy }}
      accessibilityActions={
        offersActions ? actions.map((action) => ({ name: action.key, label: action.label })) : []
      }
      onAccessibilityAction={runAccessibilityAction}
    >
      <RowFrame isLast={isLast}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={2} style={{ color: colors.textPrimary, fontSize: typeScale.body }}>
            {name}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: typeScale.footnote, marginTop: 2 }}>
            {summary}
          </Text>
        </View>
        {busy ? (
          <LoadingIndicator size="small" />
        ) : isDefault ? (
          <Check size={18} color={colors.textPrimary} />
        ) : null}
      </RowFrame>
    </Pressable>
  );

  return (
    <Swipeable
      enabled={offersActions}
      renderRightActions={
        offersActions
          ? (_progress, _drag, swipeable) => (
              <SwipeActions actions={actions} onDone={() => swipeable.close()} />
            )
          : undefined
      }
      overshootRight={false}
    >
      {row}
    </Swipeable>
  );
}

function EnvironmentList() {
  const colors = useThemeColors();
  const { load, retry, setDefault, remove } = useCloudCodeEnvironments();
  const actionMenu = useActionMenu();
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const changeDefault = useCallback(
    async (key: string, environmentId: string | null) => {
      setPending(key);
      setNotice(null);
      try {
        await setDefault(environmentId);
      } catch (error: unknown) {
        setNotice(describeCloudCodeError(error, CLOUD_ENVIRONMENT_DEFAULT_FAILED));
      } finally {
        setPending(null);
      }
    },
    [setDefault],
  );

  const deleteEnvironment = useCallback(
    async (environmentId: string) => {
      setPending(environmentId);
      setNotice(null);
      try {
        await remove(environmentId);
      } catch (error: unknown) {
        setNotice(describeCloudCodeError(error, CLOUD_ENVIRONMENT_DELETE_FAILED));
      } finally {
        setPending(null);
      }
    },
    [remove],
  );

  const confirmDelete = useCallback(
    (environmentId: string, name: string) => {
      const { title, message } = deleteEnvironmentConfirmation(name);
      Alert.alert(title, message, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: DELETE,
          style: 'destructive',
          onPress: () => void deleteEnvironment(environmentId),
        },
      ]);
    },
    [deleteEnvironment],
  );

  if (load.status === 'loading') {
    return (
      <SettingsGroup>
        <RowFrame isLast>
          <LoadingIndicator size="small" />
          <Text style={{ flex: 1, color: colors.textMuted, fontSize: typeScale.body }}>
            Loading environments
          </Text>
        </RowFrame>
      </SettingsGroup>
    );
  }

  if (load.status === 'unavailable') {
    return (
      <SettingsInfo
        testID="cloud-environments-unavailable"
        icon={Layers}
        title="Not available yet"
        body="Cloud environments are not available for your account yet. Sessions keep using the network access you choose when you start them."
      />
    );
  }

  if (load.status === 'error') {
    return (
      <SettingsGroup>
        <Pressable
          onPress={retry}
          accessibilityRole="button"
          accessibilityLabel={`${CLOUD_ENVIRONMENTS_LOAD_FAILED} Try again`}
          testID="cloud-environments-retry"
        >
          <RowFrame isLast>
            <Text
              accessibilityRole="alert"
              style={{ flex: 1, color: colors.agentError, fontSize: typeScale.footnote }}
            >
              {`${CLOUD_ENVIRONMENTS_LOAD_FAILED} `}
              <Text
                style={{
                  color: colors.textPrimary,
                  fontSize: typeScale.footnote,
                  fontWeight: '700',
                }}
              >
                Try again
              </Text>
            </Text>
          </RowFrame>
        </Pressable>
      </SettingsGroup>
    );
  }

  const savedDefault = load.environments.some((environment) => environment.isDefault);
  const locked = pending !== null;
  const builtInActions: ConversationMenuAction[] = savedDefault
    ? [
        {
          key: 'setDefault',
          label: SET_AS_DEFAULT,
          run: () => void changeDefault(BUILT_IN_KEY, null),
        },
      ]
    : [];

  return (
    <>
      <SettingsGroup>
        <EnvironmentRow
          testID="cloud-environment-built-in"
          name={CLOUD_CODE_BUILT_IN_ENVIRONMENT.name}
          summary={BUILT_IN_ENVIRONMENT_SUMMARY}
          isDefault={!savedDefault}
          busy={pending === BUILT_IN_KEY}
          actions={locked ? [] : builtInActions}
          onOpenMenu={() => actionMenu.open(CLOUD_CODE_BUILT_IN_ENVIRONMENT.name, builtInActions)}
          isLast={load.environments.length === 0 && !notice}
        />
        {load.environments.map((environment, index) => {
          const actions: ConversationMenuAction[] = [
            ...(environment.isDefault
              ? []
              : [
                  {
                    key: 'setDefault',
                    label: SET_AS_DEFAULT,
                    run: () => void changeDefault(environment.id, environment.id),
                  },
                ]),
            {
              key: 'delete',
              label: DELETE,
              destructive: true,
              run: () => confirmDelete(environment.id, environment.name),
            },
          ];
          return (
            <EnvironmentRow
              key={environment.id}
              testID={`cloud-environment-${environment.id}`}
              name={environment.name}
              summary={describeCloudEnvironment(environment)}
              isDefault={environment.isDefault}
              busy={pending === environment.id}
              actions={locked ? [] : actions}
              onOpenMenu={() => actionMenu.open(environment.name, actions)}
              isLast={index === load.environments.length - 1 && !notice}
            />
          );
        })}
        {notice ? (
          <RowFrame isLast>
            <Text
              accessibilityRole="alert"
              style={{ flex: 1, color: colors.agentError, fontSize: typeScale.footnote }}
            >
              {notice}
            </Text>
          </RowFrame>
        ) : null}
      </SettingsGroup>
      <ActionMenuSheet menu={actionMenu.menu} dismissLabel="Dismiss environment actions" />
    </>
  );
}

export default function CloudEnvironmentsScreen() {
  const access = useCloudCodeAccess();

  return (
    <SettingsScreenShell title={CLOUD_ENVIRONMENTS_SCREEN_TITLE} backHref="/(app)/settings/code">
      {access.ready ? (
        <EnvironmentList key={access.accountKey} />
      ) : access.signedIn ? (
        <CloudSyncBlockedBanner
          onSwitchToCloud={access.activate}
          message="Switch to AGI Cloud to manage cloud environments."
        />
      ) : (
        <CloudAccountRequired isLoading={false} onSignIn={access.activate} />
      )}
    </SettingsScreenShell>
  );
}
