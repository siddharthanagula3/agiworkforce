'use client';

import Link from 'next/link';
import { Menu } from 'lucide-react';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@agiworkforce/ui';
import { CHAT_ROOT_HREF, HEADER_LINKS, WEB_ENTRY_HREF } from './nav';

const ICON_SIZE = 20;
const SIGN_IN_HREF = '/login';

export function MarketingMobileNav({ signedIn = false }: { signedIn?: boolean } = {}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button type="button" className="agi-ds-menu-trigger" aria-label="Menu">
          <Menu size={ICON_SIZE} aria-hidden="true" />
        </button>
      </SheetTrigger>
      <SheetContent
        side="right"
        data-design="agi"
        className="agi-ds-mobile-nav agi-modal-scope"
        aria-describedby={undefined}
      >
        <SheetTitle className="agi-ds-mobile-nav-title">Menu</SheetTitle>
        <nav className="agi-ds-mobile-nav-body" aria-label="Site">
          <ul className="agi-ds-mobile-nav-list">
            {HEADER_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="agi-ds-mobile-nav-link">
                  {link.label}
                </Link>
              </li>
            ))}
            {!signedIn && (
              <li>
                <Link href={SIGN_IN_HREF} className="agi-ds-mobile-nav-link">
                  Sign in
                </Link>
              </li>
            )}
          </ul>
          <Link
            href={signedIn ? CHAT_ROOT_HREF : WEB_ENTRY_HREF}
            className="agi-ds-btn"
            data-variant="primary"
          >
            {signedIn ? 'Open AGI' : 'Try AGI Web'}
          </Link>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
