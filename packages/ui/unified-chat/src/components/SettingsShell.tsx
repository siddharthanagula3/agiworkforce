import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../lib/utils';
import { useUIStore } from '../stores/uiStore';
import { MemoryEditor } from './MemoryEditor';

/**
 * SettingsShell — the canonical shared settings dialog for AGI Workforce
 * consumers that don't ship their own (web, extensions, mobile-web preview,
 * future light surfaces). Desktop has its own `settingsDialogStore` + dialog
 * and does NOT mount this component — see `apps/desktop/src/stores/settings`.
 *
 * Round-2 audit P0 #6 (2026-05-21): every host previously reimplemented its
 * own settings UI, leading to visual drift + double-spend on every change.
 * This shell centralizes the IA (left-nav sections + right pane) so all
 * future settings work flows through one component; hosts only customize
 * the content of individual sections.
 *
 * Design parity reference: Claude desktop's grouped settings modal
 * (`~/Desktop/reference/ui/desktop/claude/07_*` … `19_*` settings tour).
 *
 * v1 LOCAL-ONLY POSTURE — section defaults preserve our three trust modes:
 *  - **Local Mode** is the default surface: every section that lists
 *    providers/keys flags items as "local-only" until cloud unlocks.
 *  - **BYOK** sections show "Add your own key" affordances when relevant.
 *  - **Cloud Managed** sections render a waitlist callout (gated by
 *    `cloudManagedEnabled`) until the waitlist opens.
 *
 * Host apps can override or extend the default section list via the
 * `sections` prop; passing `sections={[]}` is a no-op (renders nothing).
 */

export interface SettingsSection {
  /** Stable id, also used as the `settingsTab` key in `uiStore`. */
  id: string;
  /** Display label in the left nav. */
  label: string;
  /** Optional icon node (typically a Lucide icon). */
  icon?: ReactNode;
  /**
   * Right-pane renderer for this section. When omitted, a placeholder is
   * shown so the section is still navigable while content is being built.
   */
  render?: () => ReactNode;
  /** Hide from the left-nav (still routable via `settingsTab`). */
  hidden?: boolean;
}

/**
 * Built-in default sections. Host apps can override by passing their own
 * `sections` array; they can also append additional sections by spreading
 * `DEFAULT_SETTINGS_SECTIONS` plus their own.
 */
export const DEFAULT_SETTINGS_SECTIONS: ReadonlyArray<SettingsSection> = [
  {
    id: 'profile',
    label: 'Profile',
    render: () => (
      <SectionPlaceholder
        title="Profile"
        body="Manage your display name and avatar. Local profiles stay on this device; cloud profile sync is gated until account sync is proven."
      />
    ),
  },
  {
    id: 'capabilities',
    label: 'Capabilities',
    render: () => (
      <SectionPlaceholder
        title="Capabilities"
        body="Toggle features per Local Mode / BYOK / Cloud Managed. Web search, computer use, and artifacts are surfaced here so you can disable them per trust mode."
      />
    ),
  },
  {
    id: 'memory',
    label: 'Memory',
    render: () => <MemoryEditor />,
  },
  {
    id: 'connectors',
    label: 'Connectors',
    render: () => (
      <SectionPlaceholder
        title="Connectors"
        body="MCP servers, OAuth integrations, and local data sources. Cloud connectors are available in managed cloud (public alpha)."
      />
    ),
  },
  {
    id: 'permissions',
    label: 'Permissions',
    render: () => (
      <SectionPlaceholder
        title="Permissions"
        body="Per-tool permission decisions (Ask / Accept edits / Plan / Auto / Bypass) and per-origin allowlists. Mirrors the cross-surface PrivacyMode contract from @agiworkforce/types."
      />
    ),
  },
  {
    id: 'appearance',
    label: 'Appearance',
    render: () => (
      <SectionPlaceholder
        title="Appearance"
        body="Theme (Dawn / Dusk / Match system), density, and accent color. Persisted via the unified-chat ui store."
      />
    ),
  },
  {
    id: 'speech',
    label: 'Speech',
    render: () => (
      <SectionPlaceholder
        title="Speech"
        body="Voice input language and dictation behavior. Local-mode voice runs entirely on-device; managed-cloud voice adds higher-quality models."
      />
    ),
  },
];

export interface SettingsShellProps {
  /**
   * Optional override of the section list. If omitted, the
   * `DEFAULT_SETTINGS_SECTIONS` are used. To extend rather than replace,
   * spread the defaults: `sections={[...DEFAULT_SETTINGS_SECTIONS, mySection]}`.
   */
  sections?: ReadonlyArray<SettingsSection>;
  /**
   * Called whenever the user navigates between sections. Useful for analytics
   * or for hosts that mirror the active section into their own URL.
   */
  onSectionChange?: (sectionId: string) => void;
  /**
   * When true, dispatches a `chat:action { type: 'open-settings' }`
   * CustomEvent and immediately closes the dialog — preserves the old
   * SettingsModal behavior for hosts that haven't migrated yet.
   * Default: false.
   */
  legacyEventDispatch?: boolean;
}

function SectionPlaceholder({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex h-full flex-col gap-3 p-6">
      <h3 className="text-base font-semibold text-[var(--chat-text-primary)]">{title}</h3>
      <p className="max-w-prose text-sm text-[var(--chat-text-secondary)]">{body}</p>
      <p className="text-xs italic text-[var(--chat-text-muted)]">
        This section is the shared shell. Host apps can supply concrete content via the
        <code className="mx-1 rounded bg-[var(--chat-surface-hover)] px-1 py-0.5 text-[10px]">
          render
        </code>
        function on the matching SettingsSection.
      </p>
    </div>
  );
}

export function SettingsShell({
  sections = DEFAULT_SETTINGS_SECTIONS,
  onSectionChange,
  legacyEventDispatch = false,
}: SettingsShellProps) {
  const settingsOpen = useUIStore((s) => s.settingsOpen);
  const settingsTab = useUIStore((s) => s.settingsTab);
  const closeSettings = useUIStore((s) => s.closeSettings);

  // Legacy escape hatch — for hosts that still rely on the old
  // SettingsModal event-dispatch behavior. Off by default.
  useEffect(() => {
    if (!legacyEventDispatch || !settingsOpen) return;
    window.dispatchEvent(
      new CustomEvent('chat:action', {
        detail: { type: 'open-settings', tab: settingsTab || 'general' },
      }),
    );
    closeSettings();
  }, [legacyEventDispatch, settingsOpen, settingsTab, closeSettings]);

  // Pick the active section. Falls back to the first visible section when the
  // store carries an unknown tab id (e.g. a host opened a tab that has since
  // been removed from the section list).
  const visible = useMemo(() => sections.filter((s) => !s.hidden), [sections]);
  const activeId = useMemo<string | null>(() => {
    if (visible.length === 0) return null;
    if (visible.some((s) => s.id === settingsTab)) return settingsTab;
    return visible[0]?.id ?? null;
  }, [visible, settingsTab]);
  const active = useMemo(() => visible.find((s) => s.id === activeId) ?? null, [visible, activeId]);

  // Local mirror of the active section so the shell still renders even when
  // the host hasn't wired `settingsTab` through openSettings(<id>).
  const [navId, setNavId] = useState<string | null>(activeId);
  useEffect(() => setNavId(activeId), [activeId]);

  const onSelectSection = useCallback(
    (id: string) => {
      setNavId(id);
      onSectionChange?.(id);
    },
    [onSectionChange],
  );

  // Escape closes the modal — matches Claude/ChatGPT settings UX.
  useEffect(() => {
    if (!settingsOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeSettings();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settingsOpen, closeSettings]);

  if (!settingsOpen || legacyEventDispatch) return null;
  if (visible.length === 0) return null;

  const renderActive = (visible.find((s) => s.id === navId) ?? active)?.render;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeSettings();
      }}
    >
      <div
        className="flex h-[80vh] max-h-[640px] w-[min(880px,92vw)] overflow-hidden rounded-2xl border bg-[var(--chat-surface-elevated)] shadow-2xl"
        style={{
          borderColor: 'var(--chat-border)',
        }}
      >
        {/* Left nav */}
        <nav
          aria-label="Settings sections"
          className="flex h-full w-[200px] shrink-0 flex-col gap-0.5 border-r p-3 text-sm"
          style={{ borderColor: 'var(--chat-border)' }}
        >
          <div className="px-2 pb-2 pt-1 text-xs font-semibold uppercase tracking-wide text-[var(--chat-text-muted)]">
            Settings
          </div>
          {visible.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => onSelectSection(section.id)}
              aria-current={section.id === navId ? 'page' : undefined}
              className={cn(
                'flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-secondary)]',
                section.id === navId
                  ? 'bg-[var(--chat-surface-hover)] text-[var(--chat-text-primary)]'
                  : 'text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]',
              )}
            >
              {section.icon ? (
                <span className="shrink-0" aria-hidden="true">
                  {section.icon}
                </span>
              ) : null}
              <span className="truncate">{section.label}</span>
            </button>
          ))}
        </nav>

        {/* Right pane */}
        <section className="relative flex h-full flex-1 flex-col overflow-y-auto">
          <button
            type="button"
            aria-label="Close settings"
            onClick={closeSettings}
            className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-md text-[var(--chat-text-muted)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-secondary)]"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
          {renderActive ? (
            renderActive()
          ) : (
            <SectionPlaceholder
              title={visible.find((s) => s.id === navId)?.label ?? ''}
              body="No content provided for this section yet."
            />
          )}
        </section>
      </div>
    </div>
  );
}
