import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../services/supabase-server';
import type { ReactNode } from 'react';
import { SettingsNavActive } from './SettingsNavActive';

export const dynamic = 'force-dynamic';

type NavSection = {
  heading: string;
  links: { href: string; label: string }[];
};

const NAV_SECTIONS: NavSection[] = [
  {
    heading: 'Account',
    links: [
      { href: '/settings/general', label: 'General' },
      { href: '/settings/profile', label: 'Profile' },
      { href: '/settings/billing', label: 'Billing' },
    ],
  },
  {
    heading: 'Models',
    links: [
      { href: '/settings/capabilities', label: 'Capabilities' },
      { href: '/settings/voice', label: 'Voice' },
      { href: '/settings/byok', label: 'API keys' },
    ],
  },
  {
    heading: 'Privacy',
    links: [
      { href: '/settings/privacy', label: 'Privacy & Data' },
      { href: '/settings/memory', label: 'Memory' },
    ],
  },
  {
    heading: 'Notifications',
    links: [{ href: '/settings/notifications', label: 'Notifications' }],
  },
  {
    heading: 'Integrations',
    links: [{ href: '/settings/connections', label: 'Connections' }],
  },
  {
    heading: 'Cloud',
    links: [{ href: '/settings/sync', label: 'Sync' }],
  },
];

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  // WEB-18 (audit 2026-05-19): getUser() re-validates the JWT against the
  // auth server. getSession() only reads cookie state without revalidation
  // and must not be the auth gate.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?next=/settings/general');
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
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-1)',
            padding: '0 16px 16px',
            fontFamily: 'var(--serif)',
          }}
        >
          Settings
        </div>

        {NAV_SECTIONS.map((section) => (
          <div key={section.heading} style={{ marginBottom: 4 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.08em',
                color: 'var(--text-3)',
                padding: '8px 20px 4px',
                textTransform: 'uppercase',
              }}
            >
              {section.heading}
            </div>
            {section.links.map((link) => (
              <SettingsNavActive key={link.href} href={link.href} label={link.label} />
            ))}
          </div>
        ))}
      </nav>

      {/* Content */}
      <main style={{ flex: 1, padding: '48px 40px', maxWidth: 720 }}>{children}</main>
    </div>
  );
}
