import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../services/supabase-server';
import Link from 'next/link';
import type { ReactNode } from 'react';

export const dynamic = 'force-dynamic';

const NAV_LINKS = [
  { href: '/settings/general', label: 'General' },
  { href: '/settings/billing', label: 'Billing' },
  { href: '/settings/voice', label: 'Voice' },
  { href: '/settings/capabilities', label: 'Capabilities' },
];

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect('/login?next=/settings/general');
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-base, #09090b)' }}>
      {/* Settings sidebar */}
      <nav
        style={{
          width: 220,
          flexShrink: 0,
          borderRight: '1px solid var(--border)',
          padding: '48px 0 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.06em',
            color: 'var(--text-3)',
            padding: '0 20px 8px',
            textTransform: 'uppercase',
          }}
        >
          Settings
        </div>
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            style={{
              display: 'block',
              padding: '7px 20px',
              fontSize: 14,
              color: 'var(--text-2)',
              textDecoration: 'none',
              borderRadius: 6,
              margin: '0 8px',
            }}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      {/* Content */}
      <main style={{ flex: 1, padding: '48px 40px', maxWidth: 720 }}>{children}</main>
    </div>
  );
}
