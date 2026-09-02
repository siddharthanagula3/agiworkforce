'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUser, useClerk } from '@clerk/nextjs';
import { X } from 'lucide-react';
import { useMenuKeyboard } from '@agiworkforce/ui';
import { AgiMark } from '../agi/AgiMark';
import { ThemeToggle } from '@/features/marketing/components/system/ThemeToggle';
import { SURFACE_STATUS } from '@/lib/marketing-constants';
import { useAuthStore } from '@shared/stores/authentication-store';

/*
 * Site-wide marketing header. Same exports as the previous version so every
 * page that imports `Header` continues to work. Auth wiring uses Clerk
 * (useUser + useClerk from @clerk/nextjs).
 *
 * "Editorial Terminal" shell: sticky glass bar, mono nav labels, a keyboard-
 * accessible Products disclosure, and a right-side slide-in drawer on mobile.
 * The menu is keyboard-accessible: Escape closes, click-outside closes,
 * aria-expanded reflects state.
 */

/**
 * Product hints come from `SURFACE_STATUS`, which is sourced from release tags.
 *
 * These were hardcoded to `COMING_SOON_LABEL` for all five surfaces. Desktop
 * (tag `v-desktop-1.2.0`) and the CLI (tag `v-cli-1.0.0`) have shipped, so the
 * nav was calling two released products "Coming soon" on every page of the
 * site — and it sits on the same screen as the home page's availability strip,
 * which now states their real status. Two different answers to "can I install
 * this?" in one viewport is worse than either answer alone, so both read from
 * the same constant.
 */
const PRODUCT_ITEMS = [
  { href: '/desktop', label: 'AGI Desktop', hint: SURFACE_STATUS.desktop },
  { href: '/mobile', label: 'AGI Mobile', hint: SURFACE_STATUS.mobile },
  { href: '/cli', label: 'AGI CLI', hint: SURFACE_STATUS.cli },
  { href: '/chrome-extension', label: 'AGI in Chrome', hint: SURFACE_STATUS.chrome },
  { href: '/vscode-extension', label: 'AGI in VS Code', hint: SURFACE_STATUS.vscode },
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
  const productsButtonRef = useRef<HTMLButtonElement | null>(null);
  const productsMenuRef = useRef<HTMLDivElement | null>(null);
  const mobileMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);
  const mobileMenuCloseRef = useRef<HTMLButtonElement | null>(null);

  const userEmail = isLoaded ? (user?.primaryEmailAddress?.emailAddress ?? null) : null;

  const closeMobileMenu = useCallback((restoreFocus = false) => {
    setIsMenuOpen(false);
    if (restoreFocus) {
      window.setTimeout(() => mobileMenuButtonRef.current?.focus(), 0);
    }
  }, []);

  useEffect(() => {
    if (!isProductsOpen) return;

    const onPointerDown = (e: PointerEvent) => {
      if (productsRef.current && !productsRef.current.contains(e.target as Node)) {
        setIsProductsOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [isProductsOpen]);

  const closeProducts = useCallback(() => setIsProductsOpen(false), []);

  // Arrow-key roving focus, Escape, and focus-return to the trigger — the
  // outside-pointerdown close above stays separate since the hook only owns
  // keyboard behaviour.
  useMenuKeyboard({
    open: isProductsOpen,
    onClose: closeProducts,
    panelRef: productsMenuRef,
    triggerRef: productsButtonRef,
  });

  // Lock body scroll, keep keyboard focus inside the modal drawer, and return
  // focus to the control that opened it when the user dismisses the drawer.
  useEffect(() => {
    if (!isMenuOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    mobileMenuCloseRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMobileMenu(true);
        return;
      }
      if (e.key !== 'Tab' || !mobileMenuRef.current) return;

      const focusable = Array.from(
        mobileMenuRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute('hidden'));
      if (focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [closeMobileMenu, isMenuOpen]);

  // Clerk's signOut alone leaves this browser holding the previous account's
  // app-owned local/session storage; the store's logout purges it first, exactly
  // as WebAppShell does. Skipping it leaks one user's styles and instructions
  // into whoever signs in next on the same machine.
  const handleSignOut = async () => {
    await useAuthStore.getState().logout();
    await signOut({ redirectUrl: '/' });
  };

  const handleMobileSignOut = async () => {
    closeMobileMenu();
    await handleSignOut();
  };

  // Minimal chrome for focused auth entry points (/login, /signup): just the
  // wordmark, no nav/products/account links to compete with the sign-in form.
  if (minimal) {
    return (
      <header className="agi-top agi-top--minimal">
        <Link href="/" className="agi-mark" aria-label={t('agiHome')}>
          <AgiMark size={20} />
          <span className="agi-mark-word">AGI</span>
        </Link>
      </header>
    );
  }

  return (
    <>
      <header className="agi-top">
        <Link href="/" className="agi-mark" aria-label={t('agiHome')}>
          <AgiMark size={20} />
          <span className="agi-mark-word">AGI</span>
        </Link>

        <nav id="main-navigation" className="agi-top-right" aria-label="Primary">
          {/* Desktop nav links */}
          <span className="agi-top-nav-desktop">
            <div className="agi-top-products" ref={productsRef}>
              <button
                ref={productsButtonRef}
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
                <div
                  ref={productsMenuRef}
                  className="agi-top-products-menu"
                  role="menu"
                  aria-label="AGI products"
                >
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

          <span className="agi-top-actions-desktop">
            <ThemeToggle className="agi-top-theme-toggle" interactiveClassName="agi-top-link" />
            <span className="agi-top-divider" aria-hidden="true" />
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
                <Link href="/login" className="agi-top-link">
                  {t('navSignIn')}
                </Link>
                <Link href="/login?redirectTo=%2F" className="agi-top-cta">
                  {t('navChat', 'Open AGI')}
                </Link>
              </>
            )}
          </span>

          {/* Visible only below the 900px breakpoint, where the desktop action
              row collapses; the full action set stays inside the drawer. */}
          <span className="agi-top-cta-compact">
            {userEmail ? (
              <Link href="/chat" className="agi-top-cta">
                {t('navChat')}
              </Link>
            ) : (
              <Link href="/login?redirectTo=%2F" className="agi-top-cta">
                {t('navChat', 'Open AGI')}
              </Link>
            )}
          </span>

          {/* Mobile menu toggle */}
          <span className="agi-top-mobile-controls">
            <ThemeToggle
              className="agi-top-theme-toggle agi-top-theme-toggle--mobile"
              interactiveClassName="agi-top-link"
            />
            <button
              ref={mobileMenuButtonRef}
              type="button"
              className="agi-top-link agi-top-mobile-toggle"
              aria-label={isMenuOpen ? t('menuClose') : t('menuOpen')}
              aria-expanded={isMenuOpen}
              aria-controls="agi-mobile-menu"
              onClick={() => setIsMenuOpen((v) => !v)}
            >
              <span className={`agi-burger${isMenuOpen ? ' is-open' : ''}`} aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </button>
          </span>
        </nav>
      </header>

      {/* Mobile drawer — rendered as a sibling of the (backdrop-filtered)
          header so the fixed layer is positioned to the viewport, not trapped
          inside the header's containing block. */}
      {isMenuOpen && (
        <div className="agi-top-mobile-layer">
          <button
            type="button"
            className="agi-top-mobile-backdrop"
            aria-label="Dismiss navigation"
            tabIndex={-1}
            onClick={() => closeMobileMenu(true)}
          />
          <div
            ref={mobileMenuRef}
            id="agi-mobile-menu"
            className="agi-top-mobile-menu"
            role="dialog"
            aria-modal="true"
            aria-label={t('navProducts', 'Navigation')}
          >
            <div className="agi-top-mobile-header">
              <span className="agi-top-mobile-group">{t('navProducts', 'Products')}</span>
              <button
                ref={mobileMenuCloseRef}
                type="button"
                className="agi-top-mobile-close"
                aria-label={t('menuClose')}
                onClick={() => closeMobileMenu(true)}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="agi-top-mobile-products">
              {PRODUCT_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="agi-top-mobile-product"
                  onClick={() => closeMobileMenu()}
                >
                  <span className="agi-top-products-label">{item.label}</span>
                  <span className="agi-top-products-hint">{item.hint}</span>
                </Link>
              ))}
            </div>
            <span className="agi-top-mobile-group">Explore</span>
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="agi-top-link agi-top-mobile-link"
                onClick={() => closeMobileMenu()}
              >
                {t(item.key, item.fallback)}
              </Link>
            ))}
            <div className="agi-top-mobile-actions">
              {userEmail ? (
                <>
                  <Link
                    href="/chat"
                    className="agi-top-cta agi-top-cta--block"
                    onClick={() => closeMobileMenu()}
                  >
                    {t('navChat')}
                  </Link>
                  <button
                    type="button"
                    onClick={handleMobileSignOut}
                    className="agi-top-link agi-top-mobile-link"
                  >
                    {t('navSignOut')}
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/login?redirectTo=%2F"
                    className="agi-top-cta agi-top-cta--block"
                    onClick={() => closeMobileMenu()}
                  >
                    {t('navChat', 'Open AGI')}
                  </Link>
                  <Link
                    href="/login"
                    className="agi-top-link agi-top-mobile-link"
                    onClick={() => closeMobileMenu()}
                  >
                    {t('navSignIn')}
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
