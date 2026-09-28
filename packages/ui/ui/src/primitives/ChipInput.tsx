'use client';

import * as React from 'react';
import { X } from 'lucide-react';

import { cn } from '../cn';
import { useUiTranslation } from '../i18n';

const SEPARATOR = /[\s,;]+/;

export interface ChipInputProps {
  values: readonly string[];
  onChange: (next: string[]) => void;
  label: string;
  listLabel?: string;
  removeLabel?: (value: string) => string;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  maxItems?: number;
  normalize?: (raw: string) => string;
  validate?: (value: string) => string | null;
  className?: string;
  chipClassName?: string;
}

interface CommitResult {
  accepted: string[];
  rejected: string[];
  error: string | null;
}

export function ChipInput({
  values,
  onChange,
  label,
  listLabel,
  removeLabel,
  id,
  placeholder,
  disabled = false,
  maxItems,
  normalize = (raw) => raw.trim(),
  validate,
  className,
  chipClassName,
}: ChipInputProps) {
  const { t } = useUiTranslation('common');
  const generatedId = React.useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  const [text, setText] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const chipRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const full = maxItems !== undefined && values.length >= maxItems;

  const sort = React.useCallback(
    (tokens: string[]): CommitResult => {
      const accepted: string[] = [];
      const rejected: string[] = [];
      let firstError: string | null = null;
      const seen = new Set(values);
      for (const raw of tokens) {
        const value = normalize(raw);
        if (!value || seen.has(value)) continue;
        if (maxItems !== undefined && values.length + accepted.length >= maxItems) {
          rejected.push(value);
          firstError ??= t('chipInput.full', 'This list holds at most {{count}} entries.', {
            count: maxItems,
          });
          continue;
        }
        const problem = validate?.(value) ?? null;
        if (problem) {
          rejected.push(value);
          firstError ??= t('chipInput.rejected', '{{value}} was not added. {{reason}}', {
            value,
            reason: problem,
          });
          continue;
        }
        seen.add(value);
        accepted.push(value);
      }
      return { accepted, rejected, error: firstError };
    },
    [values, normalize, validate, maxItems, t],
  );

  const commit = React.useCallback(
    (tokens: string[]) => {
      const { accepted, rejected, error: problem } = sort(tokens);
      if (accepted.length > 0) onChange([...values, ...accepted]);
      setText(rejected.join(', '));
      setError(problem);
    },
    [sort, onChange, values],
  );

  const remove = (index: number) => {
    onChange(values.filter((_, position) => position !== index));
    setError(null);
    const previous = chipRefs.current[index - 1];
    if (index > 0 && previous) {
      previous.focus();
    } else {
      inputRef.current?.focus();
    }
  };

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      if (text.trim()) commit(text.split(SEPARATOR));
      return;
    }
    if ((event.key === 'Backspace' || event.key === 'ArrowLeft') && text === '') {
      const last = chipRefs.current[values.length - 1];
      if (last) {
        event.preventDefault();
        last.focus();
      }
    }
  };

  const onChipKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      remove(index);
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      chipRefs.current[index - 1]?.focus();
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      const next = chipRefs.current[index + 1];
      if (next) next.focus();
      else inputRef.current?.focus();
    }
  };

  const onPaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData('text');
    if (!SEPARATOR.test(pasted.trim())) return;
    event.preventDefault();
    commit(`${text} ${pasted}`.split(SEPARATOR));
  };

  const onBlur = () => {
    if (!text.trim()) return;
    commit(text.split(SEPARATOR));
  };

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div
        className={cn(
          'flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 text-sm focus-within:ring-2 focus-within:ring-ring',
          error && 'border-destructive',
          disabled && 'cursor-not-allowed opacity-50',
        )}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            event.preventDefault();
            inputRef.current?.focus();
          }
        }}
      >
        {values.length > 0 ? (
          <ul
            aria-label={listLabel ?? label}
            className="flex max-w-full flex-wrap items-center gap-1.5"
          >
            {values.map((value, index) => (
              <li
                key={value}
                className={cn(
                  'flex max-w-full items-center gap-0.5 rounded-sm border border-border bg-muted py-0.5 ps-2 pe-0.5 text-xs text-foreground',
                  chipClassName,
                )}
              >
                <span className="break-all">{value}</span>
                <button
                  ref={(node) => {
                    chipRefs.current[index] = node;
                  }}
                  type="button"
                  disabled={disabled}
                  aria-label={
                    removeLabel?.(value) ?? t('chipInput.remove', 'Remove {{value}}', { value })
                  }
                  onClick={() => remove(index)}
                  onKeyDown={(event) => onChipKeyDown(event, index)}
                  className="flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                >
                  <X aria-hidden className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          value={text}
          disabled={disabled || full}
          aria-label={label}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          placeholder={values.length === 0 ? placeholder : undefined}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            setText(event.target.value);
            if (error) setError(null);
          }}
          onKeyDown={onInputKeyDown}
          onPaste={onPaste}
          onBlur={onBlur}
          className="min-w-[8rem] flex-1 bg-transparent py-0.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed"
        />
      </div>
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : full ? (
        <p className="text-xs text-muted-foreground">
          {t('chipInput.full', 'This list holds at most {{count}} entries.', { count: maxItems })}
        </p>
      ) : null}
    </div>
  );
}
