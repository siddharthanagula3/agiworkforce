'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { Button, Checkbox, Input, Spinner } from '@agiworkforce/ui';
import { ExternalLink, TriangleAlert } from '@agiworkforce/icons';
import { cn } from '@shared/lib/utils';

import {
  acceptConnectorInput,
  connectorInputFieldError,
  dismissConnectorInput,
  initialConnectorInputDraft,
  readConnectorInputPrompts,
  type ConnectorInputDraft,
  type ConnectorInputDraftValue,
  type ConnectorInputField,
  type ConnectorInputPrompt,
  type ConnectorInputResponse,
} from '../lib/connector-input-request';

const SUBMIT_LABEL = 'Submit';
const CONTINUE_LABEL = 'Continue';
const SENDING_LABEL = 'Sending';
const DECLINE_LABEL = 'Decline';
const CANCEL_LABEL = 'Cancel';
const OPTIONAL_LABEL = '(optional)';
const OPEN_LINK_PREFIX = 'Open';
const CHOOSE_PLACEHOLDER = 'Choose one';
const NOT_SET_OPTION = 'Not set';
const LINK_OPENED_COPY = 'Finish in the new tab, then continue here.';
const OPEN_LINK_FIRST_COPY = 'Open the link to continue.';
const PUNYCODE_WARNING =
  'This address uses characters that can imitate another site. Check the domain before you open it.';
const UNOPENABLE_LINK_COPY = 'This link can’t be opened from here.';
const UNSUPPORTED_COPY = 'This request can’t be answered here.';
const EXPIRED_COPY = 'This request is no longer active.';
const SENT_COPY = 'Sent. The reply continues once every request in it is answered.';
const FOR_TOOL_PREFIX = 'For';
const HEADING_SUFFIX = 'needs your input';

const DATE_INPUT_TYPES = { date: 'date', 'date-time': 'datetime-local' } as const;
const TEXT_INPUT_TYPES = { email: 'email', uri: 'url' } as const;

type FormState = 'idle' | 'sending' | 'sent';

export interface ConnectorInputRequestFormProps {
  serverLabel: string;
  toolLabel: string;
  inputRequests: Record<string, unknown>;
  expired?: boolean;
  onRespond?: (responses: Record<string, ConnectorInputResponse>) => Promise<boolean>;
}

function textInputType(field: Extract<ConnectorInputField, { kind: 'text' }>): string {
  if (field.format === 'date' || field.format === 'date-time') {
    return DATE_INPUT_TYPES[field.format];
  }
  if (field.format === 'email' || field.format === 'uri') return TEXT_INPUT_TYPES[field.format];
  return 'text';
}

function FieldLabel({ field, htmlFor }: { field: ConnectorInputField; htmlFor?: string }) {
  const content = (
    <>
      {field.title}
      {field.required ? null : (
        <span className="font-normal text-muted-foreground"> {OPTIONAL_LABEL}</span>
      )}
    </>
  );
  return htmlFor ? (
    <label htmlFor={htmlFor} className="block text-xs font-semibold text-foreground">
      {content}
    </label>
  ) : (
    <legend className="text-xs font-semibold text-foreground">{content}</legend>
  );
}

function ConnectorInputFieldControl({
  field,
  value,
  error,
  disabled,
  onChange,
}: {
  field: ConnectorInputField;
  value: ConnectorInputDraftValue | undefined;
  error: string | null;
  disabled: boolean;
  onChange: (value: ConnectorInputDraftValue) => void;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [field.description ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') ||
    undefined;
  const hint = field.description ? (
    <p id={hintId} className="whitespace-pre-wrap break-words text-xs text-muted-foreground">
      {field.description}
    </p>
  ) : null;
  const errorLine = error ? (
    <p id={errorId} className="text-xs text-[var(--chat-destructive-text)]">
      {error}
    </p>
  ) : null;

  if (field.kind === 'boolean') {
    return (
      <div className="space-y-1">
        <div className="flex items-start gap-2 pointer-coarse:min-h-11 pointer-coarse:items-center">
          <Checkbox
            id={id}
            checked={value === true}
            disabled={disabled}
            aria-describedby={describedBy}
            onCheckedChange={(checked) => onChange(checked === true)}
            className="mt-0.5 pointer-coarse:mt-0 pointer-coarse:h-5 pointer-coarse:w-5"
          />
          <FieldLabel field={field} htmlFor={id} />
        </div>
        {hint}
        {errorLine}
      </div>
    );
  }

  if (field.kind === 'choices') {
    const selected = Array.isArray(value) ? value : [];
    return (
      <fieldset className="space-y-1.5" aria-describedby={describedBy}>
        <FieldLabel field={field} />
        {hint}
        <div className="flex flex-col gap-1.5">
          {field.options.map((option, index) => {
            const optionId = `${id}-${index}`;
            const checked = selected.includes(option.value);
            return (
              <div key={option.value} className="flex items-center gap-2 pointer-coarse:min-h-11">
                <Checkbox
                  id={optionId}
                  checked={checked}
                  disabled={disabled}
                  aria-invalid={error ? true : undefined}
                  onCheckedChange={(next) =>
                    onChange(
                      next === true
                        ? [...selected, option.value]
                        : selected.filter((entry) => entry !== option.value),
                    )
                  }
                  className="pointer-coarse:h-5 pointer-coarse:w-5"
                />
                <label htmlFor={optionId} className="flex-1 text-sm text-foreground">
                  {option.label}
                </label>
              </div>
            );
          })}
        </div>
        {errorLine}
      </fieldset>
    );
  }

  if (field.kind === 'choice') {
    const current = typeof value === 'string' ? value : '';
    return (
      <div className="space-y-1">
        <FieldLabel field={field} htmlFor={id} />
        {hint}
        <select
          id={id}
          value={current}
          disabled={disabled}
          required={field.required}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            'h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:h-11',
            error && 'border-destructive',
          )}
        >
          {field.required ? (
            <option value="" disabled>
              {CHOOSE_PLACEHOLDER}
            </option>
          ) : (
            <option value="">{NOT_SET_OPTION}</option>
          )}
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {errorLine}
      </div>
    );
  }

  const isNumber = field.kind === 'number';
  return (
    <div className="space-y-1">
      <FieldLabel field={field} htmlFor={id} />
      {hint}
      <Input
        id={id}
        type={isNumber ? 'number' : textInputType(field)}
        value={typeof value === 'string' ? value : ''}
        disabled={disabled}
        required={field.required}
        hasError={Boolean(error)}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value)}
        {...(isNumber
          ? {
              inputMode: field.integer ? ('numeric' as const) : ('decimal' as const),
              step: field.integer ? 1 : 'any',
              ...(field.minimum !== undefined ? { min: field.minimum } : {}),
              ...(field.maximum !== undefined ? { max: field.maximum } : {}),
            }
          : {
              ...(field.minLength !== undefined ? { minLength: field.minLength } : {}),
              ...(field.maxLength !== undefined ? { maxLength: field.maxLength } : {}),
            })}
        className="pointer-coarse:h-11"
      />
      {errorLine}
    </div>
  );
}

function ConnectorInputLinkPrompt({
  prompt,
  opened,
  disabled,
  onOpen,
}: {
  prompt: Extract<ConnectorInputPrompt, { mode: 'url' }>;
  opened: boolean;
  disabled: boolean;
  onOpen: () => void;
}) {
  const { link } = prompt;
  return (
    <div className="space-y-2">
      {prompt.message ? (
        <p className="whitespace-pre-wrap break-words text-sm text-foreground">{prompt.message}</p>
      ) : null}
      <p className="break-all rounded-md border border-[var(--chat-border)] bg-[var(--chat-surface-base)] px-2 py-1.5 font-mono text-xs text-muted-foreground">
        {link ? (
          <>
            {link.prefix}
            <span className="font-semibold text-foreground">{link.host}</span>
            {link.rest}
          </>
        ) : (
          prompt.url
        )}
      </p>
      {link?.punycode ? (
        <p className="flex items-start gap-1.5 text-xs text-warning-text">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {PUNYCODE_WARNING}
        </p>
      ) : null}
      {link?.openable ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={onOpen}
            className="pointer-coarse:h-11"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            {`${OPEN_LINK_PREFIX} ${link.host}`}
          </Button>
          <span role="status" className="text-xs text-muted-foreground">
            {opened ? LINK_OPENED_COPY : null}
          </span>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{UNOPENABLE_LINK_COPY}</p>
      )}
    </div>
  );
}

export function ConnectorInputRequestForm({
  serverLabel,
  toolLabel,
  inputRequests,
  expired = false,
  onRespond,
}: ConnectorInputRequestFormProps) {
  const headingId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const prompts = useMemo(() => readConnectorInputPrompts(inputRequests), [inputRequests]);
  const [drafts, setDrafts] = useState<Record<string, ConnectorInputDraft>>(() =>
    Object.fromEntries(
      prompts.flatMap((prompt): [string, ConnectorInputDraft][] =>
        prompt.mode === 'form' ? [[prompt.key, initialConnectorInputDraft(prompt.fields)]] : [],
      ),
    ),
  );
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set());
  const [attempts, setAttempts] = useState(0);
  const [state, setState] = useState<FormState>('idle');

  const interactive = !expired && typeof onRespond === 'function' && state === 'idle';
  const acceptable =
    prompts.some((prompt) => prompt.mode !== 'unsupported') &&
    prompts.every(
      (prompt) => prompt.mode === 'form' || (prompt.mode === 'url' && prompt.link?.openable),
    );
  const asksForFields = prompts.some((prompt) => prompt.mode === 'form');
  const linksOpened = prompts.every((prompt) => prompt.mode !== 'url' || opened.has(prompt.key));

  const errors = useMemo(() => {
    const found: Record<string, Record<string, string>> = {};
    for (const prompt of prompts) {
      if (prompt.mode !== 'form') continue;
      for (const field of prompt.fields) {
        const error = connectorInputFieldError(field, drafts[prompt.key]?.[field.key]);
        if (error) found[prompt.key] = { ...found[prompt.key], [field.key]: error };
      }
    }
    return found;
  }, [drafts, prompts]);
  const hasErrors = Object.keys(errors).length > 0;

  useEffect(() => {
    if (attempts === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [attempts]);

  const respond = useCallback(
    async (responses: Record<string, ConnectorInputResponse>) => {
      if (!onRespond) return;
      setState('sending');
      const recorded = await onRespond(responses).catch(() => false);
      setState(recorded ? 'sent' : 'idle');
    },
    [onRespond],
  );

  const updateField = useCallback(
    (promptKey: string, fieldKey: string, value: ConnectorInputDraftValue) => {
      setDrafts((current) => ({
        ...current,
        [promptKey]: { ...current[promptKey], [fieldKey]: value },
      }));
    },
    [],
  );

  const openLink = useCallback(
    (prompt: Extract<ConnectorInputPrompt, { mode: 'url' }>) => {
      if (!interactive || !prompt.link?.openable) return;
      window.open(prompt.link.href, '_blank', 'noopener,noreferrer');
      setOpened((current) => new Set(current).add(prompt.key));
    },
    [interactive],
  );

  const submit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!interactive || !acceptable || !linksOpened) return;
      if (hasErrors) {
        setAttempts((count) => count + 1);
        return;
      }
      void respond(acceptConnectorInput(prompts, drafts));
    },
    [acceptable, drafts, hasErrors, interactive, linksOpened, prompts, respond],
  );

  const dismiss = useCallback(
    (action: 'decline' | 'cancel') => {
      if (!interactive) return;
      void respond(dismissConnectorInput(prompts, action));
    },
    [interactive, prompts, respond],
  );

  const showErrors = attempts > 0;
  const sending = state === 'sending';

  return (
    <section
      aria-labelledby={headingId}
      data-testid="connector-input-request"
      className="rounded-xl border border-[var(--chat-border-strong)] bg-[var(--chat-surface-hover)] px-4 py-3"
    >
      <p id={headingId} className="text-sm font-semibold text-foreground">
        {`${serverLabel} ${HEADING_SUFFIX}`}
      </p>
      <p className="text-xs text-muted-foreground">{`${FOR_TOOL_PREFIX} ${toolLabel}`}</p>

      {expired ? (
        <p className="mt-2 text-xs text-muted-foreground">{EXPIRED_COPY}</p>
      ) : (
        <form ref={formRef} noValidate onSubmit={submit} className="mt-3 space-y-4">
          {prompts.map((prompt) => {
            if (prompt.mode === 'unsupported') {
              return (
                <p key={prompt.key} className="text-xs text-muted-foreground">
                  {UNSUPPORTED_COPY}
                </p>
              );
            }
            if (prompt.mode === 'url') {
              return (
                <ConnectorInputLinkPrompt
                  key={prompt.key}
                  prompt={prompt}
                  opened={opened.has(prompt.key)}
                  disabled={!interactive}
                  onOpen={() => openLink(prompt)}
                />
              );
            }
            return (
              <div key={prompt.key} className="space-y-3">
                {prompt.message ? (
                  <p className="whitespace-pre-wrap break-words text-sm text-foreground">
                    {prompt.message}
                  </p>
                ) : null}
                {prompt.fields.map((field) => (
                  <ConnectorInputFieldControl
                    key={field.key}
                    field={field}
                    value={drafts[prompt.key]?.[field.key]}
                    error={showErrors ? (errors[prompt.key]?.[field.key] ?? null) : null}
                    disabled={!interactive}
                    onChange={(value) => updateField(prompt.key, field.key, value)}
                  />
                ))}
              </div>
            );
          })}

          {state === 'sent' ? (
            <p role="status" className="text-xs text-muted-foreground">
              {SENT_COPY}
            </p>
          ) : onRespond ? (
            <div className="space-y-2">
              {acceptable && !linksOpened ? (
                <p className="text-xs text-muted-foreground">{OPEN_LINK_FIRST_COPY}</p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                {acceptable ? (
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!interactive || !linksOpened}
                    className="pointer-coarse:h-11"
                  >
                    {sending ? <Spinner size="sm" /> : null}
                    {sending ? SENDING_LABEL : asksForFields ? SUBMIT_LABEL : CONTINUE_LABEL}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!interactive}
                  onClick={() => dismiss('decline')}
                  className="pointer-coarse:h-11"
                >
                  {DECLINE_LABEL}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={!interactive}
                  onClick={() => dismiss('cancel')}
                  className="pointer-coarse:h-11"
                >
                  {CANCEL_LABEL}
                </Button>
              </div>
            </div>
          ) : null}
        </form>
      )}
    </section>
  );
}
