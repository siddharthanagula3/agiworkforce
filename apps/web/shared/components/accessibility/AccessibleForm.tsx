import React, { forwardRef, useId } from 'react';
import { useAccessibility } from '@shared/hooks/useAccessibility';
import { useAriaAttributes } from '@shared/hooks/useAccessibility';

interface AccessibleFormProps extends React.FormHTMLAttributes<HTMLFormElement> {
  children: React.ReactNode;
  announceErrors?: boolean;
  announceSuccess?: boolean;
}

const AccessibleForm = forwardRef<HTMLFormElement, AccessibleFormProps>(
  ({ children, announceErrors = true, announceSuccess = true, onSubmit, ...props }, ref) => {
    const { announce, trackInteraction } = useAccessibility();
    const { setAriaDescribedBy } = useAriaAttributes();
    const formId = useId();
    const errorId = `${formId}-errors`;
    const successId = `${formId}-success`;

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      trackInteraction('submit', 'form', {
        formId,
      });

      const form = event.currentTarget;
      const invalidElements = form.querySelectorAll(':invalid');

      if (invalidElements.length > 0) {
        if (announceErrors) {
          announce(
            `Form has ${invalidElements.length} validation error${invalidElements.length > 1 ? 's' : ''}`,
          );
        }

        const firstInvalid = invalidElements[0] as HTMLElement;
        firstInvalid.focus();

        setAriaDescribedBy(firstInvalid, errorId);
      } else {
        if (announceSuccess) {
          announce('Form submitted successfully');
        }
      }

      // @ts-expect-error - React FormEvent vs SubmitEvent type mismatch
      onSubmit?.(event);
    };

    return (
      <form ref={ref} onSubmit={handleSubmit} aria-describedby={errorId} {...props}>
        {children}

        {/* Hidden elements for screen reader announcements */}
        <div id={errorId} className="sr-only" aria-live="polite" aria-atomic="true" />
        <div id={successId} className="sr-only" aria-live="polite" aria-atomic="true" />
      </form>
    );
  },
);

AccessibleForm.displayName = 'AccessibleForm';

export default AccessibleForm;
