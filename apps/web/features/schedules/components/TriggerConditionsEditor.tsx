'use client';

import { Button, Input } from '@agiworkforce/ui';
import { Plus, X } from 'lucide-react';
import type {
  FieldCondition,
  FieldConditionOperator,
  FieldConditionValue,
} from '@/lib/automation/field-conditions';
import type { TriggerSource } from '@/lib/triggers/trigger-types';

export const MAX_TRIGGER_CONDITIONS = 10;

const OTHER_FIELD = '__other__';

export interface TriggerConditionDraft {
  key: string;
  field: string;
  customField: string;
  operator: FieldConditionOperator;
  value: string;
}

const FIELD_SUGGESTIONS: Record<TriggerSource, ReadonlyArray<{ label: string; path: string }>> = {
  github: [
    { label: 'Repository', path: 'data.repository' },
    { label: 'Action', path: 'data.action' },
    { label: 'Branch', path: 'data.branch' },
    { label: 'Author', path: 'data.author' },
    { label: 'Title', path: 'data.title' },
    { label: 'Base branch', path: 'data.baseRef' },
    { label: 'Head branch', path: 'data.headRef' },
    { label: 'Is draft', path: 'data.draft' },
    { label: 'Is merged', path: 'data.merged' },
    { label: 'Conclusion', path: 'data.conclusion' },
    { label: 'Workflow or check name', path: 'data.name' },
  ],
  gmail: [
    { label: 'From', path: 'data.from' },
    { label: 'To', path: 'data.to' },
    { label: 'Subject', path: 'data.subject' },
    { label: 'Preview', path: 'data.snippet' },
    { label: 'Labels', path: 'data.labels' },
  ],
  slack: [
    { label: 'Channel', path: 'data.channel' },
    { label: 'User', path: 'data.user' },
    { label: 'Message text', path: 'data.text' },
  ],
  google_calendar: [{ label: 'Resource state', path: 'data.resourceState' }],
  connector: [],
};

const OPERATORS: ReadonlyArray<{ value: FieldConditionOperator; label: string }> = [
  { value: 'equals', label: 'is' },
  { value: 'not_equals', label: 'is not' },
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: 'does not contain' },
  { value: 'starts_with', label: 'starts with' },
  { value: 'in', label: 'is one of' },
  { value: 'exists', label: 'is present' },
  { value: 'not_exists', label: 'is missing' },
  { value: 'greater_than', label: 'is greater than' },
  { value: 'less_than', label: 'is less than' },
];

const VALUELESS: ReadonlySet<FieldConditionOperator> = new Set(['exists', 'not_exists']);
const NUMERIC: ReadonlySet<FieldConditionOperator> = new Set(['greater_than', 'less_than']);

const selectClass =
  'h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

let draftKey = 0;

function nextKey(): string {
  draftKey += 1;
  return `condition-${draftKey}`;
}

export function newConditionDraft(source: TriggerSource): TriggerConditionDraft {
  const first = FIELD_SUGGESTIONS[source][0];
  return {
    key: nextKey(),
    field: first ? first.path : OTHER_FIELD,
    customField: '',
    operator: 'contains',
    value: '',
  };
}

function valueText(value: FieldConditionValue | undefined): string {
  if (value === undefined) return '';
  return Array.isArray(value) ? value.join(', ') : String(value);
}

export function conditionDraftsFrom(
  conditions: readonly FieldCondition[],
  source: TriggerSource,
): TriggerConditionDraft[] {
  const known = new Set(FIELD_SUGGESTIONS[source].map((entry) => entry.path));
  return conditions.map((condition) => ({
    key: nextKey(),
    field: known.has(condition.field) ? condition.field : OTHER_FIELD,
    customField: known.has(condition.field) ? '' : condition.field,
    operator: condition.operator,
    value: valueText(condition.value),
  }));
}

export function conditionsFromDrafts(
  drafts: readonly TriggerConditionDraft[],
): { ok: true; conditions: FieldCondition[] } | { ok: false; error: string } {
  const conditions: FieldCondition[] = [];
  for (const draft of drafts) {
    const field = (draft.field === OTHER_FIELD ? draft.customField : draft.field).trim();
    if (!field) return { ok: false, error: 'Choose a field for every condition.' };
    if (VALUELESS.has(draft.operator)) {
      conditions.push({ field, operator: draft.operator });
      continue;
    }
    const text = draft.value.trim();
    if (!text) return { ok: false, error: 'Give every condition a value to compare against.' };
    if (NUMERIC.has(draft.operator)) {
      const number = Number(text);
      if (!Number.isFinite(number)) {
        return { ok: false, error: 'Greater than and less than compare against a number.' };
      }
      conditions.push({ field, operator: draft.operator, value: number });
      continue;
    }
    if (draft.operator === 'in') {
      const list = text
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      conditions.push({ field, operator: 'in', value: list });
      continue;
    }
    conditions.push({ field, operator: draft.operator, value: text });
  }
  return { ok: true, conditions };
}

export function describeConditions(
  conditions: readonly FieldCondition[],
  source: TriggerSource,
): string {
  const labels = new Map(FIELD_SUGGESTIONS[source].map((entry) => [entry.path, entry.label]));
  return conditions
    .map((condition) => {
      const field = labels.get(condition.field) ?? condition.field;
      const operator =
        OPERATORS.find((entry) => entry.value === condition.operator)?.label ?? condition.operator;
      return VALUELESS.has(condition.operator)
        ? `${field} ${operator}`
        : `${field} ${operator} ${valueText(condition.value)}`;
    })
    .join('; ');
}

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
  const suggestions = FIELD_SUGGESTIONS[source];
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
                <option value={OTHER_FIELD}>Other field…</option>
              </select>
              {draft.field === OTHER_FIELD ? (
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
                update(draft.key, { operator: event.target.value as FieldConditionOperator })
              }
            >
              {OPERATORS.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
            {VALUELESS.has(draft.operator) ? (
              <span aria-hidden="true" />
            ) : (
              <Input
                aria-label={`Condition ${index + 1} value`}
                value={draft.value}
                onChange={(event) => update(draft.key, { value: event.target.value })}
                placeholder={
                  draft.operator === 'in'
                    ? 'first, second'
                    : NUMERIC.has(draft.operator)
                      ? '0'
                      : 'Value'
                }
                inputMode={NUMERIC.has(draft.operator) ? 'decimal' : undefined}
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
      {drafts.length < MAX_TRIGGER_CONDITIONS ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...drafts, newConditionDraft(source)])}
        >
          <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
          Add condition
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">
          A trigger holds up to {MAX_TRIGGER_CONDITIONS} conditions.
        </p>
      )}
    </fieldset>
  );
}

export default TriggerConditionsEditor;
