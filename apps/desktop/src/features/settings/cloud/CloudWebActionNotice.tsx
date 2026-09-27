import { useState } from 'react';

import type { CloudWebAction } from '../../../api/cloudAccountSettings';
import { openDesktopCloudAccountWindow } from '../../../services/desktopCloudAccountWindow';
import { SMALL_BUTTON } from './sectionChrome';

export function CloudWebActionNotice({ action }: { action: CloudWebAction }) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openOnWeb = () => {
    setOpening(true);
    setError(null);
    void openDesktopCloudAccountWindow(action.path, 'AGI Cloud account')
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : 'Could not open that page.');
      })
      .finally(() => setOpening(false));
  };

  return (
    <div role="alert" className="rounded-lg border border-border bg-card/40 p-4">
      <p className="text-xs leading-5 text-foreground">{action.message}</p>
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
      <button
        type="button"
        className={`mt-3 ${SMALL_BUTTON}`}
        disabled={opening}
        aria-busy={opening || undefined}
        onClick={openOnWeb}
      >
        {opening ? 'Opening…' : action.label}
      </button>
    </div>
  );
}
