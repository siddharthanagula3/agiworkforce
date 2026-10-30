'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { AGENT_SELECTION_MAX } from '@agiworkforce/cloud-contracts';
import {
  Button,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  Spinner,
  cn,
  useCombobox,
} from '@agiworkforce/ui';

import type { AgentChoiceList } from './AgentConfigForm';

const MODE_RADIO_CLASS =
  "relative mt-0.5 grid h-11 min-h-11 w-11 min-w-11 shrink-0 place-items-center rounded-md border-0 text-foreground before:pointer-events-none before:absolute before:inset-0 before:m-auto before:h-4 before:w-4 before:rounded-full before:border before:border-[var(--chat-text-muted)] before:content-['']";

function readableName(name: string): string {
  return name
    .replace(/[-_]+/g, ' ')
    .replace(
      /(^|\s)(\p{L})/gu,
      (_match, space: string, letter: string) => space + letter.toLocaleUpperCase(),
    );
}

export function AgentSkillSelection({
  list,
  selected,
  disabled,
  onChange,
}: {
  list: AgentChoiceList;
  selected: string[] | null;
  disabled: boolean;
  onChange: (next: string[] | null) => void;
}) {
  const id = useId();
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const inherited = selected === null;
  const selectedIds = useMemo(() => new Set(selected ?? []), [selected]);
  const choices = useMemo(() => {
    const available = new Map(list.options.map((option) => [option.id, option]));
    const savedOnly = [...selectedIds]
      .filter((name) => !available.has(name))
      .map((name) => ({
        id: name,
        name,
        description: 'Not currently available to you. This saved selection is retained.',
      }));
    return [...available.values(), ...savedOnly].map((choice, index) => ({
      ...choice,
      name: choice.name === choice.id ? readableName(choice.name) : choice.name,
      unavailable: !available.has(choice.id),
      optionId: `${id}-skill-${index}`,
    }));
  }, [id, list.options, selectedIds]);
  const filtered = useMemo(() => {
    const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return choices.filter((choice) => {
      const text = `${choice.name}\n${choice.description ?? ''}\n${choice.id}`.toLocaleLowerCase();
      return terms.every((term) => text.includes(term));
    });
  }, [choices, query]);
  const toggle = (name: string) => {
    const next = new Set(selectedIds);
    if (next.has(name)) next.delete(name);
    else if (next.size < AGENT_SELECTION_MAX) next.add(name);
    else return;
    onChange([...next]);
  };
  const ready = !inherited && !list.loading && !list.error;
  const combo = useCombobox({
    items: ready ? filtered : [],
    listboxId: `${id}-options`,
    expanded: ready,
    getOptionId: (choice) => choice.optionId,
    onSelect: (choice) => toggle(choice.id),
    onEscape: () => {
      setQuery('');
      combo.setActiveIndex(0);
    },
  });
  const activeId = combo.activeItem?.optionId;
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [activeId]);

  const selectResults = new Set([
    ...selectedIds,
    ...filtered.filter((choice) => !choice.unavailable).map((choice) => choice.id),
  ]);
  const selectedInResults = filtered.some((choice) => selectedIds.has(choice.id));
  const clearResults = () => {
    const visible = new Set(filtered.map((choice) => choice.id));
    onChange([...selectedIds].filter((name) => !visible.has(name)));
  };

  return (
    <fieldset className="flex min-w-0 flex-col gap-3" disabled={disabled}>
      <legend className="text-sm font-medium text-foreground">Skills</legend>
      <p className="text-sm text-muted-foreground">
        Skills are available only when the person chatting has them enabled.
      </p>
      <RadioGroup
        aria-label="Skill selection"
        value={inherited ? 'inherit' : 'individual'}
        disabled={disabled}
        onValueChange={(value) => onChange(value === 'inherit' ? null : [])}
      >
        <div className="flex items-start gap-3 rounded-lg border border-border p-3">
          <RadioGroupItem
            id={`${id}-inherit`}
            data-agent-skill-mode-radio=""
            value="inherit"
            aria-label="Use each person's enabled skills"
            aria-describedby={`${id}-inherit-help`}
            className={MODE_RADIO_CLASS}
          />
          <Label
            htmlFor={`${id}-inherit`}
            className="min-w-0 flex-1 cursor-pointer pointer-coarse:min-h-11"
          >
            <span className="block text-sm font-medium">Use each person's enabled skills</span>
            <span id={`${id}-inherit-help`} className="block text-sm text-muted-foreground">
              Inherit their skills automatically, including ones they enable later.
            </span>
          </Label>
        </div>
        <div className="flex items-start gap-3 rounded-lg border border-border p-3">
          <RadioGroupItem
            id={`${id}-individual`}
            data-agent-skill-mode-radio=""
            value="individual"
            aria-label="Choose individual skills"
            aria-describedby={`${id}-individual-help`}
            className={MODE_RADIO_CLASS}
          />
          <Label
            htmlFor={`${id}-individual`}
            className="min-w-0 flex-1 cursor-pointer pointer-coarse:min-h-11"
          >
            <span className="block text-sm font-medium">Choose individual skills</span>
            <span id={`${id}-individual-help`} className="block text-sm text-muted-foreground">
              Keep a fixed selection for this agent.
            </span>
          </Label>
        </div>
      </RadioGroup>
      <p
        id={`${id}-summary`}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="text-sm text-muted-foreground"
      >
        {inherited ? (
          <>
            Inherited
            {!list.loading && !list.error ? ` · ${list.options.length} available to you` : ''}
          </>
        ) : (
          `${selectedIds.size} selected`
        )}
      </p>
      {list.loading ? (
        <div className="flex items-center gap-2">
          <Spinner size="sm" />
          <span className="text-sm text-muted-foreground">Loading skills…</span>
        </div>
      ) : list.error ? (
        <div className="flex flex-wrap items-center gap-2">
          <p role="alert" className="text-sm text-danger-text">
            {list.error}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={list.retry}>
            Try again
          </Button>
        </div>
      ) : !inherited ? (
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor={`${id}-search`}>Search skills</Label>
          <Input
            {...combo.inputProps}
            ref={searchRef}
            id={`${id}-search`}
            type="search"
            value={query}
            placeholder="Search names or descriptions"
            autoComplete="off"
            aria-describedby={`${id}-summary ${id}-keys`}
            onChange={(event) => {
              setQuery(event.target.value);
              combo.setActiveIndex(0);
            }}
          />
          <p id={`${id}-keys`} className="text-xs text-muted-foreground">
            Use arrow keys and Enter to select. Tab moves past the list.
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {filtered.length} {filtered.length === 1 ? 'result' : 'results'}
            </span>
            <div className="flex flex-wrap gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={
                  selectResults.size > AGENT_SELECTION_MAX ||
                  selectResults.size === selectedIds.size
                }
                onClick={() => onChange([...selectResults])}
              >
                {query.trim() ? 'Select results' : 'Select all'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!selectedInResults}
                onClick={clearResults}
              >
                {query.trim() ? 'Clear results' : 'Clear selection'}
              </Button>
            </div>
          </div>
          {selectedIds.size >= AGENT_SELECTION_MAX ? (
            <p className="text-xs text-muted-foreground">
              You can select up to {AGENT_SELECTION_MAX} skills.
            </p>
          ) : null}
          <ul
            tabIndex={-1}
            ref={listRef}
            id={`${id}-options`}
            role="listbox"
            aria-label="Skills"
            aria-multiselectable="true"
            className="max-h-72 overflow-y-auto overscroll-contain rounded-lg border border-border p-1"
          >
            {filtered.map((choice) => {
              const included = selectedIds.has(choice.id);
              const unavailable = !included && selectedIds.size >= AGENT_SELECTION_MAX;
              return (
                <li role="none" key={choice.id}>
                  <button
                    {...combo.getOptionProps(choice)}
                    role="option"
                    type="button"
                    tabIndex={-1}
                    aria-label={choice.name}
                    aria-selected={included}
                    aria-disabled={unavailable}
                    aria-describedby={
                      choice.description ? `${choice.optionId}-description` : undefined
                    }
                    data-active={choice.optionId === activeId}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      searchRef.current?.focus();
                      toggle(choice.id);
                    }}
                    className={cn(
                      'flex w-full min-w-0 items-start gap-3 rounded-md px-3 py-2 text-start text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring',
                      choice.optionId === activeId && 'bg-muted',
                      unavailable && 'text-muted-foreground',
                    )}
                  >
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                      {included ? <Check className="h-4 w-4" aria-hidden="true" /> : null}
                    </span>
                    <span className="min-w-0 flex-1 wrap-anywhere">
                      <span className="block text-sm font-medium">{choice.name}</span>
                      {choice.description ? (
                        <span
                          id={`${choice.optionId}-description`}
                          className="mt-0.5 block text-sm text-muted-foreground"
                        >
                          {choice.description}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {choices.length === 0
                ? 'No skills are available to select.'
                : 'No skills match your search.'}
            </p>
          ) : null}
          {selectedIds.size === 0 ? (
            <p className="text-sm text-muted-foreground">
              No skills selected. This agent will not load any skills.
            </p>
          ) : null}
        </div>
      ) : null}
    </fieldset>
  );
}
