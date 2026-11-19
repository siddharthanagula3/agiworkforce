'use client';

import { useTranslation } from 'react-i18next';
import { SETTINGS_NAV_GROUPS_WEB, type SettingsNavItem } from '@agiworkforce/ui';
import { PageLink } from '@shared/components/layout/EmbeddedPage';
import { settingsSectionPath } from '../lib/web-settings-sections';
import { AccountSection } from '../sections/AccountSection';
import { SecuritySection } from '../sections/SecuritySection';

export const EMBEDDED_ACCOUNT_SECTIONS = ['account', 'security'] as const;

export type EmbeddedAccountSection = (typeof EMBEDDED_ACCOUNT_SECTIONS)[number];

const NAV_ITEMS: readonly SettingsNavItem[] = EMBEDDED_ACCOUNT_SECTIONS.flatMap((key) =>
  SETTINGS_NAV_GROUPS_WEB.flatMap((group) => group.items).filter((item) => item.key === key),
);

const TAB_CLASS =
  'inline-flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring';
const ACTIVE_TAB_CLASS = 'border-foreground text-foreground';
const IDLE_TAB_CLASS = 'border-transparent text-muted-foreground hover:text-foreground';

export function EmbeddedAccountPage({ section }: { section: EmbeddedAccountSection }) {
  const { t } = useTranslation('settings');

  return (
    <main
      id="main-content"
      className="min-h-[100dvh] bg-background px-gutter-compact pb-8 pt-4 text-foreground sm:px-gutter-regular pointer-coarse:[&_select]:min-h-11"
    >
      <div className="mx-auto w-full max-w-[672px]">
        <nav
          aria-label={t('modal.title', 'Settings')}
          className="mb-6 flex gap-1 overflow-x-auto border-b border-border"
        >
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const current = item.key === section;
            return (
              <PageLink
                key={item.key}
                href={settingsSectionPath(item.key as EmbeddedAccountSection)}
                aria-current={current ? 'page' : undefined}
                className={`${TAB_CLASS} ${current ? ACTIVE_TAB_CLASS : IDLE_TAB_CLASS}`}
                omitWhenEmbedded
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {t(`nav.${item.key}`, { defaultValue: item.label })}
              </PageLink>
            );
          })}
        </nav>
        {section === 'account' ? <AccountSection /> : <SecuritySection />}
      </div>
    </main>
  );
}
