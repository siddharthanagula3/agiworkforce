'use client';

interface SkipLink {
  href: string;
  label: string;
}

interface SkipLinksProps {
  links?: SkipLink[];
}

const defaultLinks: SkipLink[] = [{ href: '#main-content', label: 'Skip to main content' }];

export function SkipLinks({ links = defaultLinks }: SkipLinksProps) {
  return (
    <div className="sr-only focus-within:not-sr-only">
      <nav aria-label="Skip links" className="fixed top-0 start-0 z-[var(--z-skip-link)] p-2">
        <ul className="flex flex-col gap-2">
          {links.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="inline-block px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background hover:bg-primary/90 transition-colors"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
