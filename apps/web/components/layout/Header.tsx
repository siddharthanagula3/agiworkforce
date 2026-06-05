'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUser, useClerk } from '@clerk/nextjs';
import { AgiMark } from '../agi/AgiMark';

/*
 * Site-wide marketing header. Same exports as the previous editorial
 * version so every page that imports `Header` continues to work.
 * Auth wiring uses Clerk (useUser + useClerk from @clerk/nextjs).
 */

const NAV_ITEMS = [
  { href: '/business', key: 'navBusiness' },
  { href: '/agi-code', key: 'navAgiCode' },
  { href: '/apps', key: 'navApps' },
  { href: '/pricing', key: 'navPricing' },
  { href: '/compare', key: 'navCompare' },
  { href: '/contact-sales', key: 'navContactSales' },
] as const;

export function Header() {
  const { t } = useTranslation('common');
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const userEmail = isLoaded ? (user?.primaryEmailAddress?.emailAddress ?? null) : null;

  const handleSignOut = async () => {
    await signOut({ redirectUrl: '/' });
  };

  return (
    <header className="agi-top" style={{ position: 'relative' }}>
      <Link href="/" className="agi-mark" aria-label={t('agiHome')}>
        <AgiMark size={20} />
        <span style={{ marginLeft: 8 }}>AGI</span>
      </Link>

      <nav
        className="agi-top-right"
        aria-label="Primary"
        style={{ display: 'flex', alignItems: 'center', gap: 24 }}
      >
        {/* Desktop nav links */}
        <span className="agi-top-nav-desktop" style={{ display: 'inline-flex', gap: 24 }}>
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} className="agi-top-link">
              {t(item.key)}
            </Link>
          ))}
        </span>

        <span className="agi-top-actions-desktop" style={{ display: 'inline-flex', gap: 18 }}>
          {userEmail ? (
            <>
              <Link href="/chat" className="agi-top-link">
                {t('navChat')}
              </Link>
              <button type="button" onClick={handleSignOut} className="agi-top-link">
                {t('navSignOut')}
              </button>
            </>
          ) : (
            <>
              <Link href="/chat" className="agi-top-link">
                Try AGI
              </Link>
              <Link href="/login" className="agi-top-link">
                {t('navSignIn')}
              </Link>
            </>
          )}
          <Link href="/download" className="agi-top-cta">
            {t('navInstall')}
          </Link>
        </span>

        {/* Mobile menu toggle */}
        <button
          type="button"
          className="agi-top-link agi-top-mobile-toggle"
          aria-label={isMenuOpen ? t('menuClose') : t('menuOpen')}
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
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="agi-top-link"
              onClick={() => setIsMenuOpen(false)}
            >
              {t(item.key)}
            </Link>
          ))}
          {userEmail ? (
            <>
              <Link href="/chat" className="agi-top-link" onClick={() => setIsMenuOpen(false)}>
                {t('navChat')}
              </Link>
              <button type="button" onClick={handleSignOut} className="agi-top-link">
                {t('navSignOut')}
              </button>
            </>
          ) : (
            <>
              <Link href="/chat" className="agi-top-link" onClick={() => setIsMenuOpen(false)}>
                Try AGI
              </Link>
              <Link href="/login" className="agi-top-link" onClick={() => setIsMenuOpen(false)}>
                {t('navSignIn')}
              </Link>
            </>
          )}
          <Link href="/download" className="agi-top-cta" onClick={() => setIsMenuOpen(false)}>
            {t('navInstall')}
          </Link>
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
          :global(.agi-top-actions-desktop) {
            display: none !important;
          }
        }
      `}</style>
    </header>
  );
}
