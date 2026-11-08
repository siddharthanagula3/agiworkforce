'use client';

import { useEffect } from 'react';
import { onAppCommand } from '@shared/lib/app-commands';

export function focusFollowUpComposer(): void {
  document.querySelector<HTMLElement>('[data-composer-textarea]')?.focus();
}

export function useFocusFollowUp(): void {
  useEffect(() => onAppCommand('focus-follow-up', () => focusFollowUpComposer()), []);
}
