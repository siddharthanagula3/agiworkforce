import { useState } from 'react';

import { WEB_APP_URL } from '../../../api/config';
import { openExternalUrl } from '../../../utils/navigation';
import { SECONDARY_BUTTON, SectionHeading } from './sectionChrome';

const REFERRALS_WEB_PATH = '/settings/referrals';
const OPEN_FAILED_MESSAGE = 'Could not open referrals.';

export function CloudReferralsSection() {
  const [error, setError] = useState<string | null>(null);

  const openReferrals = () => {
    setError(null);
    try {
      const url = new URL(REFERRALS_WEB_PATH, WEB_APP_URL);
      void Promise.resolve(openExternalUrl(url.toString())).catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : OPEN_FAILED_MESSAGE);
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : OPEN_FAILED_MESSAGE);
    }
  };

  return (
    <div className="flex flex-col gap-5" data-testid="cloud-referrals">
      <SectionHeading
        title="Referrals"
        description="Invite friends to AGI Workforce with your own link."
      />

      <div className="rounded-lg border border-border bg-card/40 p-5">
        <p className="text-sm text-foreground">Referrals open in your browser</p>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Your invite link, the friends who joined with it, the bonus credits you earned and the
          program rules are in your AGI Workforce account on the web.
        </p>
        {error ? (
          <p role="alert" className="mt-3 text-xs text-destructive">
            {error}
          </p>
        ) : null}
        <button type="button" className={`mt-4 ${SECONDARY_BUTTON}`} onClick={openReferrals}>
          Open referrals
        </button>
      </div>
    </div>
  );
}
