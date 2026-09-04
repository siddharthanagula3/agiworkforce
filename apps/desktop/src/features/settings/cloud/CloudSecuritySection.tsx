import { useCallback, useEffect, useRef, useState } from 'react';

import {
  getCloudTwoFactorStatus,
  listCloudSecurityActivity,
  type CloudSecurityActivity,
  type CloudTwoFactorStatus,
} from '../../../api/cloudAccountSettings';
import {
  isPresentationModeEnabled,
  setPresentationModeEnabled,
} from '../../../services/ownedWindowPresentation';
import { CloudBridgedSection } from './CloudBridgedSection';
import { SectionError, SectionHeading, SectionLoading, formatSettingsDate } from './sectionChrome';

function PresentationModeRow() {
  const [enabled, setEnabled] = useState(() => isPresentationModeEnabled());

  return (
    <div className="rounded-lg border border-border bg-card/40 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">Presentation mode</p>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            Stripe payment windows are excluded from screen recording and conferencing, so they
            appear black to anyone watching a shared screen. Turn this on to make them capturable
            during a demo or recorded walkthrough, your card details will be visible to whoever is
            watching. Every other AGI window is already capturable. This device only, it is never
            synced to your Cloud account.
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            aria-label="Presentation mode"
            checked={enabled}
            onChange={(event) => {
              const next = event.target.checked;
              setPresentationModeEnabled(next);
              setEnabled(next);
            }}
          />
          {enabled ? 'On' : 'Off'}
        </label>
      </div>
      {enabled ? (
        <p role="status" className="mt-3 text-xs text-muted-foreground">
          Payment windows opened from now on are capturable. Turn this off when the demo is over.
        </p>
      ) : null}
    </div>
  );
}

export function CloudSecuritySection() {
  const [twoFactor, setTwoFactor] = useState<CloudTwoFactorStatus | null>(null);
  const [activity, setActivity] = useState<CloudSecurityActivity[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const load = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const [status, entries] = await Promise.all([
        getCloudTwoFactorStatus(),
        listCloudSecurityActivity(10),
      ]);
      if (generation.current !== current) return;
      setTwoFactor(status);
      setActivity(entries);
    } catch (caught) {
      if (generation.current === current) {
        setError(
          caught instanceof Error ? caught.message : 'Could not load your Cloud security status.',
        );
      }
    } finally {
      if (generation.current === current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      generation.current += 1;
    };
  }, [load]);

  return (
    <div className="flex flex-col gap-6" data-testid="cloud-security">
      <SectionHeading
        title="Security"
        description="Two-factor status and recent account activity for your AGI Cloud account, plus how this device presents its credential windows."
      />

      {loading ? <SectionLoading label="Loading Cloud security status…" /> : null}
      {error ? <SectionError message={error} onRetry={() => void load()} /> : null}

      {!loading && twoFactor ? (
        <div className="rounded-lg border border-border bg-card/40 p-5">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-medium text-foreground">Two-factor authentication</p>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                twoFactor.enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
              }`}
            >
              {twoFactor.enabled ? 'Enabled' : 'Not enabled'}
            </span>
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {twoFactor.enabled
              ? `${twoFactor.backupCodesRemaining} backup ${
                  twoFactor.backupCodesRemaining === 1 ? 'code' : 'codes'
                } remaining.`
              : 'Add a second factor to protect the account this Desktop is connected to.'}
          </p>
        </div>
      ) : null}

      <PresentationModeRow />

      {!loading && activity !== null ? (
        <div>
          <h3 className="text-sm font-medium text-foreground">Recent account activity</h3>
          {activity.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">No recorded account activity yet.</p>
          ) : (
            <ul className="mt-3 overflow-hidden rounded-lg border border-border bg-card/40">
              {activity.map((entry, index) => (
                <li
                  key={entry.id}
                  className={`flex items-center justify-between gap-4 p-4 ${
                    index > 0 ? 'border-t border-border/60' : ''
                  }`}
                >
                  <p className="min-w-0 truncate text-xs text-foreground">{entry.description}</p>
                  <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {formatSettingsDate(entry.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <div className="border-t border-border pt-6">
        <CloudBridgedSection
          sectionKey="security-credentials"
          title="Password and two-factor enrollment"
          description="Changing your password or enrolling a second factor is a Clerk-owned credential flow with no Desktop API."
          path="/settings/security"
          action="Open credential settings"
        />
      </div>
    </div>
  );
}
