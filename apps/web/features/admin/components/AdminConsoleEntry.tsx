'use client';

import { useUser } from '@clerk/nextjs';
import { ShieldCheck } from 'lucide-react';
import { SettingsPageLink } from '@features/settings/components/SettingsSectionLink';
import { ADMIN_CONSOLE_PATH, hasAdminConsoleAccess } from '../lib/admin-console-access';

export function AdminConsoleEntry() {
  const { isLoaded, user } = useUser();

  if (!isLoaded || !hasAdminConsoleAccess(user?.publicMetadata)) return null;

  return (
    <section
      data-testid="admin-console-entry"
      aria-label="Admin console"
      style={{
        border: '1px solid var(--settings-border)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--bg-elev)',
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <ShieldCheck size={15} aria-hidden="true" style={{ color: 'var(--text-2)' }} />
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>Admin console</div>
      </div>
      <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--text-3)' }}>
        Security operations for the whole workspace: event metrics, alert thresholds, and account
        suspend, ban, and reactivate actions. Every action is authenticated, CSRF-protected, and
        written to the security audit log.
      </p>
      <SettingsPageLink
        href={ADMIN_CONSOLE_PATH}
        style={{
          alignSelf: 'flex-start',
          minHeight: 36,
          display: 'inline-flex',
          alignItems: 'center',
          border: '1px solid var(--settings-border)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--text-2)',
          fontSize: 12,
          fontWeight: 600,
          padding: '7px 11px',
          textDecoration: 'none',
        }}
      >
        Open admin console
      </SettingsPageLink>
    </section>
  );
}
