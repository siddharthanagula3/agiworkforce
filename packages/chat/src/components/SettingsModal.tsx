import { useUIStore } from '../stores/uiStore';

export function SettingsModal() {
  const settingsOpen = useUIStore((s) => s.settingsOpen);
  const closeSettings = useUIStore((s) => s.closeSettings);

  if (!settingsOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={closeSettings}
      onKeyDown={(e) => {
        if (e.key === 'Escape') closeSettings();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md rounded-xl bg-[var(--chat-surface-base)] p-6 border border-[var(--chat-border)]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="document"
      >
        <h2 className="text-lg font-semibold text-[var(--chat-fg)] mb-4">Settings</h2>
        <p className="text-sm text-[var(--chat-text-muted)]">
          Settings are managed by the host application.
        </p>
      </div>
    </div>
  );
}
