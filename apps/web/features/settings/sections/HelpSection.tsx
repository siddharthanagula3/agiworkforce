'use client';

/**
 * Help settings section.
 *
 * Settings had no Help entry at all, so `/help`, `/status`, and `/changelog`
 * shipped but were unreachable from inside the product — a user looking for
 * "is it down?" or "what changed?" had no path to either.
 *
 * Every destination here is an existing route. Nothing is invented: if a link
 * is added below, the page must already exist.
 */

import {
  BookOpen,
  Bug,
  ExternalLink,
  FileText,
  Keyboard,
  LifeBuoy,
  Scale,
  Signal,
} from 'lucide-react';
import { SettingsPageLink } from '../components/SettingsSectionLink';

interface HelpLink {
  href: string;
  label: string;
  description: string;
  icon: typeof BookOpen;
}

const HELP_LINKS: readonly HelpLink[] = [
  {
    href: '/docs',
    label: 'Documentation',
    description: 'Guides for every surface, from chat to the CLI.',
    icon: BookOpen,
  },
  {
    href: '/help',
    label: 'Help center',
    description: 'Answers to common questions.',
    icon: LifeBuoy,
  },
  {
    href: '/support',
    label: 'Contact support',
    description: 'Reach a person about your account.',
    icon: FileText,
  },
  {
    href: '/support?topic=bug',
    label: 'Report a bug',
    description: 'Tell us what broke and how to reproduce it.',
    icon: Bug,
  },
  {
    href: '/changelog',
    label: 'Release notes',
    description: 'What shipped, and when.',
    icon: FileText,
  },
  {
    href: '/status',
    label: 'System status',
    description: 'Current availability of managed services.',
    icon: Signal,
  },
  {
    href: '/legal',
    label: 'Legal',
    description: 'Terms, privacy policy, and related documents.',
    icon: Scale,
  },
];

export function HelpSection() {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-[var(--text-1)]">Help</h2>
        <p className="mt-1 text-sm text-[var(--text-3)]">
          Documentation, support, and service status.
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {HELP_LINKS.map(({ href, label, description, icon: Icon }) => (
          <li key={href}>
            <SettingsPageLink
              href={href}
              className="flex items-start gap-3 rounded-[var(--radius-lg)] border border-[var(--settings-border)] bg-[var(--bg-elev)] p-3 transition-colors hover:border-[var(--text-3)]"
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-3)]" aria-hidden="true" />
              <span className="flex-1">
                <span className="block text-sm font-medium text-[var(--text-1)]">{label}</span>
                <span className="block text-xs text-[var(--text-3)]">{description}</span>
              </span>
              <ExternalLink
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-3)]"
                aria-hidden="true"
              />
            </SettingsPageLink>
          </li>
        ))}
      </ul>

      <div className="rounded-[var(--radius-lg)] border border-[var(--settings-border)] bg-[var(--bg-elev)] p-3">
        <div className="flex items-center gap-2">
          <Keyboard className="h-4 w-4 text-[var(--text-3)]" aria-hidden="true" />
          <span className="text-sm font-medium text-[var(--text-1)]">Keyboard shortcuts</span>
        </div>
        <p className="mt-1 text-xs text-[var(--text-3)]">
          Press <kbd className="rounded border border-[var(--settings-border)] px-1">?</kbd>{' '}
          anywhere in chat to see the full list.
        </p>
      </div>
    </section>
  );
}
