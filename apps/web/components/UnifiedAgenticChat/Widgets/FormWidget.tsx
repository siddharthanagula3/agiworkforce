/**
 * FormWidget Component
 *
 * Embedded form inputs in chat messages for collecting user input.
 * Supports various field types with validation and accessible design.
 *
 * @module Widgets/FormWidget
 */

import React, { useState, useCallback, useId } from 'react';
import { AlertCircle, Calendar, Check, FileUp, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Label } from '../../ui/Label';
import { Checkbox } from '../../ui/Checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/Select';

// ============================================================================
// Types
// ============================================================================

export type FormFieldType = 'text' | 'number' | 'select' | 'checkbox' | 'date' | 'file';

export interface FormFieldOption {
  value: string;
  label: string;
}

export interface FormFieldValidation {
  min?: number;
  max?: number;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  accept?: string; // For file inputs
}

export interface FormField {
  name: string;
  type: FormFieldType;
  label: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string | number | boolean;
  options?: FormFieldOption[]; // For select fields
  validation?: FormFieldValidation;
  description?: string;
  disabled?: boolean;
}

export interface FormWidgetConfig {
  title?: string;
  description?: string;
  fields: FormField[];
  submitLabel?: string;
  cancelLabel?: string;
}

export type FormData = Record<string, string | number | boolean | File | null>;

export interface FormWidgetProps {
  /** Form configuration */
  config: FormWidgetConfig;
  /** Called when form is submitted with valid data */
  onSubmit: (data: FormData) => void | Promise<void>;
  /** Called when form is cancelled */
  onCancel?: () => void;
  /** Initial form values */
  initialValues?: Partial<FormData>;
  /** Additional CSS class names */
  className?: string;
  /** Whether the form is read-only (already submitted) */
  readOnly?: boolean;
  /** Submitted values to display in read-only mode */
  submittedValues?: FormData;
}

type FormStatus = 'idle' | 'submitting' | 'success' | 'error';

// ============================================================================
// Validation Helpers
// ============================================================================

function validateField(
  field: FormField,
  value: string | number | boolean | File | null | undefined,
): string | null {
  // Required check
  if (field.required) {
    if (value === null || value === undefined || value === '') {
      return `${field.label} is required`;
    }
    if (field.type === 'checkbox' && value === false) {
      return `${field.label} must be checked`;
    }
  }

  // Skip further validation if empty and not required
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const validation = field.validation;
  if (!validation) return null;

  // Number validation
  if (field.type === 'number' && typeof value === 'number') {
    if (validation.min !== undefined && value < validation.min) {
      return `${field.label} must be at least ${validation.min}`;
    }
    if (validation.max !== undefined && value > validation.max) {
      return `${field.label} must be at most ${validation.max}`;
    }
  }

  // String validation
  if (typeof value === 'string') {
    if (validation.minLength !== undefined && value.length < validation.minLength) {
      return `${field.label} must be at least ${validation.minLength} characters`;
    }
    if (validation.maxLength !== undefined && value.length > validation.maxLength) {
      return `${field.label} must be at most ${validation.maxLength} characters`;
    }
    if (validation.pattern) {
      const regex = new RegExp(validation.pattern);
      if (!regex.test(value)) {
        return `${field.label} has an invalid format`;
      }
    }
  }

  return null;
}

function getInitialValue(field: FormField): string | number | boolean | File | null {
  if (field.defaultValue !== undefined) {
    return field.defaultValue;
  }

  switch (field.type) {
    case 'checkbox':
      return false;
    case 'number':
      return '';
    case 'file':
      return null;
    default:
      return '';
  }
}

// ============================================================================
// Field Components
// ============================================================================

interface FieldWrapperProps {
  field: FormField;
  error?: string;
  children: React.ReactNode;
  id: string;
}

function FieldWrapper({ field, error, children, id }: FieldWrapperProps) {
  const errorId = `${id}-error`;
  const descId = `${id}-desc`;

  return (
    <div className="space-y-1.5">
      {field.type !== 'checkbox' && (
        <div className="flex items-center justify-between">
          <Label
            htmlFor={id}
            className={cn(
              'text-sm font-medium text-gray-700 dark:text-gray-300',
              error && 'text-red-600 dark:text-red-400',
            )}
          >
            {field.label}
            {field.required && (
              <span className="ml-1 text-red-500" aria-hidden="true">
                *
              </span>
            )}
          </Label>
        </div>
      )}

      {field.description && !error && (
        <p id={descId} className="text-xs text-gray-500 dark:text-gray-400">
          {field.description}
        </p>
      )}

      {children}

      {error && (
        <p
          id={errorId}
          className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400"
          role="alert"
        >
          <AlertCircle className="h-3 w-3" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}

interface TextFieldProps {
  field: FormField;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  id: string;
}

function TextField({ field, value, onChange, error, disabled, id }: TextFieldProps) {
  const errorId = `${id}-error`;
  const descId = `${id}-desc`;

  return (
    <FieldWrapper field={field} error={error} id={id}>
      <Input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        disabled={disabled || field.disabled}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={cn(error && errorId, field.description && descId) || undefined}
        className={cn(
          'bg-white dark:bg-gray-800',
          error && 'border-red-500 focus-visible:ring-red-500',
        )}
      />
    </FieldWrapper>
  );
}

interface NumberFieldProps {
  field: FormField;
  value: string | number;
  onChange: (value: number | '') => void;
  error?: string;
  disabled?: boolean;
  id: string;
}

function NumberField({ field, value, onChange, error, disabled, id }: NumberFieldProps) {
  const errorId = `${id}-error`;
  const descId = `${id}-desc`;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === '') {
      onChange('');
    } else {
      const num = parseFloat(val);
      if (!isNaN(num)) {
        onChange(num);
      }
    }
  };

  return (
    <FieldWrapper field={field} error={error} id={id}>
      <Input
        id={id}
        type="number"
        value={value}
        onChange={handleChange}
        placeholder={field.placeholder}
        disabled={disabled || field.disabled}
        min={field.validation?.min}
        max={field.validation?.max}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={cn(error && errorId, field.description && descId) || undefined}
        className={cn(
          'bg-white dark:bg-gray-800',
          error && 'border-red-500 focus-visible:ring-red-500',
        )}
      />
    </FieldWrapper>
  );
}

interface SelectFieldProps {
  field: FormField;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  id: string;
}

function SelectField({ field, value, onChange, error, disabled, id }: SelectFieldProps) {
  const errorId = `${id}-error`;
  const descId = `${id}-desc`;

  return (
    <FieldWrapper field={field} error={error} id={id}>
      <Select value={value} onValueChange={onChange} disabled={disabled || field.disabled}>
        <SelectTrigger
          id={id}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={cn(error && errorId, field.description && descId) || undefined}
          className={cn('bg-white dark:bg-gray-800', error && 'border-red-500 focus:ring-red-500')}
        >
          <SelectValue placeholder={field.placeholder || 'Select an option'} />
        </SelectTrigger>
        <SelectContent>
          {field.options?.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldWrapper>
  );
}

interface CheckboxFieldProps {
  field: FormField;
  value: boolean;
  onChange: (value: boolean) => void;
  error?: string;
  disabled?: boolean;
  id: string;
}

function CheckboxField({ field, value, onChange, error, disabled, id }: CheckboxFieldProps) {
  const errorId = `${id}-error`;
  const descId = `${id}-desc`;

  return (
    <div className="space-y-1.5">
      <div className="flex items-start gap-3">
        <Checkbox
          id={id}
          checked={value}
          onCheckedChange={(checked) => onChange(checked === true)}
          disabled={disabled || field.disabled}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={cn(error && errorId, field.description && descId) || undefined}
          className={cn(error && 'border-red-500')}
        />
        <div className="space-y-1">
          <Label
            htmlFor={id}
            className={cn(
              'text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer',
              error && 'text-red-600 dark:text-red-400',
            )}
          >
            {field.label}
            {field.required && (
              <span className="ml-1 text-red-500" aria-hidden="true">
                *
              </span>
            )}
          </Label>
          {field.description && (
            <p id={descId} className="text-xs text-gray-500 dark:text-gray-400">
              {field.description}
            </p>
          )}
        </div>
      </div>
      {error && (
        <p
          id={errorId}
          className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 ml-7"
          role="alert"
        >
          <AlertCircle className="h-3 w-3" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}

interface DateFieldProps {
  field: FormField;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  id: string;
}

function DateField({ field, value, onChange, error, disabled, id }: DateFieldProps) {
  const errorId = `${id}-error`;
  const descId = `${id}-desc`;

  return (
    <FieldWrapper field={field} error={error} id={id}>
      <div className="relative">
        <Input
          id={id}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled || field.disabled}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={cn(error && errorId, field.description && descId) || undefined}
          className={cn(
            'bg-white dark:bg-gray-800 pr-10',
            error && 'border-red-500 focus-visible:ring-red-500',
          )}
        />
        <Calendar
          className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none"
          aria-hidden="true"
        />
      </div>
    </FieldWrapper>
  );
}

interface FileFieldProps {
  field: FormField;
  value: File | null;
  onChange: (value: File | null) => void;
  error?: string;
  disabled?: boolean;
  id: string;
}

function FileField({ field, value, onChange, error, disabled, id }: FileFieldProps) {
  const errorId = `${id}-error`;
  const descId = `${id}-desc`;
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    onChange(file);
  };

  const handleClear = () => {
    onChange(null);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      inputRef.current?.click();
    }
  };

  return (
    <FieldWrapper field={field} error={error} id={id}>
      <div className="space-y-2">
        <input
          ref={inputRef}
          type="file"
          id={id}
          onChange={handleFileChange}
          accept={field.validation?.accept}
          disabled={disabled || field.disabled}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={cn(error && errorId, field.description && descId) || undefined}
          className="sr-only"
        />
        <div
          role="button"
          tabIndex={disabled || field.disabled ? -1 : 0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={handleKeyDown}
          className={cn(
            'flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed rounded-lg cursor-pointer transition-colors',
            'bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800',
            'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500',
            error && 'border-red-500 bg-red-50 dark:bg-red-900/10',
            (disabled || field.disabled) && 'opacity-50 cursor-not-allowed',
          )}
        >
          <FileUp className="h-5 w-5 text-gray-400" aria-hidden="true" />
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {field.placeholder || 'Click to select a file'}
          </span>
        </div>

        {value && (
          <div className="flex items-center justify-between px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
            <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{value.name}</span>
            <button
              type="button"
              onClick={handleClear}
              disabled={disabled || field.disabled}
              className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
              aria-label={`Remove ${value.name}`}
            >
              <X className="h-4 w-4 text-gray-500" />
            </button>
          </div>
        )}
      </div>
    </FieldWrapper>
  );
}

// ============================================================================
// Read-Only Display
// ============================================================================

interface ReadOnlyFormProps {
  config: FormWidgetConfig;
  values: FormData;
  className?: string;
}

function ReadOnlyForm({ config, values, className }: ReadOnlyFormProps) {
  const formatValue = (
    field: FormField,
    value: string | number | boolean | File | null | undefined,
  ): string => {
    if (value === null || value === undefined || value === '') {
      return '-';
    }

    switch (field.type) {
      case 'checkbox':
        return value ? 'Yes' : 'No';
      case 'select': {
        const option = field.options?.find((opt) => opt.value === value);
        return option?.label || String(value);
      }
      case 'file':
        return value instanceof File ? value.name : '-';
      case 'date':
        if (typeof value === 'string' && value) {
          try {
            return new Date(value).toLocaleDateString();
          } catch {
            return value;
          }
        }
        return String(value);
      default:
        return String(value);
    }
  };

  return (
    <div
      className={cn(
        'rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/10 overflow-hidden',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-green-100 dark:bg-green-900/20 border-b border-green-200 dark:border-green-800">
        <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
        <span className="text-sm font-medium text-green-700 dark:text-green-300">
          {config.title ? `${config.title} - Submitted` : 'Form Submitted'}
        </span>
      </div>

      {/* Values */}
      <div className="p-4 space-y-3">
        {config.fields.map((field) => (
          <div key={field.name} className="flex flex-col gap-0.5">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {field.label}
            </span>
            <span className="text-sm text-gray-900 dark:text-gray-100">
              {formatValue(field, values[field.name])}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export const FormWidget: React.FC<FormWidgetProps> = ({
  config,
  onSubmit,
  onCancel,
  initialValues,
  className,
  readOnly = false,
  submittedValues,
}) => {
  const formId = useId();

  // Initialize form state
  const [formData, setFormData] = useState<FormData>(() => {
    const initial: FormData = {};
    for (const field of config.fields) {
      initial[field.name] = initialValues?.[field.name] ?? getInitialValue(field);
    }
    return initial;
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<FormStatus>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Update field value
  const updateField = useCallback(
    (name: string, value: string | number | boolean | File | null) => {
      setFormData((prev) => ({ ...prev, [name]: value }));
      // Clear error when field is modified
      setErrors((prev) => {
        if (prev[name]) {
          const next = { ...prev };
          delete next[name];
          return next;
        }
        return prev;
      });
    },
    [],
  );

  // Validate all fields
  const validateForm = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};
    let isValid = true;

    for (const field of config.fields) {
      const error = validateField(field, formData[field.name]);
      if (error) {
        newErrors[field.name] = error;
        isValid = false;
      }
    }

    setErrors(newErrors);
    return isValid;
  }, [config.fields, formData]);

  // Handle form submission
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!validateForm()) {
        return;
      }

      setStatus('submitting');
      setSubmitError(null);

      try {
        await onSubmit(formData);
        setStatus('success');
      } catch (err) {
        setStatus('error');
        setSubmitError(
          err instanceof Error ? err.message : 'Something went wrong. Please try again.',
        );
      }
    },
    [formData, onSubmit, validateForm],
  );

  // Render field based on type
  const renderField = (field: FormField) => {
    const id = `${formId}-${field.name}`;
    const error = errors[field.name];
    const disabled = status === 'submitting';

    switch (field.type) {
      case 'text':
        return (
          <TextField
            key={field.name}
            field={field}
            value={formData[field.name] as string}
            onChange={(value) => updateField(field.name, value)}
            error={error}
            disabled={disabled}
            id={id}
          />
        );

      case 'number':
        return (
          <NumberField
            key={field.name}
            field={field}
            value={formData[field.name] as string | number}
            onChange={(value) => updateField(field.name, value)}
            error={error}
            disabled={disabled}
            id={id}
          />
        );

      case 'select':
        return (
          <SelectField
            key={field.name}
            field={field}
            value={formData[field.name] as string}
            onChange={(value) => updateField(field.name, value)}
            error={error}
            disabled={disabled}
            id={id}
          />
        );

      case 'checkbox':
        return (
          <CheckboxField
            key={field.name}
            field={field}
            value={formData[field.name] as boolean}
            onChange={(value) => updateField(field.name, value)}
            error={error}
            disabled={disabled}
            id={id}
          />
        );

      case 'date':
        return (
          <DateField
            key={field.name}
            field={field}
            value={formData[field.name] as string}
            onChange={(value) => updateField(field.name, value)}
            error={error}
            disabled={disabled}
            id={id}
          />
        );

      case 'file':
        return (
          <FileField
            key={field.name}
            field={field}
            value={formData[field.name] as File | null}
            onChange={(value) => updateField(field.name, value)}
            error={error}
            disabled={disabled}
            id={id}
          />
        );

      default:
        return null;
    }
  };

  // If read-only with submitted values, show read-only display
  if (readOnly && submittedValues) {
    return <ReadOnlyForm config={config} values={submittedValues} className={className} />;
  }

  // Success state
  if (status === 'success') {
    return <ReadOnlyForm config={config} values={formData} className={className} />;
  }

  return (
    <div
      className={cn(
        'rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/10 overflow-hidden',
        className,
      )}
    >
      {/* Header */}
      {(config.title || config.description) && (
        <div className="px-4 py-3 border-b border-blue-200 dark:border-blue-800 bg-blue-100 dark:bg-blue-900/20">
          {config.title && (
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {config.title}
            </h3>
          )}
          {config.description && (
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">{config.description}</p>
          )}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        {/* Fields */}
        {config.fields.map(renderField)}

        {/* Submit error */}
        {submitError && (
          <div
            className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-sm text-red-700 dark:text-red-300"
            role="alert"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            {submitError}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2">
          <Button type="submit" disabled={status === 'submitting'} className="flex-1">
            {status === 'submitting' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              config.submitLabel || 'Submit'
            )}
          </Button>

          {onCancel && (
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={status === 'submitting'}
            >
              {config.cancelLabel || 'Cancel'}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
};

FormWidget.displayName = 'FormWidget';

export default FormWidget;
