'use client';

import { useOrganizationOverview } from '@/features/settings/hooks/use-settings-queries';
import { SSOPanel } from '@/features/settings/sections/team/SSOPanel';
import DirectorySyncAdminPage from '@/features/admin/pages/DirectorySyncAdminPage';

const noticeStyle = {
  border: '1px solid var(--settings-border)',
  borderRadius: 'var(--radius-lg)',
  background: 'var(--bg-elev)',
  padding: 20,
} as const;

/**
 * Identity administration belongs to the customer, not to a platform operator.
 *
 * Both panels below were previously reachable only through `/admin`, which is
 * gated on Clerk publicMetadata that no customer holds. The APIs behind them
 * were always org-scoped and entitlement-gated, so this moves the UI to the
 * population the authorization was already written for.
 */
export function WorkspaceIdentityPanels() {
  const overviewQuery = useOrganizationOverview();
  const organization = overviewQuery.data?.organization ?? null;

  if (overviewQuery.isPending) {
    return (
      <div role="status" style={{ ...noticeStyle, color: 'var(--text-3)', fontSize: 13 }}>
        Loading identity configuration…
      </div>
    );
  }

  if (overviewQuery.isError) {
    return (
      <div style={noticeStyle}>
        <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
          We could not load your identity configuration
        </p>
        <p className="mt-1.5 text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
          {overviewQuery.error.message}
        </p>
        <button
          type="button"
          onClick={() => void overviewQuery.refetch()}
          className="mt-3 rounded-md border px-3 py-1.5 text-xs transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{ borderColor: 'var(--settings-border)', color: 'var(--text-1)' }}
        >
          Try again
        </button>
      </div>
    );
  }

  if (!organization) {
    return (
      <div style={noticeStyle}>
        <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
          No workspace selected
        </p>
        <p className="mt-1.5 text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
          Single sign-on and directory provisioning belong to a shared workspace. Switch to one to
          configure them.
        </p>
      </div>
    );
  }

  const isOwner = organization.currentUserRole === 'owner';

  return (
    <div className="flex flex-col gap-6">
      <SSOPanel organizationId={organization.id} isOwner={isOwner} />
      <DirectorySyncAdminPage />
      <div style={noticeStyle}>
        <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
          Not yet available
        </p>
        <ul
          className="mt-2 flex list-disc flex-col gap-1.5 pl-4 text-xs leading-relaxed"
          style={{ color: 'var(--text-3)' }}
        >
          <li>
            <strong style={{ color: 'var(--text-2)' }}>Requiring SSO.</strong> An active connection
            adds an authentication route; it does not remove the others. A member who has a password
            can still use it.
          </li>
          <li>
            <strong style={{ color: 'var(--text-2)' }}>Session revocation on deprovision.</strong>{' '}
            Deactivating a user at your IdP removes their membership, but does not yet terminate
            live sessions or device tokens on Desktop, Mobile, CLI, VS Code, or Chrome.
          </li>
          <li>
            <strong style={{ color: 'var(--text-2)' }}>Group-scoped entitlements.</strong> Directory
            groups map to an organization role. They do not yet carry sharing grants, policy scope,
            or budgets.
          </li>
        </ul>
      </div>
    </div>
  );
}
