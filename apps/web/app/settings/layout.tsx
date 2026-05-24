import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { SettingsNavClient } from './SettingsNavClient';

export const dynamic = 'force-dynamic';

export type NavItem = { href: string; label: string };

export const NAV_ITEMS: NavItem[] = [
  { href: '/settings/general', label: 'General' },
  { href: '/settings/account', label: 'Account' },
  { href: '/settings/privacy', label: 'Privacy' },
  { href: '/settings/billing', label: 'Billing' },
  { href: '/settings/usage', label: 'Usage' },
  { href: '/settings/capabilities', label: 'Capabilities' },
  { href: '/settings/connections', label: 'Connectors' },
  { href: '/settings/voice', label: 'Voice' },
];

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const { userId } = await auth();

  if (!userId) {
    redirect('/login?redirectTo=/settings/general');
  }

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        background: 'var(--bg-base, #09090b)',
      }}
    >
      {/* Settings sidebar */}
      <nav
        aria-label="Settings navigation"
        style={{
          width: 220,
          flexShrink: 0,
          borderRight: '1px solid var(--border)',
          padding: '48px 0 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
        }}
      >
        <div
          style={{
            fontSize: 18,
            fontWeight: 500,
            color: 'var(--text-1)',
            padding: '0 16px 16px',
            fontFamily: 'var(--serif)',
          }}
        >
          Settings
        </div>

        {/* Search + nav items rendered client-side so search can filter */}
        <SettingsNavClient items={NAV_ITEMS} />
      </nav>

      {/* Content */}
      <main style={{ flex: 1, padding: '48px 40px', maxWidth: 720 }}>{children}</main>
    </div>
  );
}
