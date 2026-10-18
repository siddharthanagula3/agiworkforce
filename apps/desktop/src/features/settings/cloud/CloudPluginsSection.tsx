import { useState } from 'react';

import { WEB_APP_URL } from '../../../api/config';
import { openExternalUrl } from '../../../utils/navigation';
import { SECONDARY_BUTTON, SectionHeading } from './sectionChrome';

const PLUGINS_WEB_PATH = '/settings/plugins';
const OPEN_FAILED_MESSAGE = 'Could not open your plugins.';

export function CloudPluginsSection() {
  const [error, setError] = useState<string | null>(null);

  const openPlugins = () => {
    setError(null);
    try {
      const url = new URL(PLUGINS_WEB_PATH, WEB_APP_URL);
      void Promise.resolve(openExternalUrl(url.toString())).catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : OPEN_FAILED_MESSAGE);
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : OPEN_FAILED_MESSAGE);
    }
  };

  return (
    <div className="flex flex-col gap-5" data-testid="cloud-plugins">
      <SectionHeading
        title="Plugins"
        description="Plugin packs that add skills and connectors to your AGI Cloud account."
      />

      <div className="rounded-lg border border-border bg-card/40 p-5">
        <p className="text-sm text-foreground">Plugins open in your browser</p>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Installing, updating and removing plugins for your Cloud account happens in your AGI
          Workforce account on the web.
        </p>
        {error ? (
          <p role="alert" className="mt-3 text-xs text-destructive">
            {error}
          </p>
        ) : null}
        <button type="button" className={`mt-4 ${SECONDARY_BUTTON}`} onClick={openPlugins}>
          Manage plugins
        </button>
      </div>

      <p className="text-xs leading-5 text-muted-foreground">
        Local Mode extensions are managed in Local settings and are never installed, listed, or
        enabled from your Cloud account.
      </p>
    </div>
  );
}
