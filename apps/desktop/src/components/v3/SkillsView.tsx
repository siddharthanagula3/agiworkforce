import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Code2, Edit2, Loader2, Plus, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useSkillMarketplaceStore,
  type MarketplaceSkill,
} from '../../stores/skillMarketplaceStore';

// ── SkillsView ────────────────────────────────────────────────────────────────

export function SkillsView() {
  const { t } = useTranslation('v3');
  const { skills, isLoading, fetchSkills, toggleSkillActive } = useSkillMarketplaceStore();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (skills.length === 0 && !isLoading) {
      fetchSkills();
    }
    // Mount-only fetch. Store fns are stable (Zustand). Including skills.length
    // / isLoading would loop while fetching.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = skills.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()));

  const skill: MarketplaceSkill | undefined =
    filtered.find((s) => s.name === activeId) ?? filtered[0];

  if (isLoading && skills.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-[var(--chat-text-tertiary,#9e9488)]">
        <Loader2 size={18} className="animate-spin mr-2" />
        <span className="text-sm">{t('skills.loading')}</span>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* left pane */}
      <aside className="flex w-[220px] shrink-0 flex-col border-r border-[var(--chat-border,#e8e3db)] overflow-hidden">
        <div className="flex items-center gap-1.5 border-b border-[var(--chat-border,#e8e3db)] px-3 py-2 text-xs text-[var(--chat-text-secondary,#6b6157)]">
          <Search size={11} className="shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('skills.searchPlaceholder')}
            className="flex-1 bg-transparent outline-none placeholder:text-[var(--chat-text-tertiary,#9e9488)]"
          />
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <p className="px-3 py-4 text-xs text-[var(--chat-text-tertiary,#9e9488)]">
              {t('skills.noneFound')}
            </p>
          ) : (
            filtered.map((s) => (
              <button
                key={s.name}
                onClick={() => setActiveId(s.name)}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors',
                  skill?.name === s.name
                    ? 'bg-[var(--chat-bg-soft,#f5f0e8)]'
                    : 'hover:bg-[var(--chat-bg-soft,#f5f0e8)]',
                )}
              >
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-sm bg-[var(--chat-teal,#21808d)]/10 text-[var(--chat-teal,#21808d)]">
                  {s.name.charAt(0).toUpperCase()}
                </div>
                <span className="truncate text-xs text-[var(--chat-text-primary,#1a1a1a)]">
                  {s.name}
                </span>
              </button>
            ))
          )}
        </div>
        <div className="border-t border-[var(--chat-border,#e8e3db)] p-3">
          <button className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-[var(--chat-text-secondary,#6b6157)] hover:bg-[var(--chat-bg-soft,#f5f0e8)] hover:text-[var(--chat-text-primary,#1a1a1a)] transition-colors">
            <Plus size={12} />
            {t('skills.addSkill')}
          </button>
        </div>
      </aside>

      {/* center pane */}
      {skill ? (
        <section className="flex-1 overflow-y-auto px-6 py-5">
          <div className="text-[10px] text-[var(--chat-text-tertiary,#9e9488)] mb-3 uppercase tracking-wider">
            {t('skills.breadcrumb', { name: skill.name })}
          </div>
          <h1 className="font-serif text-2xl font-medium text-[var(--chat-text-primary,#1a1a1a)] mb-1">
            {skill.name}
          </h1>
          <p className="text-sm text-[var(--chat-text-secondary,#6b6157)] mb-4 leading-relaxed">
            {skill.description}
          </p>

          <div className="rounded-lg border border-[var(--chat-border,#e8e3db)] bg-[var(--chat-bg-soft,#f5f0e8)] p-3 mb-5 font-mono text-xs">
            {(
              [
                ['name', skill.name],
                ['description', skill.description],
                ['source', skill.sourceType],
                ['context_mode', skill.contextMode],
              ] as [string, string][]
            ).map(([k, v]) => (
              <div key={k} className="flex gap-3 py-0.5">
                <span className="w-28 shrink-0 text-[var(--chat-text-tertiary,#9e9488)]">{k}</span>
                <span className="text-[var(--chat-text-primary,#1a1a1a)] break-all">{v}</span>
              </div>
            ))}
          </div>

          {skill.allowedTools.length > 0 && (
            <div className="prose prose-sm max-w-none text-[var(--chat-text-primary,#1a1a1a)] mb-4">
              <h2 className="font-serif text-base font-medium mt-0 mb-2">
                {t('skills.allowedTools')}
              </h2>
              <ul className="mb-4 pl-4 space-y-1">
                {skill.allowedTools.map((t) => (
                  <li key={t} className="text-sm text-[var(--chat-text-secondary,#6b6157)]">
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(skill.requiresBins.length > 0 || skill.requiresEnv.length > 0) && (
            <div className="prose prose-sm max-w-none text-[var(--chat-text-primary,#1a1a1a)]">
              <h2 className="font-serif text-base font-medium mb-2">{t('skills.requirements')}</h2>
              {skill.requiresBins.length > 0 && (
                <p className="text-xs text-[var(--chat-text-secondary,#6b6157)] mb-1">
                  <span className="font-medium">{t('skills.binaries')}</span>{' '}
                  {skill.requiresBins.join(', ')}
                </p>
              )}
              {skill.requiresEnv.length > 0 && (
                <p className="text-xs text-[var(--chat-text-secondary,#6b6157)]">
                  <span className="font-medium">{t('skills.envVars')}</span>{' '}
                  {skill.requiresEnv.join(', ')}
                </p>
              )}
            </div>
          )}
        </section>
      ) : (
        <section className="flex-1 flex items-center justify-center text-[var(--chat-text-tertiary,#9e9488)] text-sm">
          {t('skills.noneInstalled')}
        </section>
      )}

      {/* right pane */}
      {skill && (
        <aside className="w-[280px] shrink-0 border-l border-[var(--chat-border,#e8e3db)] overflow-y-auto px-4 py-5">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--chat-text-tertiary,#9e9488)] mb-2">
            {t('skills.supportedOs')}
          </h4>
          <div className="flex flex-wrap gap-1.5 mb-5">
            {skill.supportedOs.length > 0 ? (
              skill.supportedOs.map((os) => (
                <span
                  key={os}
                  className="rounded-full border border-[var(--chat-border,#e8e3db)] bg-[var(--chat-bg-soft,#f5f0e8)] px-2.5 py-1 text-[11px] text-[var(--chat-text-secondary,#6b6157)]"
                >
                  {os}
                </span>
              ))
            ) : (
              <span className="text-[11px] text-[var(--chat-text-tertiary,#9e9488)]">
                {t('skills.allOs')}
              </span>
            )}
          </div>

          <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--chat-text-tertiary,#9e9488)] mb-2">
            {t('skills.category')}
          </h4>
          <div className="mb-5">
            <span className="rounded-full border border-[var(--chat-border,#e8e3db)] bg-[var(--chat-bg-soft,#f5f0e8)] px-2.5 py-1 text-[11px] text-[var(--chat-text-secondary,#6b6157)] capitalize">
              {skill.category}
            </span>
          </div>

          <div className="flex flex-col gap-2">
            <button className="flex items-center justify-center gap-1.5 rounded-lg border border-[var(--chat-border,#e8e3db)] bg-[var(--chat-bg,#fcfaf6)] px-3 py-2 text-xs text-[var(--chat-text-primary,#1a1a1a)] hover:bg-[var(--chat-bg-soft,#f5f0e8)] transition-colors">
              <Edit2 size={11} />
              {t('skills.edit')}
            </button>
            <button className="flex items-center justify-center gap-1.5 rounded-lg border border-[var(--chat-border,#e8e3db)] bg-[var(--chat-bg,#fcfaf6)] px-3 py-2 text-xs text-[var(--chat-text-primary,#1a1a1a)] hover:bg-[var(--chat-bg-soft,#f5f0e8)] transition-colors">
              <Code2 size={11} />
              {t('skills.viewSource')}
            </button>
            <button
              onClick={() => toggleSkillActive(skill.name)}
              className={cn(
                'flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs transition-colors',
                skill.isActive
                  ? 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
              )}
            >
              <X size={11} />
              {skill.isActive ? t('skills.disableSkill') : t('skills.enableSkill')}
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}
