'use client';

import Link from 'next/link';
import { Menu } from 'lucide-react';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@agiworkforce/ui';
import { CHAT_ROOT_HREF, CONTACT_SALES_HREF, NAV_GROUPS, WEB_ENTRY_HREF } from './nav';

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
            {NAV_GROUPS.map((group) => (
              <li className="agi-ds-mobile-nav-group" key={group.label}>
                <span className="agi-ds-mobile-nav-heading">{group.label}</span>
                <ul className="agi-ds-mobile-nav-sublist">
                  {group.items.map((item) => (
                    <li key={item.href}>
                      <Link href={item.href} className="agi-ds-mobile-nav-link">
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
            <li>
              <Link href="/pricing" className="agi-ds-mobile-nav-link">
                Pricing
              </Link>
            </li>
            <li>
              <Link href={CONTACT_SALES_HREF} className="agi-ds-mobile-nav-link">
                Contact sales
              </Link>
            </li>
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
