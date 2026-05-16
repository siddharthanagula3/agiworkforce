import { useEffect } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useConnectorsStore, type ConnectorPermState } from '../../stores/connectorsStore';
import { CONNECTORS, type ConnectorDef } from '../Connectors/connectorDefinitions';

// ── helpers ───────────────────────────────────────────────────────────────────

const PERM_CYCLE: ConnectorPermState[] = ['allow', 'ask', 'never'];

function permLabel(s: ConnectorPermState): string {
  return s === 'allow' ? 'Allow' : s === 'ask' ? 'Ask' : 'Never';
}

function permIcon(s: ConnectorPermState): string {
  return s === 'allow' ? '✓' : s === 'ask' ? '⚠' : '⛔';
}

function permColors(s: ConnectorPermState): string {
  if (s === 'allow')
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100';
  if (s === 'ask') return 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100';
  return 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100';
}

/** Default tool definitions per connector */
function defaultToolsForConnector(
  c: ConnectorDef,
): Array<{ name: string; desc: string; defaultState: ConnectorPermState }> {
  switch (c.id) {
    case 'gmail':
      return [
        { name: 'Read emails', desc: 'View subject, sender, and body', defaultState: 'allow' },
        { name: 'Send emails', desc: 'Compose and send on your behalf', defaultState: 'ask' },
        { name: 'Delete emails', desc: 'Move to trash', defaultState: 'never' },
      ];
    case 'vercel':
      return [
        { name: 'Read deployments', desc: 'View build logs and status', defaultState: 'allow' },
        { name: 'Trigger deploy', desc: 'Start a new deployment', defaultState: 'ask' },
      ];
    case 'github':
      return [
        { name: 'Read repos', desc: 'Browse code and issues', defaultState: 'allow' },
        { name: 'Create PRs', desc: 'Open pull requests', defaultState: 'ask' },
        { name: 'Push commits', desc: 'Write to branches', defaultState: 'ask' },
      ];
    case 'google_calendar':
      return [
        { name: 'Read events', desc: 'View your schedule', defaultState: 'allow' },
        { name: 'Create events', desc: 'Add events to your calendar', defaultState: 'ask' },
      ];
    case 'notion':
      return [
        { name: 'Read pages', desc: 'View and search pages', defaultState: 'allow' },
        { name: 'Edit pages', desc: 'Update content in your workspace', defaultState: 'ask' },
      ];
    case 'slack':
      return [
        { name: 'Read channels', desc: 'View messages and channel info', defaultState: 'allow' },
        { name: 'Send messages', desc: 'Post on your behalf', defaultState: 'ask' },
      ];
    case 'linear':
      return [
        { name: 'Read issues', desc: 'View issues and projects', defaultState: 'allow' },
        { name: 'Create issues', desc: 'Open new issues', defaultState: 'ask' },
        { name: 'Update issues', desc: 'Edit status and fields', defaultState: 'ask' },
      ];
    default:
      return [
        { name: 'Read data', desc: `View data from ${c.name}`, defaultState: 'allow' },
        { name: 'Write data', desc: `Modify data in ${c.name}`, defaultState: 'ask' },
      ];
  }
}

// ── ConnectorCard ─────────────────────────────────────────────────────────────

function ConnectorCard({ connector }: { connector: ConnectorDef }) {
  const { getToolPermission, setToolPermission } = useConnectorsStore();
  const tools = defaultToolsForConnector(connector);

  const abbr = connector.name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const colorMap: Record<string, string> = {
    red: '#ea4335',
    blue: '#1a73e8',
    gray: '#24292e',
    purple: '#4a154b',
    green: '#16a34a',
    orange: '#ff7a59',
    teal: '#21808d',
    amber: '#d97706',
  };
  const bgColor = colorMap[connector.color] ?? '#6b7280';

  return (
    <div className="rounded-xl border border-[var(--chat-border,#e8e3db)] bg-[var(--chat-bg,#fcfaf6)] p-4">
      <div className="flex items-center gap-3 mb-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white text-sm font-semibold"
          style={{ background: bgColor }}
        >
          {abbr}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-[var(--chat-text-primary,#1a1a1a)] truncate">
            {connector.name}
          </div>
          <div className="text-xs text-[var(--chat-text-tertiary,#9e9488)] truncate capitalize">
            {connector.category}
          </div>
        </div>
        <span className="text-[11px] font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
          Connected
        </span>
      </div>

      <div className="space-y-2">
        {tools.map((tool) => {
          const state = getToolPermission(connector.id, tool.name, tool.defaultState);
          const cycleNext = () => {
            const idx = PERM_CYCLE.indexOf(state);
            const next = PERM_CYCLE[(idx + 1) % PERM_CYCLE.length] ?? 'allow';
            setToolPermission(connector.id, tool.name, next);
          };
          return (
            <div key={tool.name} className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-[var(--chat-text-primary,#1a1a1a)]">
                  {tool.name}
                </div>
                <div className="text-[11px] text-[var(--chat-text-tertiary,#9e9488)]">
                  {tool.desc}
                </div>
              </div>
              <button
                onClick={cycleNext}
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
}

// ── ConnectorsView ────────────────────────────────────────────────────────────

export function ConnectorsView() {
  const { connectedIds, fetchConnected, connect, isLoading } = useConnectorsStore();

  useEffect(() => {
    fetchConnected();
  }, []);

  const connectedConnectors = CONNECTORS.filter((c) => connectedIds.includes(c.id));
  const availableConnectors = CONNECTORS.filter(
    (c) => !connectedIds.includes(c.id) && !c.comingSoon,
  ).slice(0, 12);

  return (
    <div className="h-full overflow-y-auto px-6 py-5">
      <div className="mb-4">
        <h2 className="font-serif text-lg font-medium text-[var(--chat-text-primary,#1a1a1a)] mb-1">
          Connected
        </h2>
        <p className="text-xs text-[var(--chat-text-tertiary,#9e9488)]">
          Per-tool permissions for each connector. AGI never uses ⚠ Ask actions without
          confirmation.
        </p>
      </div>

      {connectedConnectors.length === 0 ? (
        <p className="text-sm text-[var(--chat-text-tertiary,#9e9488)] mb-8">
          No connectors connected yet.
        </p>
      ) : (
        <div className="grid gap-3 grid-cols-1 xl:grid-cols-2 mb-8">
          {connectedConnectors.map((c) => (
            <ConnectorCard key={c.id} connector={c} />
          ))}
        </div>
      )}

      <h2 className="font-serif text-lg font-medium text-[var(--chat-text-primary,#1a1a1a)] mb-1">
        Not connected
      </h2>
      <p className="text-xs text-[var(--chat-text-tertiary,#9e9488)] mb-4">
        Add a connector to give AGI scoped access to your tools.
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
        {availableConnectors.map((c) => {
          const loading = isLoading(c.id);
          const abbr = c.name
            .split(/\s+/)
            .map((w) => w[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);
          const colorMap: Record<string, string> = {
            red: '#ea4335',
            blue: '#1a73e8',
            gray: '#24292e',
            purple: '#4a154b',
            green: '#16a34a',
            orange: '#ff7a59',
            teal: '#21808d',
            amber: '#d97706',
          };
          const bgColor = colorMap[c.color] ?? '#6b7280';
          return (
            <button
              key={c.id}
              onClick={() => connect(c.id)}
              disabled={loading}
              className="flex flex-col items-center gap-2 rounded-xl border border-[var(--chat-border,#e8e3db)] bg-[var(--chat-bg,#fcfaf6)] p-4 text-center hover:bg-[var(--chat-bg-soft,#f5f0e8)] transition-colors group disabled:opacity-60"
            >
              <div
                className="flex h-9 w-9 items-center justify-center rounded-lg text-white text-sm font-semibold"
                style={{ background: bgColor }}
              >
                {abbr}
              </div>
              <div className="text-xs font-medium text-[var(--chat-text-primary,#1a1a1a)]">
                {c.name}
              </div>
              <div className="flex items-center gap-0.5 text-[11px] text-[var(--chat-text-tertiary,#9e9488)] group-hover:text-[var(--chat-teal,#21808d)] transition-colors">
                {loading ? (
                  <Loader2 size={10} className="animate-spin" />
                ) : (
                  <>
                    Add <Plus size={10} />
                  </>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
