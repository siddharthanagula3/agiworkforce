import { Plus, X } from 'lucide-react';
import {
  MANAGED_CLOUD_TRIGGER_CONDITION_OPERATORS,
  MANAGED_CLOUD_TRIGGER_EVENT_FIELDS,
  MANAGED_CLOUD_TRIGGER_MAX_CONDITIONS,
  TRIGGER_CONDITION_OTHER_FIELD,
  newTriggerConditionDraft,
  triggerConditionIsNumeric,
  triggerConditionTakesValue,
  type ManagedCloudTriggerSource,
  type TriggerConditionDraft,
} from '@agiworkforce/cloud-contracts';

const FIELD_CLASS =
  'w-full rounded-lg border border-[var(--chat-border)] bg-[var(--chat-surface-base)] px-3 py-2 text-sm text-[var(--chat-text-primary)] placeholder:text-[var(--chat-text-muted)] focus:border-[var(--chat-accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--chat-accent-primary)]/20';
const SECONDARY_BUTTON =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--chat-border)] px-3 py-2 text-sm font-medium text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)] disabled:cursor-not-allowed disabled:opacity-50';

interface DesktopTriggerConditionsEditorProps {
  source: ManagedCloudTriggerSource;
  drafts: readonly TriggerConditionDraft[];
  onChange: (drafts: TriggerConditionDraft[]) => void;
}

export function DesktopTriggerConditionsEditor({
  source,
  drafts,
  onChange,
}: DesktopTriggerConditionsEditorProps) {
  const suggestions = MANAGED_CLOUD_TRIGGER_EVENT_FIELDS[source];
  const update = (key: string, patch: Partial<TriggerConditionDraft>) =>
    onChange(drafts.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)));

  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-xs font-medium text-[var(--chat-text-secondary)]">
        Only when
      </legend>
      <p className="text-xs text-[var(--chat-text-muted)]">
        Optional. Every condition must match for an event to start this task. Text compares without
        regard to case.
      </p>
      {drafts.map((draft, index) => (
        <div key={draft.key} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <div className="space-y-1">
            <select
              aria-label={`Condition ${index + 1} field`}
              className={FIELD_CLASS}
              value={draft.field}
              onChange={(event) => update(draft.key, { field: event.target.value })}
            >
              {suggestions.map((entry) => (
                <option key={entry.path} value={entry.path}>
                  {entry.label}
                </option>
              ))}
              <option value={TRIGGER_CONDITION_OTHER_FIELD}>Other field…</option>
            </select>
            {draft.field === TRIGGER_CONDITION_OTHER_FIELD ? (
              <input
                aria-label={`Condition ${index + 1} field path`}
                className={FIELD_CLASS}
                value={draft.customField}
                onChange={(event) => update(draft.key, { customField: event.target.value })}
                placeholder="data.status"
                spellCheck={false}
                maxLength={400}
              />
            ) : null}
          </div>
          <select
            aria-label={`Condition ${index + 1} comparison`}
            className={FIELD_CLASS}
            value={draft.operator}
            onChange={(event) =>
              update(draft.key, {
                operator: event.target.value as TriggerConditionDraft['operator'],
              })
            }
          >
            {MANAGED_CLOUD_TRIGGER_CONDITION_OPERATORS.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
          {triggerConditionTakesValue(draft.operator) ? (
            <input
              aria-label={`Condition ${index + 1} value`}
              className={FIELD_CLASS}
              value={draft.value}
              onChange={(event) => update(draft.key, { value: event.target.value })}
              placeholder={
                draft.operator === 'in'
                  ? 'first, second'
                  : triggerConditionIsNumeric(draft.operator)
                    ? '0'
                    : 'Value'
              }
              inputMode={triggerConditionIsNumeric(draft.operator) ? 'decimal' : undefined}
              spellCheck={false}
              maxLength={500}
            />
          ) : (
            <span aria-hidden="true" />
          )}
          <button
            type="button"
            aria-label={`Remove condition ${index + 1}`}
            onClick={() => onChange(drafts.filter((entry) => entry.key !== draft.key))}
            className={SECONDARY_BUTTON}
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      ))}
      {drafts.length < MANAGED_CLOUD_TRIGGER_MAX_CONDITIONS ? (
        <button
          type="button"
          onClick={() => onChange([...drafts, newTriggerConditionDraft(source)])}
          className={SECONDARY_BUTTON}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add condition
        </button>
      ) : (
        <p className="text-xs text-[var(--chat-text-muted)]">
          A trigger holds up to {MANAGED_CLOUD_TRIGGER_MAX_CONDITIONS} conditions.
        </p>
      )}
    </fieldset>
  );
}
