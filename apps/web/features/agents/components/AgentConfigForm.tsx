'use client';

import { useId, useMemo } from 'react';
import Link from 'next/link';
import {
  Button,
  Checkbox,
  Input,
  Label,
  PROJECT_ACCENT_REGISTRY,
  PROJECT_ICON_REGISTRY,
  Spinner,
  Switch,
  Textarea,
  cn,
} from '@agiworkforce/ui';
import {
  AGENT_DAILY_TURN_LIMIT_MAX,
  AGENT_MONTHLY_CREDIT_LIMIT_MAX,
  AGENT_DESCRIPTION_MAX_CHARS,
  AGENT_INSTRUCTIONS_MAX_CHARS,
  AGENT_NAME_MAX_CHARS,
  AGENT_OUTPUT_EXAMPLES_MAX_CHARS,
  AGENT_STARTERS_MAX,
  AGENT_STARTER_MAX_CHARS,
  type AgentConfig,
} from '@agiworkforce/cloud-contracts';
import { CONNECTORS_COMING_SOON_MESSAGE, connectorsReleased } from '@agiworkforce/types';

import type { ScheduleModelOption } from '@/lib/schedules/schedule-models';

export interface AgentChoice {
  id: string;
  name: string;
}

export interface AgentChoiceList {
  loading: boolean;
  error: string | null;
  retry: () => void;
  options: readonly AgentChoice[];
}

const AUTO_MODEL_VALUE = '';
const FIELD_GAP = 'flex flex-col gap-1.5';
const SECTION = 'flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5';
const HEADING = 'text-sm font-medium text-foreground';
const HELP = 'text-xs text-muted-foreground';

function SelectionField({
  legend,
  help,
  allLabel,
  emptyCopy,
  list,
  selected,
  disabled,
  onChange,
}: {
  legend: string;
  help: string;
  allLabel: string;
  emptyCopy: React.ReactNode;
  list: AgentChoiceList;
  selected: string[] | null;
  disabled: boolean;
  onChange: (next: string[] | null) => void;
}) {
  const id = useId();
  const toggle = (choice: string, included: boolean) => {
    const base = selected ?? list.options.map((option) => option.id);
    onChange(
      included
        ? base.includes(choice)
          ? base
          : [...base, choice]
        : base.filter((value) => value !== choice),
    );
  };
  return (
    <fieldset className="flex flex-col gap-3" disabled={disabled}>
      <legend className={HEADING}>{legend}</legend>
      <p className={HELP}>{help}</p>
      <div className="flex items-center gap-3">
        <Checkbox
          id={`${id}-all`}
          checked={selected === null}
          onCheckedChange={(checked) => onChange(checked === true ? null : [])}
        />
        <Label htmlFor={`${id}-all`} className="cursor-pointer">
          {allLabel}
        </Label>
      </div>
      {list.loading ? (
        <div className="flex items-center gap-2">
          <Spinner size="sm" />
          <span className="text-sm text-muted-foreground">Loading…</span>
        </div>
      ) : list.error ? (
        <div className="flex flex-wrap items-center gap-2">
          <p role="alert" className="text-sm text-danger">
            {list.error}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={list.retry}>
            Try again
          </Button>
        </div>
      ) : list.options.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyCopy}</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {list.options.map((option) => {
            const optionId = `${id}-${option.id}`;
            return (
              <li key={option.id} className="flex items-center gap-3">
                <Checkbox
                  id={optionId}
                  checked={selected === null || selected.includes(option.id)}
                  onCheckedChange={(checked) => toggle(option.id, checked === true)}
                />
                <Label htmlFor={optionId} className="cursor-pointer truncate">
                  {option.name}
                </Label>
              </li>
            );
          })}
        </ul>
      )}
    </fieldset>
  );
}

function CapabilitySwitch({
  label,
  help,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  help: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <Label htmlFor={id} className="cursor-pointer">
          {label}
        </Label>
        <p id={`${id}-help`} className={HELP}>
          {help}
        </p>
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        aria-describedby={`${id}-help`}
        onCheckedChange={onChange}
      />
    </div>
  );
}

export function AgentConfigForm({
  draft,
  disabled,
  modelOptions,
  connectors,
  skills,
  onChange,
}: {
  draft: AgentConfig;
  disabled: boolean;
  modelOptions: readonly ScheduleModelOption[];
  connectors: AgentChoiceList;
  skills: AgentChoiceList;
  onChange: (patch: Partial<AgentConfig>) => void;
}) {
  const id = useId();
  const starters = useMemo(
    () =>
      draft.conversationStarters.length < AGENT_STARTERS_MAX
        ? [...draft.conversationStarters, '']
        : draft.conversationStarters,
    [draft.conversationStarters],
  );

  const setStarter = (index: number, value: string) => {
    const next = [...starters];
    next[index] = value.slice(0, AGENT_STARTER_MAX_CHARS);
    onChange({ conversationStarters: next.filter((starter) => starter.trim() !== '') });
  };

  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby={`${id}-identity`} className={SECTION}>
        <h2 id={`${id}-identity`} className={HEADING}>
          Identity
        </h2>
        <div className={FIELD_GAP}>
          <Label htmlFor={`${id}-name`}>Name</Label>
          <Input
            id={`${id}-name`}
            value={draft.name}
            maxLength={AGENT_NAME_MAX_CHARS}
            disabled={disabled}
            required
            onChange={(event) => onChange({ name: event.target.value })}
          />
        </div>
        <div className={FIELD_GAP}>
          <Label htmlFor={`${id}-description`}>Description</Label>
          <Input
            id={`${id}-description`}
            value={draft.description}
            maxLength={AGENT_DESCRIPTION_MAX_CHARS}
            disabled={disabled}
            placeholder="What it does, in one line"
            onChange={(event) => onChange({ description: event.target.value })}
          />
        </div>
        <fieldset className="flex flex-col gap-2" disabled={disabled}>
          <legend className="text-sm font-medium text-foreground">Icon</legend>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Icon">
            {PROJECT_ICON_REGISTRY.map((entry) => {
              const selected = draft.icon === entry.id;
              return (
                <button
                  key={entry.id}
                  type="button"
                  aria-pressed={selected}
                  aria-label={entry.label}
                  title={entry.label}
                  onClick={() => onChange({ icon: entry.id })}
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-lg border text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)] pointer-coarse:h-11 pointer-coarse:w-11',
                    selected ? 'border-foreground text-foreground' : 'border-border hover:bg-muted',
                  )}
                >
                  <entry.Icon className="h-4 w-4" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-2" disabled={disabled}>
          <legend className="text-sm font-medium text-foreground">Colour</legend>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Colour">
            {PROJECT_ACCENT_REGISTRY.map((entry) => {
              const selected = draft.accentColor === entry.id;
              return (
                <button
                  key={entry.id}
                  type="button"
                  aria-pressed={selected}
                  aria-label={entry.label}
                  title={entry.label}
                  onClick={() => onChange({ accentColor: entry.id })}
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)] pointer-coarse:h-11 pointer-coarse:w-11',
                    selected ? 'border-foreground' : 'border-transparent',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="h-5 w-5 rounded-full"
                    style={{ backgroundColor: entry.hex }}
                  />
                </button>
              );
            })}
          </div>
        </fieldset>
      </section>

      <section aria-labelledby={`${id}-behaviour`} className={SECTION}>
        <h2 id={`${id}-behaviour`} className={HEADING}>
          Instructions
        </h2>
        <div className={FIELD_GAP}>
          <Label htmlFor={`${id}-instructions`}>What should this agent do, and how?</Label>
          <Textarea
            id={`${id}-instructions`}
            value={draft.instructions}
            maxLength={AGENT_INSTRUCTIONS_MAX_CHARS}
            rows={8}
            disabled={disabled}
            placeholder="Describe its role, the steps it follows, and what it should avoid."
            onChange={(event) => onChange({ instructions: event.target.value })}
          />
        </div>
        <div className={FIELD_GAP}>
          <Label htmlFor={`${id}-examples`}>Output examples</Label>
          <Textarea
            id={`${id}-examples`}
            value={draft.outputExamples}
            maxLength={AGENT_OUTPUT_EXAMPLES_MAX_CHARS}
            rows={4}
            disabled={disabled}
            aria-describedby={`${id}-examples-help`}
            onChange={(event) => onChange({ outputExamples: event.target.value })}
          />
          <p id={`${id}-examples-help`} className={HELP}>
            A sample answer or two in the shape you want. The agent follows their format.
          </p>
        </div>
        <fieldset className="flex flex-col gap-2" disabled={disabled}>
          <legend className="text-sm font-medium text-foreground">Conversation starters</legend>
          {starters.map((starter, index) => (
            <Input
              key={index}
              aria-label={`Conversation starter ${index + 1}`}
              value={starter}
              maxLength={AGENT_STARTER_MAX_CHARS}
              placeholder={
                index === draft.conversationStarters.length ? 'Add a starter' : undefined
              }
              onChange={(event) => setStarter(index, event.target.value)}
            />
          ))}
        </fieldset>
      </section>

      <section aria-labelledby={`${id}-model`} className={SECTION}>
        <h2 id={`${id}-model`} className={HEADING}>
          Model and tools
        </h2>
        <div className={FIELD_GAP}>
          <Label htmlFor={`${id}-model-select`}>Preferred model</Label>
          <select
            id={`${id}-model-select`}
            value={draft.model ?? AUTO_MODEL_VALUE}
            disabled={disabled}
            aria-describedby={`${id}-model-help`}
            onChange={(event) => onChange({ model: event.target.value || null })}
            className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground pointer-coarse:min-h-11"
          >
            <option value={AUTO_MODEL_VALUE}>Whatever the chat uses</option>
            {modelOptions.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </select>
          <p id={`${id}-model-help`} className={HELP}>
            Used when a chat with this agent is on Auto. A model picked in the chat still wins.
          </p>
        </div>
        <CapabilitySwitch
          label="Web search"
          help="Search and read web pages."
          checked={draft.webSearch}
          disabled={disabled}
          onChange={(webSearch) => onChange({ webSearch })}
        />
        <CapabilitySwitch
          label="Code execution"
          help="Run code and analyse files in a sandbox."
          checked={draft.codeExecution}
          disabled={disabled}
          onChange={(codeExecution) => onChange({ codeExecution })}
        />
        <CapabilitySwitch
          label="Image generation"
          help="Create and edit images."
          checked={draft.imageGeneration}
          disabled={disabled}
          onChange={(imageGeneration) => onChange({ imageGeneration })}
        />
        <div className={FIELD_GAP}>
          <Label htmlFor={`${id}-budget`}>Messages a day, per person</Label>
          <Input
            id={`${id}-budget`}
            type="number"
            inputMode="numeric"
            min={1}
            max={AGENT_DAILY_TURN_LIMIT_MAX}
            step={1}
            value={draft.dailyTurnLimit ?? ''}
            disabled={disabled}
            placeholder="No limit"
            aria-describedby={`${id}-budget-help`}
            onChange={(event) => {
              const value = Number.parseInt(event.target.value, 10);
              onChange({
                dailyTurnLimit:
                  Number.isFinite(value) && value > 0
                    ? Math.min(value, AGENT_DAILY_TURN_LIMIT_MAX)
                    : null,
              });
            }}
          />
          <p id={`${id}-budget-help`} className={HELP}>
            Each person can send this agent up to this many messages a day. Chats stop at the limit
            until midnight UTC.
          </p>
        </div>
        <div className={FIELD_GAP}>
          <Label htmlFor={`${id}-credits`}>Credits a month, across everyone</Label>
          <Input
            id={`${id}-credits`}
            type="number"
            inputMode="numeric"
            min={1}
            max={AGENT_MONTHLY_CREDIT_LIMIT_MAX}
            step={1}
            value={draft.monthlyCreditLimit ?? ''}
            disabled={disabled}
            placeholder="No limit"
            aria-describedby={`${id}-credits-help`}
            onChange={(event) => {
              const value = Number.parseInt(event.target.value, 10);
              onChange({
                monthlyCreditLimit:
                  Number.isFinite(value) && value > 0
                    ? Math.min(value, AGENT_MONTHLY_CREDIT_LIMIT_MAX)
                    : null,
              });
            }}
          />
          <p id={`${id}-credits-help`} className={HELP}>
            Chats and routines that run as this agent stop once it has used this many credits in the
            calendar month (UTC), whoever is using it.
          </p>
        </div>
      </section>

      <section aria-labelledby={`${id}-access`} className={SECTION}>
        <h2 id={`${id}-access`} className={HEADING}>
          Connectors and skills
        </h2>
        {connectorsReleased() ? (
          <SelectionField
            legend="Connectors"
            help="The agent uses only the connectors checked here, and only ones the person chatting has connected."
            allLabel="Every connector the person has connected"
            emptyCopy={
              <>
                No connectors are connected.{' '}
                <Link
                  href="/connectors"
                  className="font-medium text-foreground underline underline-offset-2"
                >
                  Connect one
                </Link>
                .
              </>
            }
            list={connectors}
            selected={draft.connectorIds}
            disabled={disabled}
            onChange={(connectorIds) => onChange({ connectorIds })}
          />
        ) : (
          <div className="flex flex-col gap-1">
            <p className={HEADING}>Connectors</p>
            <p className="text-sm text-muted-foreground">{CONNECTORS_COMING_SOON_MESSAGE}</p>
          </div>
        )}
        <SelectionField
          legend="Skills"
          help="The agent can load only the skills checked here."
          allLabel="Every skill turned on for the person chatting"
          emptyCopy="No skills are turned on."
          list={skills}
          selected={draft.skillNames}
          disabled={disabled}
          onChange={(skillNames) => onChange({ skillNames })}
        />
      </section>
    </div>
  );
}
