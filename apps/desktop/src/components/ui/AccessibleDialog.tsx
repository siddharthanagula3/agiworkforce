import * as React from 'react';
import { cn } from '../../lib/utils';
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
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void;
  /** Dialog title - required for accessibility */
  title: string;
  /** Optional description */
  description?: string;
  /** Dialog content */
  children: React.ReactNode;
  /** Footer content (buttons, etc.) */
  footer?: React.ReactNode;
  /** Ref to the element that should receive focus when dialog opens */
  initialFocusRef?: React.RefObject<HTMLElement>;
  /** Ref to the element that triggered the dialog - focus returns here on close */
  triggerRef?: React.RefObject<HTMLElement>;
  /** Whether to show the close button */
  showCloseButton?: boolean;
  /** Whether pressing Escape should close the dialog */
  closeOnEscape?: boolean;
  /** Whether clicking the overlay should close the dialog */
  closeOnOverlayClick?: boolean;
  /** Custom class name for the dialog content */
  className?: string;
  /** Size of the dialog */
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  /** Whether the dialog is a modal (traps focus) - default true */
  modal?: boolean;
}

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-[90vw]',
};

/**
 * An accessible dialog component with enhanced features.
 *
 * Features:
 * - Focus trapping within the dialog
 * - Focus restoration to trigger element on close
 * - Escape key to close
 * - Screen reader announcements
 * - Proper ARIA attributes
 * - Initial focus management
 *
 * Usage:
 * ```tsx
 * const triggerRef = useRef<HTMLButtonElement>(null);
 * const [open, setOpen] = useState(false);
 *
 * <Button ref={triggerRef} onClick={() => setOpen(true)}>
 *   Open Dialog
 * </Button>
 *
 * <AccessibleDialog
 *   open={open}
 *   onOpenChange={setOpen}
 *   title="Confirm Action"
 *   description="Are you sure you want to proceed?"
 *   triggerRef={triggerRef}
 *   footer={
 *     <>
 *       <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
 *       <Button onClick={handleConfirm}>Confirm</Button>
 *     </>
 *   }
 * >
 *   <p>Dialog content here</p>
 * </AccessibleDialog>
 * ```
 */
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
  const contentRef = React.useRef<HTMLDivElement>(null);
  const previousActiveElement = React.useRef<Element | null>(null);

  // Store the active element before opening
  React.useEffect(() => {
    if (open) {
      previousActiveElement.current = document.activeElement;
    }
  }, [open]);

  // Manage focus on close
  React.useEffect(() => {
    if (!open) {
      // Return focus to trigger or previous active element
      const focusTarget = triggerRef?.current ?? previousActiveElement.current;
      if (focusTarget && focusTarget instanceof HTMLElement) {
        // Small delay to ensure dialog is fully closed
        requestAnimationFrame(() => {
          focusTarget.focus();
        });
      }
    }
  }, [open, triggerRef]);

  // Handle initial focus
  React.useEffect(() => {
    if (open && initialFocusRef?.current) {
      // Delay focus to ensure dialog content is rendered
      requestAnimationFrame(() => {
        initialFocusRef.current?.focus();
      });
    }
  }, [open, initialFocusRef]);

  // Handle escape key
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
        aria-labelledby="dialog-title"
        aria-describedby={description ? 'dialog-description' : undefined}
      >
        <DialogHeader>
          <DialogTitle id="dialog-title">{title}</DialogTitle>
          {description && (
            <DialogDescription id="dialog-description">{description}</DialogDescription>
          )}
        </DialogHeader>

        <div className="py-4">{children}</div>

        {footer && <DialogFooter>{footer}</DialogFooter>}

        {showCloseButton && (
          <DialogClose
            className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
            aria-label="Close dialog"
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
