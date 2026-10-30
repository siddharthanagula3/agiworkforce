import { useId, useRef, useState } from 'react';
import { Button, useUiTranslation } from '@agiworkforce/ui';
import { useFollowUpAction } from './FollowUpAction';
import type { FormField, FormSpec } from './answerSurfaces';

type FormValue = string | string[];

const INPUT_CLASS =
  'min-h-10 w-full rounded-md border border-[var(--chat-border)] bg-[var(--chat-bg)] px-3 py-2 text-[var(--chat-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)] pointer-coarse:min-h-11';

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
            ?.querySelector<HTMLElement>(
              `[data-form-field="${errors[0]}"] input, [data-form-field="${errors[0]}"] select, [data-form-field="${errors[0]}"] textarea`,
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
      <h3 className="border-b border-[var(--chat-border-subtle)] px-4 py-3 text-sm font-medium">
        {spec.title}
      </h3>
      <fieldset disabled={streaming} className="flex flex-col gap-4 px-4 py-3">
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
            <div key={field.label} data-form-field={index} className="min-w-0 text-sm">
              {choices ? (
                <fieldset {...a11y}>
                  <legend className="mb-2 font-medium">{label}</legend>
                  <div className="flex flex-col gap-2">
                    {field.options.map((option, optionIndex) => (
                      <label
                        key={option.label}
                        className="flex min-h-8 items-center gap-2 pointer-coarse:min-h-11"
                      >
                        <input
                          type={field.kind === 'radio' ? 'radio' : 'checkbox'}
                          name={`${id}-${index}`}
                          value={option.label}
                          checked={
                            field.kind === 'radio'
                              ? value === option.label
                              : Array.isArray(value) && value.includes(option.label)
                          }
                          {...(optionIndex === 0 ? a11y : {})}
                          onChange={(event) => {
                            if (field.kind === 'radio') change(index, option.label);
                            else {
                              const current = Array.isArray(value) ? value : [];
                              change(
                                index,
                                event.target.checked
                                  ? [...current, option.label]
                                  : current.filter((choice) => choice !== option.label),
                              );
                            }
                          }}
                          className="focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]"
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : (
                <>
                  <label htmlFor={fieldId} className="mb-2 block font-medium">
                    {label}
                  </label>
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
                    <textarea
                      id={fieldId}
                      {...a11y}
                      required={field.required}
                      value={typeof value === 'string' ? value : ''}
                      onChange={(event) => change(index, event.target.value)}
                      rows={3}
                      className={INPUT_CLASS}
                    />
                  ) : field.kind === 'slider' ? (
                    <div className="flex items-center gap-3">
                      <input
                        id={fieldId}
                        {...a11y}
                        type="range"
                        min={field.min}
                        max={field.max}
                        value={typeof value === 'string' ? value : ''}
                        onChange={(event) => change(index, event.target.value)}
                        className="min-h-10 min-w-0 flex-1 focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]"
                      />
                      <output htmlFor={fieldId}>
                        {value} {field.unit}
                      </output>
                    </div>
                  ) : (
                    <input
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
                <p id={errorId} role="alert" className="mt-1 text-[var(--chat-destructive-text)]">
                  {t('answerSurface.invalidField', 'Enter a valid value for {{label}}.', {
                    label: field.label,
                  })}
                </p>
              ) : null}
            </div>
          );
        })}
      </fieldset>
      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--chat-border-subtle)] px-4 py-3">
        <Button type="submit" size="sm" disabled={streaming || (spec.send && !onFollowUp)}>
          {spec.send
            ? t('answerSurface.sendFormLabel', '{{label}} (send to chat)', { label: spec.submit })
            : spec.submit}
        </Button>
        {spec.send ? (
          <p className="text-xs text-[var(--chat-text-secondary)]">
            {t(
              'answerSurface.formSendsValues',
              'Selected values will be sent as your next message.',
            )}
          </p>
        ) : null}
        {spec.send && !onFollowUp ? (
          <p className="text-xs text-[var(--chat-text-secondary)]">
            {t('answerSurface.formReadOnly', 'Submitting to chat is unavailable in this view.')}
          </p>
        ) : null}
      </div>
      {applied ? (
        <section
          role="status"
          aria-label={t('answerSurface.formResult', 'Applied values')}
          className="border-t border-[var(--chat-border-subtle)] px-4 py-3 text-sm"
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
