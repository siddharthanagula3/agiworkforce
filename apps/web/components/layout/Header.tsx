'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getSupabaseClient } from '../../services/supabase';
import { AgiMark } from '../agi/AgiMark';

/*
 * Site-wide marketing header. Same exports as the previous editorial
 * version so every page that imports `Header` continues to work — only
 * the rendered output changes. Auth wiring (Supabase session) preserved.
 */

const NAV = [
  { href: '/providers', label: 'Providers' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/compare', label: 'Compare' },
  { href: '/about', label: 'About' },
];

export function Header() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function getUser() {
      const supabase = getSupabaseClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (mounted) {
        setUserEmail(session?.user?.email ?? null);
      }
    }
    getUser();
    return () => {
      mounted = false;
    };
  }, []);

  const handleSignOut = async () => {
    const supabase = getSupabaseClient();
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  return (
    <div data-design="agi" className="agi-chrome-band">
      <header
        className="agi-top"
        style={{ position: 'relative', maxWidth: 1180, margin: '0 auto', padding: '22px 28px' }}
      >
        <Link href="/" className="agi-mark" aria-label="AGI Workforce home">
          <AgiMark size={20} />
          <span style={{ marginLeft: 8 }}>
            agi<span className="agi-mark-dot">.</span>workforce
          </span>
        </Link>

        <nav
          className="agi-top-right"
          aria-label="Primary"
          style={{ display: 'flex', alignItems: 'center', gap: 24 }}
        >
          {/* Desktop nav links */}
          <span className="agi-top-nav-desktop" style={{ display: 'inline-flex', gap: 24 }}>
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="agi-top-link">
                {item.label}
              </Link>
            ))}
          </span>

          {userEmail ? (
            <>
              <Link href="/chat" className="agi-top-link">
                Chat
              </Link>
              <button type="button" onClick={handleSignOut} className="agi-top-link">
                Sign out
              </button>
            </>
          ) : (
            <Link href="/login" className="agi-top-link">
              Sign in
            </Link>
          )}
          <Link href="/download" className="agi-top-cta">
            Install
          </Link>

          {/* Mobile menu toggle */}
          <button
            type="button"
            className="agi-top-link agi-top-mobile-toggle"
            aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={isMenuOpen}
            onClick={() => setIsMenuOpen((v) => !v)}
            style={{ display: 'none' }}
          >
            {isMenuOpen ? '×' : '☰'}
          </button>
        </nav>

        {/* Mobile menu (hidden by default; shown when toggled) */}
        {isMenuOpen && (
          <div
            className="agi-top-mobile-menu"
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              background: 'var(--agi-bg-2)',
              borderTop: '1px solid var(--agi-rule)',
              padding: '16px 28px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              zIndex: 50,
            }}
          >
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="agi-top-link"
                onClick={() => setIsMenuOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </div>
        )}

        <style jsx>{`
          @media (max-width: 760px) {
            :global(.agi-top-nav-desktop) {
              display: none !important;
            }
            :global(.agi-top-mobile-toggle) {
              display: inline-flex !important;
            }
          }
        `}</style>
      </header>
    </div>
  );
}
