'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUser, useClerk } from '@clerk/nextjs';
import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { AgiMark } from '../agi/AgiMark';

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Render a stable placeholder until mounted to avoid hydration mismatch.
  if (!mounted) {
    return <span className="agi-top-theme-toggle" aria-hidden="true" />;
  }

  const isDark = resolvedTheme === 'dark';
  return (
    <button
      type="button"
      className="agi-top-link agi-top-theme-toggle"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {isDark ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
    </button>
  );
}

/*
 * Site-wide marketing header. Same exports as the previous version so every
 * page that imports `Header` continues to work. Auth wiring uses Clerk
 * (useUser + useClerk from @clerk/nextjs).
 *
 * Adds a "Products" disclosure listing all six surfaces so the suite is
 * one click away from every marketing page. The menu is keyboard-accessible:
 * Escape closes, click-outside closes, aria-expanded reflects state.
 */

const PRODUCT_ITEMS = [
  { href: '/desktop', label: 'AGI Desktop', hint: 'Local + BYOK host' },
  { href: '/mobile', label: 'AGI Mobile', hint: 'Private AI in your pocket' },
  { href: '/cli', label: 'AGI CLI', hint: 'Agent in your terminal' },
  { href: '/chrome-extension', label: 'AGI in Chrome', hint: 'Browser side panel' },
  { href: '/vscode-extension', label: 'AGI in VS Code', hint: 'IDE-native assistance' },
  { href: '/agi-code', label: 'AGI Code', hint: 'The developer stack' },
  { href: '/apps', label: 'Apps & Connectors', hint: 'MCP tools & integrations' },
] as const;

const NAV_ITEMS = [
  { href: '/pricing', key: 'navPricing', fallback: 'Pricing' },
  { href: '/business', key: 'navBusiness', fallback: 'Business' },
  { href: '/docs', key: 'navDocs', fallback: 'Docs' },
] as const;

export function Header({ minimal = false }: { minimal?: boolean } = {}) {
  const { t } = useTranslation('common');
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isProductsOpen, setIsProductsOpen] = useState(false);
  const productsRef = useRef<HTMLDivElement | null>(null);

  const userEmail = isLoaded ? (user?.primaryEmailAddress?.emailAddress ?? null) : null;

  useEffect(() => {
    if (!isProductsOpen) return;

    const onPointerDown = (e: PointerEvent) => {
      if (productsRef.current && !productsRef.current.contains(e.target as Node)) {
        setIsProductsOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsProductsOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isProductsOpen]);

  const handleSignOut = async () => {
    await signOut({ redirectUrl: '/' });
  };

  const handleMobileSignOut = async () => {
    setIsMenuOpen(false);
    await handleSignOut();
  };

  // Minimal chrome for focused auth entry points (/login, /signup): just the
  // wordmark, no nav/products/account links to compete with the sign-in form.
  if (minimal) {
    return (
      <header className="agi-top" style={{ position: 'relative' }}>
        <Link href="/" className="agi-mark" aria-label={t('agiHome')}>
          <AgiMark size={20} />
          <span style={{ marginLeft: 8 }}>AGI</span>
        </Link>
      </header>
    );
  }

  return (
    <header className="agi-top" style={{ position: 'relative' }}>
      <Link href="/" className="agi-mark" aria-label={t('agiHome')}>
        <AgiMark size={20} />
        <span style={{ marginLeft: 8 }}>AGI</span>
      </Link>

      <nav
        id="main-navigation"
        className="agi-top-right"
        aria-label="Primary"
        style={{ display: 'flex', alignItems: 'center', gap: 24 }}
      >
        {/* Desktop nav links */}
        <span
          className="agi-top-nav-desktop"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 24 }}
        >
          <ThemeToggle />
          <div className="agi-top-products" ref={productsRef}>
            <button
              type="button"
              className="agi-top-link agi-top-products-button"
              aria-expanded={isProductsOpen}
              aria-haspopup="true"
              onClick={() => setIsProductsOpen((v) => !v)}
            >
              {t('navProducts', 'Products')}
              <span aria-hidden="true" className="agi-top-products-chevron">
                {isProductsOpen ? '▴' : '▾'}
              </span>
            </button>
            {isProductsOpen && (
              <div className="agi-top-products-menu" role="menu" aria-label="AGI products">
                {PRODUCT_ITEMS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    role="menuitem"
                    className="agi-top-products-item"
                    onClick={() => setIsProductsOpen(false)}
                  >
                    <span className="agi-top-products-label">{item.label}</span>
                    <span className="agi-top-products-hint">{item.hint}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} className="agi-top-link">
              {t(item.key, item.fallback)}
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
            <Link href="/login" className="agi-top-link">
              {t('navSignIn')}
            </Link>
          )}
        </span>

        {/* Mobile menu toggle */}
        <button
          type="button"
          className="agi-top-link agi-top-mobile-toggle"
          aria-label={isMenuOpen ? t('menuClose') : t('menuOpen')}
          aria-expanded={isMenuOpen}
          aria-controls="agi-mobile-menu"
          onClick={() => setIsMenuOpen((v) => !v)}
          style={{ display: 'none' }}
        >
          {isMenuOpen ? '×' : '☰'}
        </button>
      </nav>

      {/* Mobile menu (hidden by default; shown when toggled) */}
      {isMenuOpen && (
        <>
          {/* Backdrop scrim: covers the full viewport behind the mobile nav
              panel so page content can't bleed through, and closes the menu
              when tapped outside the panel. */}
          <div
            className="agi-top-mobile-backdrop"
            aria-hidden="true"
            onClick={() => setIsMenuOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.45)',
              zIndex: 49,
            }}
          />
          <div
            id="agi-mobile-menu"
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
            <span className="agi-top-mobile-group">{t('navProducts', 'Products')}</span>
            {PRODUCT_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="agi-top-link"
                onClick={() => setIsMenuOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="agi-top-link"
                onClick={() => setIsMenuOpen(false)}
              >
                {t(item.key, item.fallback)}
              </Link>
            ))}
            {userEmail ? (
              <>
                <Link href="/chat" className="agi-top-link" onClick={() => setIsMenuOpen(false)}>
                  {t('navChat')}
                </Link>
                <button type="button" onClick={handleMobileSignOut} className="agi-top-link">
                  {t('navSignOut')}
                </button>
              </>
            ) : (
              <Link href="/login" className="agi-top-link" onClick={() => setIsMenuOpen(false)}>
                {t('navSignIn')}
              </Link>
            )}
          </div>
        </>
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
