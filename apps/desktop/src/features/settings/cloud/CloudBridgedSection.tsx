
import { useState } from 'react';

import { openDesktopCloudAccountWindow } from '../../../services/desktopCloudAccountWindow';
import { selectHasCloudAccountSession, useAuthStore } from '../../../stores/auth';
import { PRIMARY_BUTTON, SECONDARY_BUTTON, SectionHeading } from './sectionChrome';

export interface CloudBridgedSectionProps {
  sectionKey: string;
  title: string;
  description: string;
  path: string;
  action: string;
}

function reauthPath(path: string): string {
  const query = new URLSearchParams({ redirectTo: path, surface: 'desktop' });
  return `/login?${query.toString()}`;
}

export function CloudBridgedSection({
  sectionKey,
  title,
  description,
  path,
  action,
}: CloudBridgedSectionProps) {
  const hasCloudAccountSession = useAuthStore(selectHasCloudAccountSession);
  const [pending, setPending] = useState<'open' | 'reauth' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openPath = (target: string, mode: 'open' | 'reauth') => {
    setError(null);
    setPending(mode);
    void openDesktopCloudAccountWindow(target, `AGI Cloud ${title}`)
      .catch((openError: unknown) => {
        setError(
          openError instanceof Error
            ? openError.message
            : `Could not open ${title.toLocaleLowerCase()}.`,
        );
      })
      .finally(() => setPending(null));
  };

  return (
    <div className="flex flex-col gap-6" data-testid={`cloud-bridged-${sectionKey}`}>
      <SectionHeading title={title} description={description} />

      <div className="rounded-lg border border-border bg-card/40 p-5">
        <p className="text-sm text-foreground">
          {title} is managed on agiworkforce.com and opens in a window owned by AGI Desktop.
        </p>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          That window keeps its own web sign-in, separate from this device&apos;s Cloud session, and
          it can expire on its own. If it shows the sign-in page instead of {title.toLowerCase()},
          use <span className="font-medium text-foreground">Sign in again to manage this</span>{' '}
          below. It uses the Cloud account boundary and never receives Local chats, files, model
          keys, or workspace permissions.
        </p>

        {!hasCloudAccountSession ? (
          <p role="status" className="mt-3 text-xs text-muted-foreground">
            This Desktop is not connected to AGI Cloud right now, so the web window will ask you to
            sign in.
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="mt-3 text-xs text-destructive">
            {error}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className={PRIMARY_BUTTON}
            disabled={pending !== null}
            aria-busy={pending === 'open' || undefined}
            onClick={() => openPath(path, 'open')}
          >
            {pending === 'open' ? 'Opening…' : action}
          </button>
          <button
            type="button"
            className={SECONDARY_BUTTON}
            disabled={pending !== null}
            aria-busy={pending === 'reauth' || undefined}
            onClick={() => openPath(reauthPath(path), 'reauth')}
          >
            {pending === 'reauth' ? 'Opening sign-in…' : 'Sign in again to manage this'}
          </button>
        </div>
      </div>
    </div>
  );
}
