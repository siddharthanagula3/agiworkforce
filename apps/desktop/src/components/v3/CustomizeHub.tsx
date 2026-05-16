import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { SkillsView } from './SkillsView';
import { ConnectorsView } from './ConnectorsView';
import { PluginsHub } from './PluginsHub';

type HubTab = 'Skills' | 'Connectors' | 'Plugins';

const TABS: HubTab[] = ['Skills', 'Connectors', 'Plugins'];
const TAB_KEYS: Record<HubTab, string> = {
  Skills: 'customize.tabs.skills',
  Connectors: 'customize.tabs.connectors',
  Plugins: 'customize.tabs.plugins',
};

export interface CustomizeHubProps {
  defaultTab?: HubTab;
  className?: string;
}

export function CustomizeHub({ defaultTab = 'Skills', className }: CustomizeHubProps) {
  const { t } = useTranslation('v3');
  const [tab, setTab] = useState<HubTab>(defaultTab);

  return (
    <div className={cn('flex h-full flex-col bg-[var(--chat-bg,#fcfaf6)]', className)}>
      {/* header */}
      <div className="flex items-center border-b border-[var(--chat-border,#e8e3db)] px-6 pt-5 pb-0">
        <div className="mr-6">
          <h1 className="font-serif text-2xl font-medium text-[var(--chat-text-primary,#1a1a1a)]">
            {t('customize.title')}
          </h1>
          <p className="text-xs text-[var(--chat-text-secondary,#6b6157)] mt-0.5">
            {t('customize.subtitle')}
          </p>
        </div>
        <div className="flex gap-0.5 ml-auto pb-px">
          {TABS.map((tabId) => (
            <button
              key={tabId}
              onClick={() => setTab(tabId)}
              className={cn(
                'relative rounded-t-lg px-4 py-2 text-sm transition-colors',
                tab === tabId
                  ? 'bg-[var(--chat-bg,#fcfaf6)] text-[var(--chat-text-primary,#1a1a1a)] font-medium border border-b-0 border-[var(--chat-border,#e8e3db)]'
                  : 'text-[var(--chat-text-secondary,#6b6157)] hover:text-[var(--chat-text-primary,#1a1a1a)]',
              )}
            >
              {t(TAB_KEYS[tabId])}
            </button>
          ))}
        </div>
      </div>

      {/* tab content */}
      <div className="flex-1 overflow-hidden">
        {tab === 'Skills' && <SkillsView />}
        {tab === 'Connectors' && <ConnectorsView />}
        {tab === 'Plugins' && <PluginsHub />}
      </div>
    </div>
  );
}
