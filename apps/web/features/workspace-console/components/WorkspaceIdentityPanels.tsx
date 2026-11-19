'use client';

import { useOrganizationOverview } from '@/features/settings/hooks/use-settings-queries';
import { SSOPanel } from '@/features/settings/sections/team/SSOPanel';
import DirectorySyncAdminPage from '@/features/admin/pages/DirectorySyncAdminPage';
import { toUserMessage } from '@/lib/user-error-message';
import { WorkspaceServicePrincipals } from './WorkspaceServicePrincipals';

const noticeStyle = {
  border: '1px solid var(--settings-border)',
  borderRadius: 'var(--radius-lg)',
  background: 'var(--bg-elev)',
  padding: 'var(--space-5)',
} as const;

/**
 * Identity administration belongs to the customer, not to a platform operator:
 * the APIs behind these panels are org-scoped and entitlement-gated.
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
          {toUserMessage(overviewQuery.error, 'Identity configuration could not be loaded.')}
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
      <DirectorySyncAdminPage organizationId={organization.id} />
      <WorkspaceServicePrincipals />
      <div style={noticeStyle}>
        <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
          What deprovisioning does
        </p>
        <p className="mt-1.5 text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
          Removing a user at your identity provider ends their membership, tokens, keys and sessions
          here. Their other accounts are untouched.
        </p>
      </div>
      <div style={noticeStyle}>
        <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
          Not yet available
        </p>
        <ul
          className="mt-2 flex list-disc flex-col gap-1.5 ps-4 text-xs leading-relaxed"
          style={{ color: 'var(--text-3)' }}
        >
          <li>
            <strong style={{ color: 'var(--text-2)' }}>Requiring SSO.</strong> An active connection
            adds an authentication route; it does not remove the others. A member who has a password
            can still use it.
          </li>
          <li>
            <strong style={{ color: 'var(--text-2)' }}>Group-scoped sharing and budgets.</strong>{' '}
            Directory groups map to an organization role, and extra roles and policy exceptions for
            a group are set in Roles and Policy. They do not yet carry sharing grants or budgets.
          </li>
        </ul>
      </div>
    </div>
  );
}
