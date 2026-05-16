import { useState } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── data ──────────────────────────────────────────────────────────────────────

type PermState = 'allow' | 'ask' | 'never';

interface Perm {
  name: string;
  desc: string;
  state: PermState;
}

interface ConnectedConnector {
  id: string;
  name: string;
  abbr: string;
  color: string;
  account: string;
  perms: Perm[];
}

interface AvailableConnector {
  id: string;
  name: string;
  abbr: string;
  color: string;
}

const CONNECTED: ConnectedConnector[] = [
  {
    id: 'gmail',
    name: 'Gmail',
    abbr: 'G',
    color: '#ea4335',
    account: 'you@gmail.com',
    perms: [
      { name: 'Read emails', desc: 'View subject, sender, and body', state: 'allow' },
      { name: 'Send emails', desc: 'Compose and send on your behalf', state: 'ask' },
      { name: 'Delete emails', desc: 'Move to trash', state: 'never' },
    ],
  },
  {
    id: 'vercel',
    name: 'Vercel',
    abbr: 'V',
    color: '#000000',
    account: 'your-team.vercel.app',
    perms: [
      { name: 'Read deployments', desc: 'View build logs and status', state: 'allow' },
      { name: 'Trigger deploy', desc: 'Start a new deployment', state: 'ask' },
    ],
  },
  {
    id: 'github',
    name: 'GitHub Integration',
    abbr: 'GH',
    color: '#24292e',
    account: '@yourusername',
    perms: [
      { name: 'Read repos', desc: 'Browse code and issues', state: 'allow' },
      { name: 'Create PRs', desc: 'Open pull requests', state: 'ask' },
      { name: 'Push commits', desc: 'Write to branches', state: 'ask' },
    ],
  },
  {
    id: 'gcal',
    name: 'Google Calendar',
    abbr: 'GC',
    color: '#1a73e8',
    account: 'you@gmail.com',
    perms: [
      { name: 'Read events', desc: 'View your schedule', state: 'allow' },
      { name: 'Create events', desc: 'Add events to your calendar', state: 'ask' },
    ],
  },
];

const AVAILABLE: AvailableConnector[] = [
  { id: 'notion', name: 'Notion', abbr: 'N', color: '#000' },
  { id: 'slack', name: 'Slack', abbr: 'S', color: '#4a154b' },
  { id: 'linear', name: 'Linear', abbr: 'L', color: '#5e6ad2' },
  { id: 'figma', name: 'Figma', abbr: 'F', color: '#f24e1e' },
  { id: 'jira', name: 'Jira', abbr: 'J', color: '#0052cc' },
  { id: 'hubspot', name: 'HubSpot', abbr: 'H', color: '#ff7a59' },
];

// ── helpers ───────────────────────────────────────────────────────────────────

const PERM_CYCLE: PermState[] = ['allow', 'ask', 'never'];

function permLabel(s: PermState): string {
  return s === 'allow' ? 'Allow' : s === 'ask' ? 'Ask' : 'Never';
}

function permIcon(s: PermState): string {
  return s === 'allow' ? '✓' : s === 'ask' ? '⚠' : '⛔';
}

function permColors(s: PermState): string {
  if (s === 'allow')
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100';
  if (s === 'ask') return 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100';
  return 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100';
}

// ── ConnectorsView ────────────────────────────────────────────────────────────

export function ConnectorsView() {
  const [perms, setPerms] = useState<Record<string, PermState[]>>(() => {
    const init: Record<string, PermState[]> = {};
    CONNECTED.forEach((c) => {
      init[c.id] = c.perms.map((p) => p.state);
    });
    return init;
  });

  const cyclePerm = (cid: string, pi: number) => {
    setPerms((s) => ({
      ...s,
      [cid]: (s[cid] ?? []).map((p, i) => {
        if (i !== pi) return p;
        const idx = PERM_CYCLE.indexOf(p);
        return PERM_CYCLE[(idx + 1) % PERM_CYCLE.length] ?? 'allow';
      }),
    }));
  };

  return (
    <div className="h-full overflow-y-auto px-6 py-5">
      {/* connected section */}
      <div className="mb-4">
        <h2 className="font-serif text-lg font-medium text-[var(--chat-text-primary,#1a1a1a)] mb-1">
          Connected
        </h2>
        <p className="text-xs text-[var(--chat-text-tertiary,#9e9488)]">
          Per-tool permissions for each connector. AGI never uses ⚠ Ask actions without
          confirmation.
        </p>
      </div>

      <div className="grid gap-3 grid-cols-1 xl:grid-cols-2 mb-8">
        {CONNECTED.map((c) => {
          const cPerms = perms[c.id] ?? [];
          return (
            <div
              key={c.id}
              className="rounded-xl border border-[var(--chat-border,#e8e3db)] bg-[var(--chat-bg,#fcfaf6)] p-4"
            >
              {/* header */}
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white text-sm font-semibold"
                  style={{ background: c.color }}
                >
                  {c.abbr}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[var(--chat-text-primary,#1a1a1a)] truncate">
                    {c.name}
                  </div>
                  <div className="text-xs text-[var(--chat-text-tertiary,#9e9488)] truncate">
                    {c.account}
                  </div>
                </div>
                <span className="text-[11px] font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                  Connected
                </span>
              </div>

              {/* permissions */}
              <div className="space-y-2">
                {c.perms.map((p, pi) => {
                  const state = cPerms[pi] ?? p.state;
                  return (
                    <div key={p.name} className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-[var(--chat-text-primary,#1a1a1a)]">
                          {p.name}
                        </div>
                        <div className="text-[11px] text-[var(--chat-text-tertiary,#9e9488)]">
                          {p.desc}
                        </div>
                      </div>
                      <button
                        onClick={() => cyclePerm(c.id, pi)}
                        className={cn(
                          'shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                          permColors(state),
                        )}
                      >
                        {permIcon(state)} {permLabel(state)}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* not connected section */}
      <h2 className="font-serif text-lg font-medium text-[var(--chat-text-primary,#1a1a1a)] mb-1">
        Not connected
      </h2>
      <p className="text-xs text-[var(--chat-text-tertiary,#9e9488)] mb-4">
        Add a connector to give AGI scoped access to your tools.
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
        {AVAILABLE.map((c) => (
          <button
            key={c.id}
            className="flex flex-col items-center gap-2 rounded-xl border border-[var(--chat-border,#e8e3db)] bg-[var(--chat-bg,#fcfaf6)] p-4 text-center hover:bg-[var(--chat-bg-soft,#f5f0e8)] transition-colors group"
          >
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg text-white text-sm font-semibold"
              style={{ background: c.color }}
            >
              {c.abbr}
            </div>
            <div className="text-xs font-medium text-[var(--chat-text-primary,#1a1a1a)]">
              {c.name}
            </div>
            <div className="flex items-center gap-0.5 text-[11px] text-[var(--chat-text-tertiary,#9e9488)] group-hover:text-[var(--chat-teal,#21808d)] transition-colors">
              Add <Plus size={10} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
