import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { X } from 'lucide-react-native';
import {
  MANAGED_CLOUD_TRIGGER_CONDITION_OPERATORS,
  MANAGED_CLOUD_TRIGGER_EVENT_FIELDS,
  MANAGED_CLOUD_TRIGGER_MAX_CONDITIONS,
  MANAGED_CLOUD_TRIGGER_SOURCE_LABELS,
  MANAGED_CLOUD_TRIGGER_SOURCE_OPTIONS,
  TRIGGER_CONDITION_OTHER_FIELD,
  describeTriggerConditions,
  managedCloudMailboxWatchNotice,
  managedCloudTriggerEventTypesFromText,
  managedCloudTriggerSourceAvailable,
  newTriggerConditionDraft,
  triggerConditionDraftsFrom,
  triggerConditionTakesValue,
  triggerConditionsFromDrafts,
  type ManagedCloudEventTrigger,
  type ManagedCloudEventTriggerCreated,
  type ManagedCloudTriggerSource,
  type TriggerConditionDraft,
} from '@agiworkforce/cloud-contracts';
import { CONNECTORS_COMING_SOON_LABEL } from '@agiworkforce/types';

import { Button } from '@/components/ui/button';
import { PressableBox } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { API_URL } from '@/lib/constants';
import { useCopyAction } from '@/src/shared/hooks/useCopyAction';
import {
  Chip,
  CloudFeatureGate,
  ErrorBanner,
  LoadingRows,
  MetaText,
  ScreenHeader,
  SectionCard,
  TextField,
  ToggleRow,
  confirmIrreversible,
} from '@/src/shared/components/cloud-screen';
import { useCloudFeatureAccess } from '@/src/shared/hooks/useCloudFeatureAccess';
import { useGoBack } from '@/src/shared/hooks/useGoBack';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { cloudActionError } from '@/src/shared/utils/cloudActionError';
import {
  createScheduleTrigger,
  deleteScheduleTrigger,
  listScheduleTriggers,
  registerScheduleTriggerWatch,
  saveScheduleTriggerConditions,
  setScheduleTriggerEnabled,
} from './triggersService';

function ConditionsEditor({
  source,
  drafts,
  onChange,
}: {
  source: ManagedCloudTriggerSource;
  drafts: TriggerConditionDraft[];
  onChange: (next: TriggerConditionDraft[]) => void;
}) {
  const colors = useThemeColors();
  const fields = MANAGED_CLOUD_TRIGGER_EVENT_FIELDS[source];
  const update = (key: string, patch: Partial<TriggerConditionDraft>) =>
    onChange(drafts.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)));
  return (
    <View style={{ gap: 10 }}>
      <MetaText>Run only when every condition matches. Leave empty to run on every event.</MetaText>
      {drafts.map((draft, index) => (
        <View
          key={draft.key}
          style={{
            gap: 8,
            borderTopWidth: index === 0 ? 0 : 1,
            borderColor: colors.border,
            paddingTop: index === 0 ? 0 : 10,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text
              style={{
                flex: 1,
                color: colors.textSecondary,
                fontSize: typeScale.footnote,
                fontWeight: '600',
              }}
            >
              {`Condition ${index + 1}`}
            </Text>
            <PressableBox
              onPress={() => onChange(drafts.filter((entry) => entry.key !== draft.key))}
              accessibilityRole="button"
              accessibilityLabel={`Remove condition ${index + 1}`}
              hitSlop={8}
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
            >
              <X size={16} color={colors.textMuted} />
            </PressableBox>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {fields.map((field) => (
              <Chip
                key={field.path}
                label={field.label}
                selected={draft.field === field.path}
                onPress={() => update(draft.key, { field: field.path })}
              />
            ))}
            <Chip
              label="Other field"
              selected={draft.field === TRIGGER_CONDITION_OTHER_FIELD}
              onPress={() => update(draft.key, { field: TRIGGER_CONDITION_OTHER_FIELD })}
            />
          </View>
          {draft.field === TRIGGER_CONDITION_OTHER_FIELD ? (
            <TextField
              label="Field path"
              value={draft.customField}
              autoCapitalize="none"
              placeholder="data.field"
              onChangeText={(customField) => update(draft.key, { customField })}
            />
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {MANAGED_CLOUD_TRIGGER_CONDITION_OPERATORS.map((operator) => (
              <Chip
                key={operator.value}
                label={operator.label}
                selected={draft.operator === operator.value}
                onPress={() => update(draft.key, { operator: operator.value })}
              />
            ))}
          </View>
          {triggerConditionTakesValue(draft.operator) ? (
            <TextField
              label="Value"
              value={draft.value}
              autoCapitalize="none"
              placeholder={draft.operator === 'in' ? 'one, two, three' : 'Value to compare'}
              onChangeText={(value) => update(draft.key, { value })}
            />
          ) : null}
        </View>
      ))}
      {drafts.length < MANAGED_CLOUD_TRIGGER_MAX_CONDITIONS ? (
        <Button
          title="Add condition"
          size="sm"
          variant="outline"
          onPress={() => onChange([...drafts, newTriggerConditionDraft(source)])}
        />
      ) : null}
    </View>
  );
}

function CreatedSecrets({ created }: { created: ManagedCloudEventTriggerCreated }) {
  const { copy } = useCopyAction();
  const url = `${API_URL}${created.webhookPath}`;
  return (
    <SectionCard
      title="Trigger added"
      description="Copy these now. The signing secret is shown once and a new trigger gets a new one."
    >
      <MetaText>{`Webhook URL: ${url}`}</MetaText>
      <Button title="Copy webhook URL" size="sm" variant="outline" onPress={() => void copy(url)} />
      {created.signingSecret ? (
        <Button
          title="Copy signing secret"
          size="sm"
          variant="outline"
          onPress={() => void copy(created.signingSecret!)}
        />
      ) : null}
      {created.verificationCode ? (
        <MetaText>{`Verification code: ${created.verificationCode}`}</MetaText>
      ) : null}
    </SectionCard>
  );
}

export function ScheduleTriggersScreen() {
  const colors = useThemeColors();
  const { id, name } = useLocalSearchParams<{ id?: string; name?: string }>();
  const scheduleId = typeof id === 'string' ? id : '';
  const scheduleName = typeof name === 'string' && name ? name : 'this schedule';
  const access = useCloudFeatureAccess();
  const goBack = useGoBack('/(app)/schedules');
  const [triggers, setTriggers] = useState<ManagedCloudEventTrigger[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [source, setSource] = useState<ManagedCloudTriggerSource>('github');
  const [triggerName, setTriggerName] = useState('');
  const [account, setAccount] = useState('');
  const [eventTypes, setEventTypes] = useState('');
  const [debounce, setDebounce] = useState('0');
  const [drafts, setDrafts] = useState<TriggerConditionDraft[]>([]);
  const [created, setCreated] = useState<ManagedCloudEventTriggerCreated | null>(null);
  const [editing, setEditing] = useState<{ id: string; drafts: TriggerConditionDraft[] } | null>(
    null,
  );

  const option = MANAGED_CLOUD_TRIGGER_SOURCE_OPTIONS.find((entry) => entry.value === source)!;

  const load = useCallback(async () => {
    setError(null);
    try {
      setTriggers(await listScheduleTriggers(scheduleId));
    } catch (loadError) {
      setError(cloudActionError(loadError, 'Could not read the triggers for this schedule.'));
    }
  }, [scheduleId]);

  useEffect(() => {
    if (access.ready && scheduleId) void load();
  }, [access.ready, load, scheduleId]);

  const run = useCallback(
    async (action: () => Promise<unknown>, failure: string) => {
      setError(null);
      try {
        await action();
        await load();
        return true;
      } catch (actionError) {
        setError(cloudActionError(actionError, failure));
        return false;
      }
    },
    [load],
  );

  const create = useCallback(async () => {
    const parsed = triggerConditionsFromDrafts(drafts);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setSaving(true);
    setCreated(null);
    try {
      const result = await createScheduleTrigger({
        taskId: scheduleId,
        name: triggerName.trim() || `${MANAGED_CLOUD_TRIGGER_SOURCE_LABELS[source]} trigger`,
        source,
        eventTypes: managedCloudTriggerEventTypesFromText(eventTypes),
        ...(option.accountLabel ? { sourceAccount: account.trim() } : {}),
        debounceSeconds: Number(debounce || '0'),
        conditions: parsed.conditions,
      });
      setCreated(result);
      setAdding(false);
      setTriggerName('');
      setAccount('');
      setEventTypes('');
      setDrafts([]);
      await load();
    } catch (createError) {
      setError(cloudActionError(createError, 'Could not add that trigger.'));
    } finally {
      setSaving(false);
    }
  }, [
    account,
    debounce,
    drafts,
    eventTypes,
    load,
    option.accountLabel,
    scheduleId,
    source,
    triggerName,
  ]);

  const remove = useCallback(
    async (trigger: ManagedCloudEventTrigger) => {
      const confirmed = await confirmIrreversible({
        title: `Delete the ${MANAGED_CLOUD_TRIGGER_SOURCE_LABELS[trigger.source]} trigger “${trigger.name}”?`,
        consequence: `${scheduleName} stops running on these events, and the trigger’s URL, secret and history are deleted for good.`,
        actionLabel: 'Delete trigger',
      });
      if (confirmed) {
        await run(() => deleteScheduleTrigger(trigger.id), 'Could not delete that trigger.');
      }
    },
    [run, scheduleName],
  );

  const saveConditions = useCallback(async () => {
    if (!editing) return;
    const parsed = triggerConditionsFromDrafts(editing.drafts);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    if (
      await run(
        () => saveScheduleTriggerConditions(editing.id, parsed.conditions),
        'Could not save the conditions for that trigger.',
      )
    ) {
      setEditing(null);
    }
  }, [editing, run]);

  if (!access.ready) {
    return (
      <CloudFeatureGate
        title="Triggers"
        feature="Triggers"
        description="Event triggers run in AGI Cloud; switching won’t upload your local chats."
        signedIn={access.signedIn}
        onBack={goBack}
        onContinue={access.continueToCloud}
      />
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceBase }}>
      <ScreenHeader
        title={`Triggers for ${scheduleName}`}
        onBack={goBack}
        trailing={
          <Button
            title={adding ? 'Cancel' : 'Add'}
            size="sm"
            variant="outline"
            accessibilityLabel={adding ? 'Cancel adding a trigger' : 'Add trigger'}
            onPress={() => setAdding((open) => !open)}
          />
        }
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48, gap: 12 }}
      >
        <MetaText>
          An event from one of these sources starts this task, with the event attached to the run.
        </MetaText>
        {error ? <ErrorBanner message={error} /> : null}
        {created ? <CreatedSecrets created={created} /> : null}
        {adding ? (
          <SectionCard title="New trigger">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {MANAGED_CLOUD_TRIGGER_SOURCE_OPTIONS.map((entry) => {
                const available = managedCloudTriggerSourceAvailable(entry.value);
                return (
                  <Chip
                    key={entry.value}
                    label={
                      available ? entry.label : `${entry.label} · ${CONNECTORS_COMING_SOON_LABEL}`
                    }
                    selected={source === entry.value}
                    onPress={
                      available
                        ? () => {
                            setSource(entry.value);
                            setDrafts([]);
                          }
                        : undefined
                    }
                  />
                );
              })}
            </View>
            <MetaText>{option.note}</MetaText>
            <TextField
              label="Name"
              value={triggerName}
              placeholder={`${MANAGED_CLOUD_TRIGGER_SOURCE_LABELS[source]} trigger`}
              onChangeText={setTriggerName}
            />
            {option.accountLabel ? (
              <TextField
                label={option.accountLabel}
                value={account}
                autoCapitalize="none"
                placeholder={option.accountPlaceholder}
                onChangeText={setAccount}
              />
            ) : null}
            <TextField
              label="Event types"
              value={eventTypes}
              autoCapitalize="none"
              placeholder="Every event"
              hint={
                option.eventTypes
                  ? `Comma separated: ${option.eventTypes.join(', ')}`
                  : 'Comma separated, or leave empty for every event'
              }
              onChangeText={setEventTypes}
            />
            <TextField
              label="Wait before running (seconds)"
              value={debounce}
              keyboardType="number-pad"
              hint="Events that arrive inside this window start one run, not several."
              onChangeText={setDebounce}
            />
            <ConditionsEditor source={source} drafts={drafts} onChange={setDrafts} />
            <Button
              title="Save trigger"
              loading={saving}
              disabled={saving}
              onPress={() => void create()}
            />
          </SectionCard>
        ) : null}
        {triggers === null ? (
          <LoadingRows count={2} />
        ) : triggers.length === 0 && !adding ? (
          <MetaText>No triggers yet. This schedule runs only on its timer.</MetaText>
        ) : (
          triggers.map((trigger) => {
            const watchNotice = managedCloudMailboxWatchNotice(trigger);
            const isEditing = editing?.id === trigger.id;
            return (
              <SectionCard key={trigger.id} title={trigger.name}>
                <MetaText>
                  {[
                    MANAGED_CLOUD_TRIGGER_SOURCE_LABELS[trigger.source],
                    trigger.sourceAccount,
                    trigger.eventTypes.join(', '),
                    trigger.lastFiredAt
                      ? `last fired ${new Date(trigger.lastFiredAt).toLocaleString()}`
                      : 'not fired yet',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </MetaText>
                {trigger.conditions.length > 0 ? (
                  <MetaText>{`Only when ${describeTriggerConditions(trigger.conditions, trigger.source)}`}</MetaText>
                ) : null}
                {watchNotice ? <MetaText>{watchNotice}</MetaText> : null}
                <ToggleRow
                  label="Turned on"
                  value={trigger.isEnabled}
                  onValueChange={(isEnabled) =>
                    void run(
                      () => setScheduleTriggerEnabled(trigger.id, isEnabled),
                      'Could not change that trigger.',
                    )
                  }
                />
                {watchNotice && trigger.source === 'gmail' ? (
                  <Button
                    title="Register mailbox watch"
                    size="sm"
                    variant="outline"
                    onPress={() =>
                      void run(
                        () => registerScheduleTriggerWatch(trigger.id),
                        'Could not register the mailbox watch.',
                      )
                    }
                  />
                ) : null}
                {isEditing ? (
                  <>
                    <ConditionsEditor
                      source={trigger.source}
                      drafts={editing.drafts}
                      onChange={(next) => setEditing({ id: trigger.id, drafts: next })}
                    />
                    <Button
                      title="Save conditions"
                      size="sm"
                      onPress={() => void saveConditions()}
                    />
                  </>
                ) : (
                  <Button
                    title="Edit conditions"
                    size="sm"
                    variant="outline"
                    onPress={() =>
                      setEditing({
                        id: trigger.id,
                        drafts: triggerConditionDraftsFrom(trigger.conditions, trigger.source),
                      })
                    }
                  />
                )}
                <Button
                  title="Delete trigger"
                  size="sm"
                  variant="destructive"
                  onPress={() => void remove(trigger)}
                />
              </SectionCard>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
