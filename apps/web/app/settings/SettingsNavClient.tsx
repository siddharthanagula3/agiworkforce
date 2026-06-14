'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Settings2,
  CreditCard,
  UserRound,
  Shield,
  Server,
  Wallet,
  BarChart3,
  Sparkles,
  BookOpen,
  Plug,
  Brain,
  Bell,
  Mic,
  type LucideIcon,
} from 'lucide-react';
import type { NavItem } from './layout';

interface NavEntry {
  href: string;
  label: string;
  icon: LucideIcon;
}

/**
 * Grouped, icon'd settings nav — mirrors the desktop SettingsPanel's grouped
 * navigation (top group + Tools + device groups) so the web settings read the
 * same as the desktop modal. Icons match the desktop nav choices.
 */
const NAV_GROUPS: { label?: string; items: NavEntry[] }[] = [
  {
    items: [
      { href: '/settings/general', label: 'General', icon: Settings2 },
      { href: '/settings/account', label: 'Account', icon: CreditCard },
      { href: '/settings/profile', label: 'Personalization', icon: UserRound },
      { href: '/settings/privacy', label: 'Privacy', icon: Shield },
      { href: '/settings/byok', label: 'Models & Keys', icon: Server },
    ],
  },
  {
    label: 'Billing & usage',
    items: [
      { href: '/settings/billing', label: 'Billing', icon: Wallet },
      { href: '/settings/usage', label: 'Usage', icon: BarChart3 },
      { href: '/settings/capabilities', label: 'Capabilities', icon: Sparkles },
    ],
  },
  {
    label: 'Tools',
    items: [
      { href: '/settings/skills', label: 'Skills', icon: BookOpen },
      { href: '/settings/connections', label: 'Connectors', icon: Plug },
      { href: '/settings/memory', label: 'Memory', icon: Brain },
    ],
  },
  {
    label: 'Notifications & voice',
    items: [
      { href: '/settings/notifications', label: 'Notifications', icon: Bell },
      { href: '/settings/voice', label: 'Voice', icon: Mic },
    ],
  },
];

const ALL_ENTRIES: NavEntry[] = NAV_GROUPS.flatMap((g) => g.items);

interface Props {
  /** Legacy flat items; ignored in favour of the grouped structure above. */
  items?: NavItem[];
}

export function SettingsNavClient(_props: Props) {
  const pathname = usePathname();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  function renderEntry(item: NavEntry) {
    const isActive = pathname === item.href;
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '7px 12px',
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
        <Icon size={15} strokeWidth={1.75} style={{ flexShrink: 0, opacity: isActive ? 1 : 0.7 }} />
        <span>{item.label}</span>
      </Link>
    );
  }

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

      {q ? (
        // Flat filtered list while searching.
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {ALL_ENTRIES.filter((e) => e.label.toLowerCase().includes(q)).map(renderEntry)}
        </div>
      ) : (
        // Grouped nav (desktop parity) when not searching.
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {NAV_GROUPS.map((group, gi) => (
            <div
              key={group.label ?? `group-${gi}`}
              style={{ display: 'flex', flexDirection: 'column' }}
            >
              {group.label && (
                <div
                  style={{
                    padding: '10px 20px 4px',
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: 'var(--text-3, var(--text-2))',
                  }}
                >
                  {group.label}
                </div>
              )}
              {group.items.map(renderEntry)}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
