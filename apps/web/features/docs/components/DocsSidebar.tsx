'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search } from 'lucide-react';
import type { DocsNavGroup } from '../lib/docs-nav';

export function DocsSidebar({
  groups,
  onSearch,
}: {
  groups: readonly DocsNavGroup[];
  onSearch: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="Documentation pages">
      <div className="dx-search">
        <button
          type="button"
          className="dx-search-button"
          onClick={onSearch}
          aria-haspopup="dialog"
        >
          <Search aria-hidden="true" />
          <span>Search documentation</span>
        </button>
      </div>
      {groups.map((group) => (
        <div key={group.id} className="dx-nav-group">
          <p className="dx-nav-label">{group.label}</p>
          <ul className="dx-nav-list">
            {group.links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="dx-nav-link"
                  aria-current={pathname === link.href ? 'page' : undefined}
                >
                  {link.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
