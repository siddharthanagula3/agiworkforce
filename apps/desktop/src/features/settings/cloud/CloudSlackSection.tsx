import { useState } from 'react';

import { WEB_APP_URL } from '../../../api/config';
import { openExternalUrl } from '../../../utils/navigation';
import { SECONDARY_BUTTON, SectionHeading } from './sectionChrome';

const SLACK_WEB_PATH = '/settings/slack';
const OPEN_FAILED_MESSAGE = 'Could not open Slack app settings.';

export function CloudSlackSection() {
  const [error, setError] = useState<string | null>(null);

  const openSlackSettings = () => {
    setError(null);
    try {
      const url = new URL(SLACK_WEB_PATH, WEB_APP_URL);
      void Promise.resolve(openExternalUrl(url.toString())).catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : OPEN_FAILED_MESSAGE);
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : OPEN_FAILED_MESSAGE);
    }
  };

  return (
    <div className="flex flex-col gap-5" data-testid="cloud-slack">
      <SectionHeading
        title="Slack app"
        description="Message AGI Workforce in Slack, or mention it in a channel, and it answers there as the app."
      />

      <div className="rounded-lg border border-border bg-card/40 p-5">
        <p className="text-sm text-foreground">Slack app settings open in your browser</p>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Adding the app to a Slack workspace signs you in to Slack in the browser. Your linked
          Slack accounts, the workspaces you added it to and any Slack answer waiting for your
          approval are in your AGI Workforce account on the web.
        </p>
        {error ? (
          <p role="alert" className="mt-3 text-xs text-destructive">
            {error}
          </p>
        ) : null}
        <button type="button" className={`mt-4 ${SECONDARY_BUTTON}`} onClick={openSlackSettings}>
          Open Slack app settings
        </button>
      </div>
    </div>
  );
}
