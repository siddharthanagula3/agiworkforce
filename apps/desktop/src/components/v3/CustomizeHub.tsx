import { useState } from 'react';
import { cn } from '@/lib/utils';
import { SkillsView } from './SkillsView';
import { ConnectorsView } from './ConnectorsView';
import { PluginsHub } from './PluginsHub';

type HubTab = 'Skills' | 'Connectors' | 'Plugins';

const TABS: HubTab[] = ['Skills', 'Connectors', 'Plugins'];

export interface CustomizeHubProps {
  defaultTab?: HubTab;
  className?: string;
}

export function CustomizeHub({ defaultTab = 'Skills', className }: CustomizeHubProps) {
  const [tab, setTab] = useState<HubTab>(defaultTab);

  return (
    <div className={cn('flex h-full flex-col bg-[var(--chat-bg,#fcfaf6)]', className)}>
      {/* header */}
      <div className="flex items-center border-b border-[var(--chat-border,#e8e3db)] px-6 pt-5 pb-0">
        <div className="mr-6">
          <h1 className="font-serif text-2xl font-medium text-[var(--chat-text-primary,#1a1a1a)]">
            Customize
          </h1>
          <p className="text-xs text-[var(--chat-text-secondary,#6b6157)] mt-0.5">
            Skills, connectors, and plugins extend what AGI can do.
          </p>
        </div>
        <div className="flex gap-0.5 ml-auto pb-px">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'relative rounded-t-lg px-4 py-2 text-sm transition-colors',
                tab === t
                  ? 'bg-[var(--chat-bg,#fcfaf6)] text-[var(--chat-text-primary,#1a1a1a)] font-medium border border-b-0 border-[var(--chat-border,#e8e3db)]'
                  : 'text-[var(--chat-text-secondary,#6b6157)] hover:text-[var(--chat-text-primary,#1a1a1a)]',
              )}
            >
              {t}
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
