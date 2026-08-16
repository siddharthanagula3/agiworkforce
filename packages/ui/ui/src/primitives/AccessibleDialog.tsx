'use client';

import * as React from 'react';
import { cn } from '../cn';
import { useUiTranslation } from '../i18n';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from './Dialog';
import { X } from 'lucide-react';

export interface AccessibleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  initialFocusRef?: React.RefObject<HTMLElement>;
  triggerRef?: React.RefObject<HTMLElement>;
  showCloseButton?: boolean;
  closeOnEscape?: boolean;
  closeOnOverlayClick?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  modal?: boolean;
}

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-[90vw]',
};

export function AccessibleDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  initialFocusRef,
  triggerRef,
  showCloseButton = true,
  closeOnEscape = true,
  closeOnOverlayClick = true,
  className,
  size = 'md',
  modal = true,
}: AccessibleDialogProps) {
  const { t } = useUiTranslation('common');
  const contentRef = React.useRef<HTMLDivElement>(null);
  const previousActiveElement = React.useRef<Element | null>(null);

  React.useEffect(() => {
    if (open) {
      previousActiveElement.current = document.activeElement;
    }
  }, [open]);

  React.useEffect(() => {
    if (!open) {
      const focusTarget = triggerRef?.current ?? previousActiveElement.current;
      if (focusTarget && focusTarget instanceof HTMLElement) {
        requestAnimationFrame(() => {
          focusTarget.focus();
        });
      }
    }
  }, [open, triggerRef]);

  React.useEffect(() => {
    if (open && initialFocusRef?.current) {
      requestAnimationFrame(() => {
        initialFocusRef.current?.focus();
      });
    }
  }, [open, initialFocusRef]);

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent) => {
      if (closeOnEscape && event.key === 'Escape') {
        event.preventDefault();
        onOpenChange(false);
      }
    },
    [closeOnEscape, onOpenChange],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={modal}>
      <DialogContent
        ref={contentRef}
        className={cn(sizeClasses[size], className)}
        onKeyDown={handleKeyDown}
        onPointerDownOutside={closeOnOverlayClick ? undefined : (e) => e.preventDefault()}
        onInteractOutside={closeOnOverlayClick ? undefined : (e) => e.preventDefault()}
        aria-modal={modal}
        {...(!description ? { 'aria-describedby': undefined } : {})}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="py-4">{children}</div>

        {footer && <DialogFooter>{footer}</DialogFooter>}

        {showCloseButton && (
          <DialogClose
            className="absolute right-4 top-4 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
            aria-label={t('closeDialog', 'Close dialog')}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </DialogClose>
        )}
      </DialogContent>
    </Dialog>
  );
}

AccessibleDialog.displayName = 'AccessibleDialog';

export default AccessibleDialog;
