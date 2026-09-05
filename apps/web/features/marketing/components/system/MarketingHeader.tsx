import Link from 'next/link';
import { AgiMark } from '@shared/components/agi/AgiMark';
import './system.css';
import { Button } from './Button';
import { MarketingMobileNav } from './MarketingMobileNav';
import { ThemeToggle } from './ThemeToggle';
import { Container } from './Container';
import { NavGroup } from './NavGroup';
import { CHAT_ROOT_HREF, CONTACT_SALES_HREF, NAV_GROUPS, WEB_ENTRY_HREF } from './nav';

const MARK_SIZE = 18;

export function MarketingHeader({
  minimal = false,
  signedIn = false,
}: {
  minimal?: boolean;
  signedIn?: boolean;
} = {}) {
  const wordmark = (
    <Link href="/" className="agi-ds-wordmark">
      <AgiMark size={MARK_SIZE} />
      <span>AGI</span>
    </Link>
  );

  if (minimal) {
    return (
      <header className="agi-ds-header">
        <Container>
          <div className="agi-ds-header-row">
            {wordmark}
            <div className="agi-ds-header-end">
              <ThemeToggle />
            </div>
          </div>
        </Container>
      </header>
    );
  }

  return (
    <header className="agi-ds-header">
      <Container>
        <div className="agi-ds-header-row">
          {wordmark}
          <nav className="agi-ds-nav" aria-label="Primary">
            {NAV_GROUPS.map((group) => (
              <NavGroup group={group} key={group.label} />
            ))}
            <Link href="/pricing" className="agi-ds-navlink">
              Pricing
            </Link>
          </nav>
          <div className="agi-ds-header-end">
            <ThemeToggle />
            <Link href={CONTACT_SALES_HREF} className="agi-ds-navlink agi-ds-navlink--quiet">
              Contact sales
            </Link>
            {signedIn ? (
              <Button href={CHAT_ROOT_HREF}>Open AGI</Button>
            ) : (
              <>
                <Link href="/login" className="agi-ds-navlink">
                  Sign in
                </Link>
                <Button href={WEB_ENTRY_HREF}>Try AGI Web</Button>
              </>
            )}
            <MarketingMobileNav signedIn={signedIn} />
          </div>
        </div>
      </Container>
    </header>
  );
}
