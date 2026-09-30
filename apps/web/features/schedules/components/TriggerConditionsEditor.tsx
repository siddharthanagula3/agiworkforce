'use client';

import { Button, Input } from '@agiworkforce/ui';
import { Plus, X } from 'lucide-react';
import {
  MANAGED_CLOUD_TRIGGER_CONDITION_OPERATORS,
  MANAGED_CLOUD_TRIGGER_EVENT_FIELDS,
  MANAGED_CLOUD_TRIGGER_MAX_CONDITIONS,
  TRIGGER_CONDITION_OTHER_FIELD,
  newTriggerConditionDraft,
  triggerConditionIsNumeric,
  triggerConditionTakesValue,
  type TriggerConditionDraft,
} from '@agiworkforce/cloud-contracts';
import type { TriggerSource } from '@/lib/triggers/trigger-types';

const selectClass =
  'h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

interface TriggerConditionsEditorProps {
  idPrefix: string;
  source: TriggerSource;
  drafts: readonly TriggerConditionDraft[];
  onChange: (drafts: TriggerConditionDraft[]) => void;
}

export function TriggerConditionsEditor({
  idPrefix,
  source,
  drafts,
  onChange,
}: TriggerConditionsEditorProps) {
  const suggestions = MANAGED_CLOUD_TRIGGER_EVENT_FIELDS[source];
  const update = (key: string, patch: Partial<TriggerConditionDraft>) =>
    onChange(drafts.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)));

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-foreground">Only when</legend>
      <p className="text-xs text-muted-foreground">
        Optional. Every condition must match for an event to start this task. Text compares without
        regard to case.
      </p>
      {drafts.map((draft, index) => {
        const rowId = `${idPrefix}-${draft.key}`;
        return (
          <div key={draft.key} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
            <div className="space-y-1">
              <select
                id={`${rowId}-field`}
                aria-label={`Condition ${index + 1} field`}
                className={selectClass}
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
                <Input
                  aria-label={`Condition ${index + 1} field path`}
                  value={draft.customField}
                  onChange={(event) => update(draft.key, { customField: event.target.value })}
                  placeholder="data.status"
                  spellCheck={false}
                  maxLength={400}
                />
              ) : null}
            </div>
            <select
              id={`${rowId}-operator`}
              aria-label={`Condition ${index + 1} comparison`}
              className={selectClass}
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
            {!triggerConditionTakesValue(draft.operator) ? (
              <span aria-hidden="true" />
            ) : (
              <Input
                aria-label={`Condition ${index + 1} value`}
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
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-10 w-10 p-0"
              aria-label={`Remove condition ${index + 1}`}
              onClick={() => onChange(drafts.filter((entry) => entry.key !== draft.key))}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        );
      })}
      {drafts.length < MANAGED_CLOUD_TRIGGER_MAX_CONDITIONS ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...drafts, newTriggerConditionDraft(source)])}
        >
          <Plus className="me-1 h-4 w-4" aria-hidden="true" />
          Add condition
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">
          A trigger holds up to {MANAGED_CLOUD_TRIGGER_MAX_CONDITIONS} conditions.
        </p>
      )}
    </fieldset>
  );
}
