'use client';

import { useEffect, useState } from 'react';
import { Alert, AlertDescription, AlertTitle, Button } from '@agiworkforce/ui';

export const ARTIFACT_PRIVACY_NOTICE_STORAGE_KEY = 'agi:artifact-privacy-notice-seen';

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
      <AlertTitle>Artifacts follow your conversation&apos;s privacy</AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        <p>
          An artifact leaves this device only when you publish it, and it inherits the local, BYOK,
          or managed boundary of the conversation that created it.
        </p>
        <Button type="button" size="sm" variant="outline" onClick={dismiss} className="self-start">
          Got it
        </Button>
      </AlertDescription>
    </Alert>
  );
}
