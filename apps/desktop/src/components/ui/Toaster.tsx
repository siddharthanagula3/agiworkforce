import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastIcon,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from './Toast';
import { useToast } from '../../hooks/useToast';

/**
 * Toaster component that renders toast notifications.
 *
 * Features:
 * - Accessible live region announcements
 * - Visual icons for different variants
 * - Swipe-to-dismiss on touch devices
 * - Keyboard dismissible
 */
export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        return (
          <Toast
            key={id}
            variant={variant}
            role={variant === 'destructive' ? 'alert' : 'status'}
            aria-live={variant === 'destructive' ? 'assertive' : 'polite'}
            {...props}
          >
            <div className="flex items-start gap-3">
              <ToastIcon variant={variant} />
              <div className="grid gap-1">
                {title && <ToastTitle>{title}</ToastTitle>}
                {description && <ToastDescription>{description}</ToastDescription>}
              </div>
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
