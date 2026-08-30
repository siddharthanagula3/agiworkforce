'use client';

import * as React from 'react';
import { cn } from '../cn';
import { Label } from './Label';
import { Input, type InputProps } from './Input';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';

export interface FormFieldProps extends Omit<InputProps, 'id'> {
  id: string;
  label: string;
  description?: string;
  error?: string;
  success?: string;
  required?: boolean;
  showValidationIcon?: boolean;
  validate?: (value: string) => string | undefined;
  validateDebounce?: number;
  containerClassName?: string;
  labelClassName?: string;
  hint?: string;
}

function FormField({
  id,
  label,
  description,
  error,
  success,
  required,
  showValidationIcon = true,
  validate,
  validateDebounce = 300,
  containerClassName,
  labelClassName,
  hint,
  className,
  onChange,
  onBlur,
  ...inputProps
}: FormFieldProps) {
  const [internalError, setInternalError] = React.useState<string | undefined>();
  const [touched, setTouched] = React.useState(false);
  const validateTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const displayError = error ?? (touched ? internalError : undefined);
  const isValid = touched && !displayError && (success || inputProps.value);

  const errorId = `${id}-error`;
  const descriptionId = `${id}-description`;
  const hintId = `${id}-hint`;

  const ariaDescribedBy =
    [description && descriptionId, hint && hintId, displayError && errorId]
      .filter(Boolean)
      .join(' ') || undefined;

  React.useEffect(() => {
    return () => {
      if (validateTimeoutRef.current) {
        clearTimeout(validateTimeoutRef.current);
      }
    };
  }, []);

  const handleChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange?.(e);

      if (validate && touched) {
        if (validateTimeoutRef.current) {
          clearTimeout(validateTimeoutRef.current);
        }
        validateTimeoutRef.current = setTimeout(() => {
          const validationError = validate(e.target.value);
          setInternalError(validationError);
        }, validateDebounce);
      }
    },
    [onChange, validate, touched, validateDebounce],
  );

  const handleBlur = React.useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      setTouched(true);
      onBlur?.(e);

      if (validate) {
        const validationError = validate(e.target.value);
        setInternalError(validationError);
      }
    },
    [onBlur, validate],
  );

  return (
    <div className={cn('space-y-2', containerClassName)}>
      <div className="flex items-center justify-between">
        <Label
          htmlFor={id}
          className={cn('text-sm font-medium', displayError && 'text-danger', labelClassName)}
        >
          {label}
          {required && (
            <span className="ml-1 text-danger" aria-hidden="true">
              *
            </span>
          )}
        </Label>
        {required && <span className="sr-only">(required)</span>}
      </div>

      {description && (
        <p id={descriptionId} className="text-xs text-muted-foreground">
          {description}
        </p>
      )}

      <div className="relative">
        <Input
          id={id}
          aria-invalid={displayError ? 'true' : 'false'}
          aria-describedby={ariaDescribedBy}
          aria-required={required}
          className={cn(
            className,
            displayError && 'border-destructive focus-visible:ring-destructive',
            isValid && 'border-green-500 focus-visible:ring-green-500',
            showValidationIcon && (displayError || isValid) && 'pr-10',
          )}
          onChange={handleChange}
          onBlur={handleBlur}
          {...inputProps}
        />

        {showValidationIcon && displayError && (
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
            <AlertCircle className="h-4 w-4 text-danger" aria-hidden="true" />
          </div>
        )}

        {showValidationIcon && isValid && !displayError && (
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
            <CheckCircle2 className="h-4 w-4 text-green-500" aria-hidden="true" />
          </div>
        )}
      </div>

      {hint && !displayError && !success && (
        <p id={hintId} className="flex items-start gap-1 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          {hint}
        </p>
      )}

      {displayError && (
        <p
          id={errorId}
          className="flex items-start gap-1 text-xs text-danger"
          role="alert"
          aria-live="polite"
        >
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          {displayError}
        </p>
      )}

      {success && !displayError && (
        <p className="flex items-start gap-1 text-xs text-green-600" role="status">
          <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          {success}
        </p>
      )}
    </div>
  );
}

FormField.displayName = 'FormField';

export { FormField };
