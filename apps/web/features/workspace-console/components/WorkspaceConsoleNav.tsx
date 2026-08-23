'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ShieldCheck,
  Users,
  Share2,
  KeyRound,
  SlidersHorizontal,
  Boxes,
  PlugZap,
  ScrollText,
  Gavel,
  BarChart3,
  CreditCard,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface ConsoleLink {
  href: string;
  label: string;
  icon: LucideIcon;
  hint: string;
}

/**
 * Grouped by the question an administrator arrives with, not by the service
 * that happens to answer it. "Who is in here", "what may they reach", "what did
 * they do", "what does it cost".
 */
const SECTIONS: { title: string; links: ConsoleLink[] }[] = [
  {
    title: 'Workspace',
    links: [
      {
        href: '/workspace',
        label: 'Overview',
        icon: ShieldCheck,
        hint: 'Security posture and recommendations',
      },
    ],
  },
  {
    title: 'People',
    links: [
      {
        href: '/workspace/people',
        label: 'Members',
        icon: Users,
        hint: 'Roles, invitations, seats',
      },
      {
        href: '/workspace/identity',
        label: 'Identity',
        icon: KeyRound,
        hint: 'SSO, domains, SCIM provisioning',
      },
    ],
  },
  {
    title: 'Controls',
    links: [
      {
        href: '/workspace/policy',
        label: 'Policy',
        icon: SlidersHorizontal,
        hint: 'Privacy modes, managed compute, sync',
      },
      {
        href: '/workspace/models',
        label: 'Models',
        icon: Boxes,
        hint: 'Approved models and providers',
      },
      {
        href: '/workspace/connectors',
        label: 'Connectors',
        icon: PlugZap,
        hint: 'Approved integrations',
      },
      {
        href: '/workspace/sharing',
        label: 'Sharing',
        icon: Share2,
        hint: 'Shared projects and connectors',
      },
    ],
  },
  {
    title: 'Records',
    links: [
      { href: '/workspace/audit', label: 'Audit', icon: ScrollText, hint: 'Trail and export' },
      {
        href: '/workspace/data',
        label: 'Data',
        icon: Gavel,
        hint: 'Legal holds and retention sweeps',
      },
      {
        href: '/workspace/usage',
        label: 'Usage',
        icon: BarChart3,
        hint: 'Spend by member, model, provider',
      },
      {
        href: '/workspace/billing',
        label: 'Billing',
        icon: CreditCard,
        hint: 'Plan, seats, invoices',
      },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/workspace') return pathname === '/workspace';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function WorkspaceConsoleNav() {
  const pathname = usePathname() ?? '/workspace';

  return (
    <nav aria-label="Workspace administration" className="flex flex-col gap-6">
      {SECTIONS.map((section) => (
        <div key={section.title} className="flex flex-col gap-1">
          <p
            className="px-3 pb-1 text-[10px] font-medium uppercase tracking-[0.12em]"
            style={{ color: 'var(--text-3)' }}
          >
            {section.title}
          </p>
          {section.links.map((link) => {
            const active = isActive(pathname, link.href);
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className="flex items-start gap-2.5 rounded-md px-3 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{
                  background: active ? 'var(--bg-hover)' : 'transparent',
                  color: active ? 'var(--text-1)' : 'var(--text-2)',
                }}
              >
                <Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm font-medium leading-tight">{link.label}</span>
                  <span className="text-[11px] leading-snug" style={{ color: 'var(--text-3)' }}>
                    {link.hint}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
