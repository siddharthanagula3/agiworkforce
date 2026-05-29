'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { NavItem } from './layout';

interface Props {
  items: NavItem[];
}

export function SettingsNavClient({ items }: Props) {
  const pathname = usePathname();
  const [query, setQuery] = useState('');

  const filtered = query.trim()
    ? items.filter((item) => item.label.toLowerCase().includes(query.toLowerCase()))
    : items;

  return (
    <>
      {/* Search */}
      <div style={{ padding: '0 12px 8px' }}>
        <input
          type="search"
          placeholder="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '6px 10px',
            fontSize: 13,
            color: 'var(--text-1)',
            background: 'var(--bg-hover, rgba(255,255,255,0.06))',
            border: '1px solid var(--settings-border)',
            borderRadius: 'var(--radius-md, 6px)',
            outline: 'none',
          }}
        />
      </div>

      {/* Flat nav list */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {filtered.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'block',
                padding: '6px 20px',
                fontSize: 13,
                color: isActive ? 'var(--text-1)' : 'var(--text-2)',
                textDecoration: 'none',
                borderRadius: 6,
                margin: '1px 8px',
                background: isActive ? 'var(--bg-hover, rgba(255,255,255,0.06))' : 'transparent',
                fontWeight: isActive ? 500 : 400,
                transition: 'background 0.1s, color 0.1s',
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </>
  );
}
