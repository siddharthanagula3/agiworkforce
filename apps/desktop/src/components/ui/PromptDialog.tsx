/**
 * PromptDialog Component
 * Accessible replacement for window.prompt() using Radix UI Dialog
 * Updated Nov 16, 2025
 */

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './Dialog';
import { Button } from './Button';
import { Input } from './Input';
import { Label } from './Label';

export interface PromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: (value: string) => void;
  onCancel?: () => void;
}

export function PromptDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  placeholder,
  defaultValue = '',
  confirmText = 'OK',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
}: PromptDialogProps) {
  const [value, setValue] = React.useState(defaultValue);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) {
      setValue(defaultValue);
      // Focus input when dialog opens
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
    }
  }, [open, defaultValue]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(value);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={description ? 'prompt-description' : undefined}>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && (
              <DialogDescription id="prompt-description">{description}</DialogDescription>
            )}
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {label && (
              <Label htmlFor="prompt-input" className="text-sm font-medium">
                {label}
              </Label>
            )}
            <Input
              ref={inputRef}
              id="prompt-input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={placeholder}
              aria-label={label || 'Input value'}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onCancel?.();
                onOpenChange(false);
              }}
            >
              {cancelText}
            </Button>
            <Button type="submit">{confirmText}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Hook to use PromptDialog imperatively
 * Usage:
 * const prompt = usePrompt();
 * const result = await prompt({
 *   title: 'Enter name',
 *   description: 'Please provide a name for the file',
 *   defaultValue: 'file.txt'
 * });
 * if (result !== null) { ... }
 */
export function usePrompt() {
  const [state, setState] = React.useState<{
    open: boolean;
    title: string;
    description?: string;
    label?: string;
    placeholder?: string;
    defaultValue: string;
    confirmText: string;
    cancelText: string;
    resolve?: (value: string | null) => void;
  }>({
    open: false,
    title: '',
    defaultValue: '',
    confirmText: 'OK',
    cancelText: 'Cancel',
  });

  const prompt = React.useCallback(
    (options: {
      title: string;
      description?: string;
      label?: string;
      placeholder?: string;
      defaultValue?: string;
      confirmText?: string;
      cancelText?: string;
    }) => {
      return new Promise<string | null>((resolve) => {
        setState({
          open: true,
          title: options.title,
          description: options.description,
          label: options.label,
          placeholder: options.placeholder,
          defaultValue: options.defaultValue ?? '',
          confirmText: options.confirmText ?? 'OK',
          cancelText: options.cancelText ?? 'Cancel',
          resolve,
        });
      });
    },
    [],
  );

  const handleConfirm = React.useCallback(
    (value: string) => {
      state.resolve?.(value);
      setState((prev) => ({ ...prev, open: false }));
    },
    [state.resolve],
  );

  const handleCancel = React.useCallback(() => {
    state.resolve?.(null);
    setState((prev) => ({ ...prev, open: false }));
  }, [state.resolve]);

  const dialog = (
    <PromptDialog
      open={state.open}
      onOpenChange={(open) => {
        if (!open) {
          handleCancel();
        }
      }}
      title={state.title}
      description={state.description}
      label={state.label}
      placeholder={state.placeholder}
      defaultValue={state.defaultValue}
      confirmText={state.confirmText}
      cancelText={state.cancelText}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );

  return { prompt, dialog };
}
