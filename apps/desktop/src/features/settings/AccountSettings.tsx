/**
 * AccountSettings tab content
 *
 * Extracted from SettingsPanel.tsx for code organization.
 * Handles Cloud account identity, credits, and sign-out. Subscription changes
 * live in the dedicated Cloud Billing section so one real flow owns them.
 */
import { Button } from '@/components/ui/Button';
import { useAccountStore, useAuthStore } from '../../stores/auth';
import type { CreditBalance } from '../../stores/auth';
import { cloudAccountAuth } from '../../services/cloudAccountAuth';

export function AccountSettings() {
  const accountData = useAccountStore((state) => state.account);

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Account</h3>
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="mb-6 flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-indigo-500 to-purple-500 text-xl font-semibold text-white">
            {accountData.avatar ? (
              <img
                src={accountData.avatar}
                alt={accountData.displayName || ''}
                className="h-full w-full rounded-full object-cover"
              />
            ) : (
              <span>
                {(accountData.displayName || accountData.email || 'U')
                  .split(/[\s._-]+/)
                  .filter(Boolean)
                  .map((n: string) => n[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2)}
              </span>
            )}
          </div>
          <div>
            <div className="text-lg font-semibold">
              {accountData.displayName || accountData.email?.split('@')[0] || 'User'}
            </div>
            <div className="text-sm text-muted-foreground">{accountData.email}</div>
            <div className="mt-1 inline-flex items-center rounded bg-muted/40 px-2 py-0.5 text-xs font-medium uppercase tracking-wider text-foreground">
              {accountData.planDisplayName || 'Free'}
            </div>
          </div>
        </div>

        {accountData.credits && <CreditsDisplay credits={accountData.credits} />}

        <div className="flex gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void cloudAccountAuth.openAccountManagement()}
          >
            Manage account
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => void useAuthStore.getState().signOut()}
          >
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
}

function CreditsDisplay({ credits }: { credits: CreditBalance }) {
  return (
    <div className="space-y-3 mb-6">
      {credits.daily_limit_cents !== undefined && credits.daily_limit_cents > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Daily Credits</span>
            <span className="text-sm text-muted-foreground">
              ${((credits.daily_remaining_cents ?? 0) / 100).toFixed(2)} remaining
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{
                width: `${Math.min(
                  ((credits.daily_used_cents || 0) / (credits.daily_limit_cents || 1)) * 100,
                  100,
                )}%`,
              }}
            />
          </div>
        </div>
      )}
      {credits.allocated_cents && credits.allocated_cents > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Monthly Credits</span>
            <span className="text-sm text-muted-foreground">
              ${((credits.remaining_cents ?? 0) / 100).toFixed(2)} remaining
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{
                width: `${Math.min(
                  ((credits.used_cents || 0) / (credits.allocated_cents || 1)) * 100,
                  100,
                )}%`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
