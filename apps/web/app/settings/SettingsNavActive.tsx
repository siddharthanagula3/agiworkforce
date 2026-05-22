'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface SettingsNavActiveProps {
  href: string;
  label: string;
}

export function SettingsNavActive({ href, label }: SettingsNavActiveProps) {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <Link
      href={href}
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
      {label}
    </Link>
  );
}
