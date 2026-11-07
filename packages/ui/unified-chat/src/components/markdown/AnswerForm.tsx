import { useId, useRef, useState } from 'react';
import { Button, Checkbox, Input, Label, Textarea, useUiTranslation } from '@agiworkforce/ui';
import { useFollowUpAction } from './FollowUpAction';
import type { FormField, FormSpec } from './answerSurfaces';

type FormValue = string | string[];

const INPUT_CLASS =
  'h-auto min-h-11 w-full rounded-md border border-[var(--chat-border)] bg-[var(--chat-bg)] px-3 py-2 text-base leading-6 text-[var(--chat-text-primary)] shadow-none aria-invalid:border-[var(--chat-destructive-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)] focus-visible:ring-offset-0';

function initialValue(field: FormField): FormValue {
  if (field.kind === 'checks')
    return field.options.filter((option) => option.selected).map((option) => option.label);
  if (field.kind === 'select' || field.kind === 'radio')
    return field.options.find((option) => option.selected)?.label ?? '';
  return 'value' in field ? String(field.value) : '';
}

function fieldError(field: FormField, value: FormValue): boolean {
  if (field.required && (Array.isArray(value) ? value.length === 0 : value.trim() === ''))
    return true;
  if (field.kind === 'checks')
    return (
      !Array.isArray(value) ||
      value.some((choice) => !field.options.some((option) => option.label === choice))
    );
  if (Array.isArray(value)) return true;
  if (field.kind === 'select' || field.kind === 'radio')
    return value !== '' && !field.options.some((option) => option.label === value);
  if (field.kind === 'slider')
    return (
      !Number.isFinite(Number(value)) || Number(value) < field.min || Number(value) > field.max
    );
  if (field.kind === 'date' && value !== '') {
    const date = new Date(`${value}T00:00:00Z`);
    return (
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    );
  }
  return false;
}

export function AnswerForm({
  spec,
  className,
  streaming = false,
}: {
  spec: FormSpec;
  className: string;
  streaming?: boolean;
}) {
  const { t } = useUiTranslation('chat');
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const onFollowUp = useFollowUpAction();
  const [values, setValues] = useState<FormValue[]>(() => spec.fields.map(initialValue));
  const [invalid, setInvalid] = useState<number[]>([]);
  const [applied, setApplied] = useState<FormValue[] | null>(null);
  const change = (index: number, value: FormValue) => {
    setValues((current) => current.map((entry, position) => (position === index ? value : entry)));
    setInvalid((current) => current.filter((position) => position !== index));
  };
  return (
    <form
      ref={formRef}
      className={className}
      data-answer-surface="form"
      aria-label={spec.title}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (streaming) return;
        const errors = spec.fields.flatMap((field, index) =>
          fieldError(field, values[index] ?? '') ? [index] : [],
        );
        setInvalid(errors);
        if (errors.length > 0) {
          formRef.current
            ?.querySelector<HTMLElement>(`[data-form-field="${errors[0]}"]`)
            ?.querySelector<HTMLElement>(
              '[role="radio"], [role="checkbox"], input:not([type="hidden"]):not([aria-hidden="true"]), select, textarea',
            )
            ?.focus();
          return;
        }
        if (spec.send && !onFollowUp) return;
        const result = spec.fields.map((field, index) => {
          const value = values[index] ?? '';
          const rendered = Array.isArray(value) ? value.join(', ') : value;
          return `${field.label}: ${rendered}${field.kind === 'slider' && field.unit ? ` ${field.unit}` : ''}`;
        });
        if (spec.send) onFollowUp?.([spec.title, ...result].join('\n'));
        setApplied(values.map((value) => (Array.isArray(value) ? [...value] : value)));
      }}
    >
      <h3 className="mb-4 wrap-anywhere text-base font-semibold leading-relaxed text-[var(--chat-text-primary)]">
        {spec.title}
      </h3>
      <fieldset disabled={streaming} className="flex min-w-0 flex-col gap-5">
        {spec.fields.map((field, index) => {
          const fieldId = `${id}-${index}`;
          const errorId = `${fieldId}-error`;
          const error = invalid.includes(index);
          const value = values[index] ?? '';
          const label = (
            <>
              {field.label}
              {field.required ? <span aria-hidden="true"> *</span> : null}
            </>
          );
          const a11y = {
            'aria-invalid': error || undefined,
            'aria-describedby': error ? errorId : undefined,
            'aria-required': field.required || undefined,
          };
          const choices = field.kind === 'radio' || field.kind === 'checks';
          return (
            <div
              key={field.label}
              data-form-field={index}
              className="min-w-0 wrap-anywhere text-sm leading-6"
            >
              {choices ? (
                <fieldset {...a11y}>
                  <legend id={`${fieldId}-label`} className="mb-1 font-medium">
                    {label}
                  </legend>
                  {field.kind === 'radio' ? (
                    <div
                      role="radiogroup"
                      aria-labelledby={`${fieldId}-label`}
                      {...a11y}
                      className="grid gap-1"
                    >
                      {field.options.map((option, optionIndex) => (
                        <Label
                          key={option.label}
                          htmlFor={`${fieldId}-${optionIndex}`}
                          className="flex min-h-11 cursor-pointer items-center gap-3 break-words font-normal leading-6"
                        >
                          <input
                            id={`${fieldId}-${optionIndex}`}
                            type="radio"
                            name={`${id}-${index}`}
                            value={option.label}
                            checked={value === option.label}
                            disabled={streaming}
                            onChange={() => change(index, option.label)}
                            {...a11y}
                            className="h-4 min-h-0 w-4 min-w-0 shrink-0 accent-[var(--chat-accent-primary)] focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]"
                          />
                          <span className="min-w-0 flex-1 wrap-anywhere">{option.label}</span>
                        </Label>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {field.options.map((option, optionIndex) => (
                        <Label
                          key={option.label}
                          htmlFor={`${fieldId}-${optionIndex}`}
                          className="flex min-h-11 cursor-pointer items-center gap-3 break-words font-normal leading-6"
                        >
                          <Checkbox
                            id={`${fieldId}-${optionIndex}`}
                            name={`${id}-${index}`}
                            value={option.label}
                            checked={Array.isArray(value) && value.includes(option.label)}
                            disabled={streaming}
                            {...(optionIndex === 0 ? a11y : {})}
                            onCheckedChange={(checked) => {
                              const current = Array.isArray(value) ? value : [];
                              change(
                                index,
                                checked === true
                                  ? [...current, option.label]
                                  : current.filter((choice) => choice !== option.label),
                              );
                            }}
                            className="min-h-0 min-w-0 aria-invalid:border-[var(--chat-destructive-text)]"
                          />
                          <span className="min-w-0 flex-1 wrap-anywhere">{option.label}</span>
                        </Label>
                      ))}
                    </div>
                  )}
                </fieldset>
              ) : (
                <>
                  <Label htmlFor={fieldId} className="mb-2 block font-medium leading-6">
                    {label}
                  </Label>
                  {field.kind === 'select' ? (
                    <select
                      id={fieldId}
                      {...a11y}
                      required={field.required}
                      value={typeof value === 'string' ? value : ''}
                      onChange={(event) => change(index, event.target.value)}
                      className={INPUT_CLASS}
                    >
                      <option value="">
                        {t('answerSurface.chooseOption', 'Choose an option')}
                      </option>
                      {field.options.map((option) => (
                        <option key={option.label} value={option.label}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : field.kind === 'textarea' ? (
                    <Textarea
                      id={fieldId}
                      {...a11y}
                      required={field.required}
                      value={typeof value === 'string' ? value : ''}
                      onChange={(event) => change(index, event.target.value)}
                      rows={3}
                      className={INPUT_CLASS}
                    />
                  ) : field.kind === 'slider' ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <input
                        id={fieldId}
                        {...a11y}
                        type="range"
                        min={field.min}
                        max={field.max}
                        value={typeof value === 'string' ? value : ''}
                        onChange={(event) => change(index, event.target.value)}
                        className="min-h-11 min-w-0 flex-1 accent-[var(--chat-accent-primary)] focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]"
                      />
                      <output htmlFor={fieldId} className="min-w-0 break-words tabular-nums">
                        {value} {field.unit}
                      </output>
                    </div>
                  ) : (
                    <Input
                      id={fieldId}
                      {...a11y}
                      required={field.required}
                      type={field.kind}
                      value={typeof value === 'string' ? value : ''}
                      onChange={(event) => change(index, event.target.value)}
                      className={INPUT_CLASS}
                    />
                  )}
                </>
              )}
              {error ? (
                <p
                  id={errorId}
                  role="alert"
                  className="mt-2 text-sm leading-6 text-[var(--chat-destructive-text)]"
                >
                  {t('answerSurface.invalidField', 'Enter a valid value for {{label}}.', {
                    label: field.label,
                  })}
                </p>
              ) : null}
            </div>
          );
        })}
      </fieldset>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          size="sm"
          className="min-h-11 max-w-full whitespace-normal"
          disabled={streaming || (spec.send && !onFollowUp)}
        >
          {spec.send
            ? t('answerSurface.sendFormLabel', '{{label}} (send to chat)', { label: spec.submit })
            : spec.submit}
        </Button>
        {spec.send ? (
          <p className="text-sm leading-6 text-[var(--chat-text-secondary)]">
            {t(
              'answerSurface.formSendsValues',
              'Selected values will be sent as your next message.',
            )}
          </p>
        ) : null}
        {spec.send && !onFollowUp ? (
          <p className="text-sm leading-6 text-[var(--chat-text-secondary)]">
            {t('answerSurface.formReadOnly', 'Submitting to chat is unavailable in this view.')}
          </p>
        ) : null}
      </div>
      {applied ? (
        <section
          role="status"
          aria-label={t('answerSurface.formResult', 'Applied values')}
          className="mt-5 border-t border-[var(--chat-border-subtle)] pt-4 text-sm leading-6"
        >
          <h4 className="font-medium">{t('answerSurface.formResult', 'Applied values')}</h4>
          <dl className="mt-2 flex flex-col gap-2">
            {spec.fields.map((field, index) => {
              const value = applied[index] ?? '';
              return (
                <div key={field.label}>
                  <dt className="text-[var(--chat-text-secondary)]">{field.label}</dt>
                  <dd className="whitespace-pre-wrap break-words">
                    {Array.isArray(value)
                      ? value.join(', ') || t('answerSurface.none', 'None')
                      : value || t('answerSurface.none', 'None')}
                    {field.kind === 'slider' && field.unit ? ` ${field.unit}` : ''}
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>
      ) : null}
    </form>
  );
}
