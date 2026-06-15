'use client';

/**
 * SettingsModalRedirect — mounts on any route that should open the settings
 * modal (e.g. /settings/general, /skills, /connectors, /apps) and immediately
 * fires openSettings with the correct section, then navigates back to /chat so
 * the modal floats over the app shell rather than a blank page.
 *
 * This keeps routes deep-linkable while keeping the modal-first UX.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSettingsModal } from './SettingsModalProvider';

interface SettingsModalRedirectProps {
  /** The settings section to activate (e.g. 'general', 'connectors', 'skills') */
  section: string;
  /** Where to navigate after opening the modal. Defaults to '/chat'. */
  returnTo?: string;
}

export function SettingsModalRedirect({ section, returnTo = '/chat' }: SettingsModalRedirectProps) {
  const { openSettings } = useSettingsModal();
  const router = useRouter();

  useEffect(() => {
    openSettings(section);
    router.replace(returnTo);
  }, [openSettings, router, returnTo, section]);

  // Render nothing — the modal opens globally via the provider
  return null;
}
