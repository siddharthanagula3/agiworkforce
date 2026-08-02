/**
 * Cloud plugins.
 *
 * This section used to open `/settings/plugins` in a Desktop-owned child
 * window. That path does not exist on the web app — `apps/web/app/settings/`
 * has no `plugins` route, and web's own settings modal routes its Plugins item
 * to the public `/apps` page instead — so the button reliably produced a
 * `/login` redirect (`apps/web/proxy.ts` protects `/settings(.*)`) followed by
 * a 404. It was a dead control, not a bridge.
 *
 * There is no account plugin contract to render inline either: web's Plugins
 * panel is fed a STATIC catalogue (`apps/web/features/plugins/data/plugins.ts`)
 * with `plugins: []` and every row labelled "Catalogue preview", and there is
 * no `/api/plugins` route on any surface. So this section states that plainly
 * and points at the two account-owned extension surfaces that ARE wired in this
 * modal — Connectors and Skills — plus the public catalogue page, opened in the
 * system browser rather than a cookie-gated webview.
 *
 * Local Mode extensions are a different trust boundary and stay in Local
 * settings; nothing here reads or writes them.
 */

import { useState } from 'react';

import { WEB_APP_URL } from '../../../api/config';
import { openExternalUrl } from '../../../utils/navigation';
import { SECONDARY_BUTTON, SectionHeading } from './sectionChrome';

export interface CloudPluginsSectionProps {
  /** Lets the caller move the user to a section that is actually wired. */
  onOpenSection?: (section: string) => void;
}

export function CloudPluginsSection({ onOpenSection }: CloudPluginsSectionProps) {
  const [error, setError] = useState<string | null>(null);

  const openCatalogue = () => {
    setError(null);
    try {
      const url = new URL('/apps', WEB_APP_URL);
      void Promise.resolve(openExternalUrl(url.toString())).catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : 'Could not open the plugin catalogue.');
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not open the plugin catalogue.');
    }
  };

  return (
    <div className="flex flex-col gap-5" data-testid="cloud-plugins">
      <SectionHeading
        title="Plugins"
        description="Account-level plugin packaging is still a catalogue preview: no surface can install or enable a Cloud plugin yet, and there is no API to report which are active."
      />

      <div className="rounded-lg border border-border bg-card/40 p-5">
        <p className="text-sm text-foreground">Nothing to manage here yet</p>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          AGI Cloud does not expose installed plugins for an account, so this section would have
          nothing true to show. Browsing the catalogue opens the public plugin pages in your
          browser.
        </p>
        {error ? (
          <p role="alert" className="mt-3 text-xs text-destructive">
            {error}
          </p>
        ) : null}
        <button type="button" className={`mt-4 ${SECONDARY_BUTTON}`} onClick={openCatalogue}>
          Browse the plugin catalogue
        </button>
      </div>

      <div className="rounded-lg border border-border bg-card/40 p-5">
        <p className="text-sm text-foreground">What does work today</p>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Connectors and Skills are the account-owned extension surfaces this Desktop can read and
          change right now. Both render live account data in this window.
        </p>
        {onOpenSection ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className={SECONDARY_BUTTON}
              onClick={() => onOpenSection('connectors')}
            >
              Open Connectors
            </button>
            <button
              type="button"
              className={SECONDARY_BUTTON}
              onClick={() => onOpenSection('skills')}
            >
              Open Skills
            </button>
          </div>
        ) : null}
      </div>

      <p className="text-xs leading-5 text-muted-foreground">
        Local Mode extensions are managed in Local settings and are never installed, listed, or
        enabled from your Cloud account.
      </p>
    </div>
  );
}
