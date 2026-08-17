import { Check } from 'lucide-react';

export interface FirstRunChecklistItem {
  id: string;
  label: string;
  description: string;
  done: boolean;
  onAction: () => void;
}

interface FirstRunChecklistProps {
  items: FirstRunChecklistItem[];
}

export function FirstRunChecklist({ items }: FirstRunChecklistProps) {
  if (items.length === 0 || items.every((item) => item.done)) return null;

  const completed = items.filter((item) => item.done).length;

  return (
    <section
      data-testid="v3-first-run-checklist"
      aria-label="Set up AGI"
      className="w-full max-w-[760px] rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface-base)] p-4"
    >
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-[var(--chat-text-primary)]">Set up AGI</h2>
        <span className="text-xs text-[var(--chat-text-muted)]">
          {completed} of {items.length} done
        </span>
      </header>

      <ol className="flex flex-col gap-1">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={item.onAction}
              aria-label={item.label}
              data-testid={`v3-checklist-${item.id}`}
              data-done={item.done ? 'true' : 'false'}
              className="group flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-[var(--chat-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-primary)]"
            >
              <span
                aria-hidden="true"
                className={
                  item.done
                    ? 'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--chat-accent-primary)] text-[var(--chat-surface-base)]'
                    : 'mt-0.5 h-5 w-5 shrink-0 rounded-full border border-[var(--chat-border)]'
                }
              >
                {item.done ? <Check className="h-3 w-3" /> : null}
              </span>
              <span className="min-w-0">
                <span
                  className={
                    item.done
                      ? 'block text-sm font-medium text-[var(--chat-text-muted)] line-through'
                      : 'block text-sm font-medium text-[var(--chat-text-primary)]'
                  }
                >
                  {item.label}
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-[var(--chat-text-muted)]">
                  {item.description}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
