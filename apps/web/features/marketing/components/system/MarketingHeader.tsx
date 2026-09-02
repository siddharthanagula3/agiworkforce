import Link from 'next/link';
import { AgiMark } from '@shared/components/agi/AgiMark';
import { Button } from './Button';
import { ThemeToggle } from './ThemeToggle';
import { Container } from './Container';
import { HEADER_LINKS, WEB_ENTRY_HREF } from './nav';

const MARK_SIZE = 18;

export function MarketingHeader() {
  return (
    <header className="agi-ds-header">
      <Container>
        <div className="agi-ds-header-row">
          <Link href="/" className="agi-ds-wordmark">
            <AgiMark size={MARK_SIZE} />
            <span>AGI</span>
          </Link>
          <nav className="agi-ds-nav" aria-label="Primary">
            {HEADER_LINKS.map((link) => (
              <Link href={link.href} className="agi-ds-navlink" key={link.href}>
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="agi-ds-header-end">
            <ThemeToggle />
            <Link href="/login" className="agi-ds-navlink">
              Sign in
            </Link>
            <Button href={WEB_ENTRY_HREF}>Try AGI Web</Button>
          </div>
        </div>
      </Container>
    </header>
  );
}
