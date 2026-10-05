'use client';

import { useEffect, useState } from 'react';
import { Alert, AlertDescription, AlertTitle, Button } from '@agiworkforce/ui';

import { useSettingsModal } from '@/features/settings/components/SettingsModalProvider';

import {
  ARTIFACT_PRIVACY_NOTICE_STORAGE_KEY,
  ARTIFACT_STORAGE_NOTICE_DISMISS_LABEL,
  ARTIFACT_STORAGE_NOTICE_SAVED,
  ARTIFACT_STORAGE_NOTICE_SETTINGS_LABEL,
  ARTIFACT_STORAGE_NOTICE_SHARED,
  ARTIFACT_STORAGE_NOTICE_TITLE,
} from '../lib/artifact-storage-notice-copy';

function hasSeenNotice(): boolean {
  try {
    return window.localStorage.getItem(ARTIFACT_PRIVACY_NOTICE_STORAGE_KEY) === '1';
  } catch {
    return true;
  }
}

function markNoticeSeen(): void {
  try {
    window.localStorage.setItem(ARTIFACT_PRIVACY_NOTICE_STORAGE_KEY, '1');
  } catch {
    // A blocked store just means the notice reappears next open.
  }
}

export function ArtifactPrivacyNotice() {
  const [dismissed, setDismissed] = useState(true);
  const { openSettings } = useSettingsModal();

  useEffect(() => {
    setDismissed(hasSeenNotice());
  }, []);

  if (dismissed) return null;

  const dismiss = () => {
    markNoticeSeen();
    setDismissed(true);
  };

  return (
    <Alert className="mx-3 mt-3 w-auto">
      <AlertTitle>{ARTIFACT_STORAGE_NOTICE_TITLE}</AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        <p>{ARTIFACT_STORAGE_NOTICE_SAVED}</p>
        <p>{ARTIFACT_STORAGE_NOTICE_SHARED}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={dismiss}>
            {ARTIFACT_STORAGE_NOTICE_DISMISS_LABEL}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => openSettings('privacy')}>
            {ARTIFACT_STORAGE_NOTICE_SETTINGS_LABEL}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
