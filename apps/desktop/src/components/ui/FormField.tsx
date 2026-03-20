import * as React from 'react';
import { cn } from '../../lib/utils';
import { Label } from './Label';
import { Input, type InputProps } from './Input';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';

export interface FormFieldProps extends Omit<InputProps, 'id'> {
  /** Unique identifier for the field */
  id: string;
  /** Label text for the field */
  label: string;
  /** Optional description/help text */
  description?: string;
  /** Error message to display */
  error?: string;
  /** Success message to display */
  success?: string;
  /** Whether the field is required */
  required?: boolean;
  /** Whether to show inline validation icons */
  showValidationIcon?: boolean;
  /** Custom validation function for real-time validation */
  validate?: (value: string) => string | undefined;
  /** Debounce time for validation in ms (default: 300) */
  validateDebounce?: number;
  /** Container class name */
  containerClassName?: string;
  /** Label class name */
  labelClassName?: string;
  /** Hint text shown below the input */
  hint?: string;
}

/**
 * A form field component with built-in validation support and accessibility.
 *
 * Features:
 * - Inline error/success messages with proper ARIA attributes
 * - Real-time validation with debouncing
 * - Required field indicators
 * - Description and hint text support
 * - Validation icons
 *
 * Usage:
 * ```tsx
 * <FormField
 *   id="email"
 *   label="Email Address"
 *   type="email"
 *   required
 *   error={errors.email}
 *   description="We'll never share your email."
 *   validate={(value) => {
 *     if (!value.includes('@')) return 'Please enter a valid email';
 *   }}
 * />
 * ```
 */
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
  const validateTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  // Use external error if provided, otherwise use internal validation error
  const displayError = error ?? (touched ? internalError : undefined);
  const isValid = touched && !displayError && (success || inputProps.value);

  // Generate unique IDs for ARIA attributes
  const errorId = `${id}-error`;
  const descriptionId = `${id}-description`;
  const hintId = `${id}-hint`;

  // Build aria-describedby based on what's present
  const ariaDescribedBy =
    [description && descriptionId, hint && hintId, displayError && errorId]
      .filter(Boolean)
      .join(' ') || undefined;

  // Cleanup timeout on unmount
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

      // Run validation with debouncing — always validate internally, but only show errors when touched
      if (validate) {
        if (validateTimeoutRef.current) {
          clearTimeout(validateTimeoutRef.current);
        }
        validateTimeoutRef.current = setTimeout(() => {
          const validationError = validate(e.target.value);
          setInternalError(validationError);
        }, validateDebounce);
      }
    },
    [onChange, validate, validateDebounce],
  );

  const handleBlur = React.useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      setTouched(true);
      onBlur?.(e);

      // Run immediate validation on blur
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
          className={cn('text-sm font-medium', displayError && 'text-destructive', labelClassName)}
        >
          {label}
          {required && (
            <span className="ml-1 text-destructive" aria-hidden="true">
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
            <AlertCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
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
          className="flex items-start gap-1 text-xs text-destructive"
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
