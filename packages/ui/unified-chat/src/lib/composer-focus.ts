import type { FocusEvent, PointerEvent } from 'react';

export const composerFocusEvents = {
  onPointerDownCapture(event: PointerEvent<HTMLElement>) {
    if (event.target instanceof Element) {
      event.target.closest('[data-composer-textarea]')?.setAttribute('data-pointer-focus', '');
    }
  },
  onBlurCapture(event: FocusEvent<HTMLElement>) {
    event.target.removeAttribute('data-pointer-focus');
  },
};
