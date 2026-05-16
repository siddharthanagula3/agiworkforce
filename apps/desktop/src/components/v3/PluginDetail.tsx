import { useState, useMemo } from 'react';
import { ChevronRight, Wrench, Plug, Plus, ChevronDown, ArrowRight, Box } from 'lucide-react';
import { useMcpStore } from '../../stores/mcpStore';

interface PluginCommand {
  cmd: string;
  desc: string;
}

interface PluginData {
  id: string;
  name: string;
  desc: string;
  color: string;
  version: string;
  author: string;
  installs: string;
  lastUpdated: string;
  commands: PluginCommand[];
  tryPrompts: string[];
}

const DEMO_PLUGINS: Record<string, PluginData> = {
  legal: {
    id: 'legal',
    name: 'Legal',
    color: '#3a7daa',
    desc: 'Contract drafting, clause extraction, risk flagging, and court filing templates. Built for in-house counsel and law firms. Works with your uploaded documents, Gmail connector, and any court-filing PDFs.',
    version: '1.2.0',
    author: 'Anthropic',
    installs: '84k',
    lastUpdated: '12 hours ago',
    commands: [
      {
        cmd: '/legal.review',
        desc: 'Extract risks, red-line clauses, and generate a summary memo from a contract.',
      },
      {
        cmd: '/legal.draft',
        desc: 'Draft a new agreement from a brief description or term sheet.',
      },
      {
        cmd: '/legal.clause',
        desc: 'Find and explain a specific clause across multiple uploaded documents.',
      },
      {
        cmd: '/legal.timeline',
        desc: 'Build a litigation or deal timeline from a set of documents.',
      },
      {
        cmd: '/legal.nda',
        desc: 'Generate a mutual or one-way NDA with customizable jurisdiction and term.',
      },
      {
        cmd: '/legal.filing',
        desc: 'Format a motion, brief, or declaration to court-filing standards.',
      },
    ],
    tryPrompts: [
      'Review this SaaS agreement and flag all liability caps and indemnification clauses.',
      'Draft a mutual NDA between two US entities, Delaware law, 2-year term.',
      'Summarize the key risk factors in the attached term sheet.',
      'Extract all change-of-control provisions from these 3 contracts.',
      'What does the limitation of liability clause in Section 12 actually mean?',
    ],
  },
  finance: {
    id: 'finance',
    name: 'Finance',
    color: '#2a9d4e',
    desc: 'P&L summarization, cash-flow forecasting, earnings call analysis, and SEC filing parsing.',
    version: '1.0.4',
    author: 'Anthropic',
    installs: '61k',
    lastUpdated: '2 days ago',
    commands: [
      {
        cmd: '/finance.summary',
        desc: 'Summarize a P&L statement with key variances highlighted.',
      },
      {
        cmd: '/finance.forecast',
        desc: 'Build a 12-month cash-flow forecast from historical data.',
      },
      { cmd: '/finance.earnings', desc: 'Parse and summarize an earnings call transcript.' },
      { cmd: '/finance.sec', desc: 'Extract key metrics from a 10-K or 10-Q filing.' },
    ],
    tryPrompts: [
      'Summarize this Q3 P&L and flag the top 3 expense variances.',
      'Build a 12-month cash-flow forecast based on our attached data.',
      'What did management say about margin guidance on the latest earnings call?',
    ],
  },
};

const OTHER_PLUGINS = [
  { id: 'finance', name: 'Finance', color: '#2a9d4e' },
  { id: 'research', name: 'Deep Research', color: '#21808d' },
  { id: 'code', name: 'Code', color: '#7c4ed7' },
  { id: 'marketing', name: 'Marketing Suite', color: '#da7756' },
  { id: 'sales', name: 'Sales Intelligence', color: '#c47a2c' },
];

export interface PluginDetailProps {
  pluginId?: string;
  onBack?: () => void;
  onNavigatePlugin?: (pluginId: string) => void;
}

export function PluginDetail({ pluginId = 'legal', onBack, onNavigatePlugin }: PluginDetailProps) {
  const [activePluginId, setActivePluginId] = useState(pluginId);

  const servers = useMcpStore((s) => s.servers);
  const tools = useMcpStore((s) => s.tools);
  const enableServer = useMcpStore((s) => s.enableServer);
  const disableServer = useMcpStore((s) => s.disableServer);

  const livePlugin = useMemo<PluginData | null>(() => {
    const server = servers.find(
      (s) => s.name === activePluginId || s.name === `mcp-${activePluginId}`,
    );
    if (!server) return null;
    const serverTools = tools.filter((t) => t.server === server.name);
    return {
      id: activePluginId,
      name: server.name,
      desc: '',
      color: '#21808d',
      version: '—',
      author: 'Local MCP',
      installs: `${server.tool_count} tools`,
      lastUpdated: '—',
      commands: serverTools.map((t) => ({ cmd: `/${t.name}`, desc: t.description })),
      tryPrompts: [],
    };
  }, [servers, tools, activePluginId]);

  const plugin: PluginData = livePlugin ?? DEMO_PLUGINS[activePluginId] ?? DEMO_PLUGINS['legal']!;

  const serverEnabled = useMemo(() => {
    const server = servers.find(
      (s) => s.name === activePluginId || s.name === `mcp-${activePluginId}`,
    );
    return server?.enabled ?? true;
  }, [servers, activePluginId]);

  const [localEnabled, setLocalEnabled] = useState(true);
  const [toggling, setToggling] = useState(false);
  const enabled = livePlugin ? serverEnabled : localEnabled;

  async function handleToggle() {
    if (toggling) return;
    if (livePlugin) {
      const serverName =
        servers.find((s) => s.name === activePluginId || s.name === `mcp-${activePluginId}`)
          ?.name ?? activePluginId;
      setToggling(true);
      try {
        if (enabled) {
          await disableServer(serverName);
        } else {
          await enableServer(serverName);
        }
      } finally {
        setToggling(false);
      }
    } else {
      setLocalEnabled((v) => !v);
    }
  }

  const handlePluginSwitch = (id: string) => {
    setActivePluginId(id);
    onNavigatePlugin?.(id);
  };

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--bg)' }}>
      {/* Sidebar */}
      <aside
        style={{
          width: 200,
          borderRight: '1px solid var(--border)',
          padding: '12px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          overflowY: 'auto',
          flexShrink: 0,
        }}
      >
        {onBack && (
          <button
            onClick={onBack}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '6px 8px',
              border: 'none',
              background: 'transparent',
              color: 'var(--text-3)',
              fontSize: 12,
              cursor: 'pointer',
              marginBottom: 8,
            }}
          >
            <ChevronRight size={13} style={{ transform: 'rotate(180deg)' }} />
            Customize
          </button>
        )}

        {/* Navigation */}
        <div style={{ marginBottom: 4 }}>
          <button
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 10px',
              border: 'none',
              background: 'transparent',
              color: 'var(--text-3)',
              fontSize: 12.5,
              cursor: 'pointer',
              width: '100%',
              textAlign: 'left',
            }}
          >
            <Wrench size={13} />
            Skills
          </button>
          <button
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 10px',
              border: 'none',
              background: 'transparent',
              color: 'var(--text-3)',
              fontSize: 12.5,
              cursor: 'pointer',
              width: '100%',
              textAlign: 'left',
            }}
          >
            <Plug size={13} />
            Connectors
          </button>
        </div>

        <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />

        {/* Personal plugins label */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '4px 8px', gap: 4 }}>
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              color: 'var(--text-3)',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              flex: 1,
            }}
          >
            Personal plugins
          </span>
          <button
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: 'var(--text-3)',
              display: 'flex',
              padding: 2,
            }}
          >
            <Plus size={11} />
          </button>
        </div>

        {/* Active plugin */}
        <button
          onClick={() => handlePluginSwitch(plugin.id)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 10px',
            border: 'none',
            borderRadius: 'var(--radius)',
            background: 'var(--bg-soft)',
            color: 'var(--text-1)',
            fontSize: 13,
            cursor: 'pointer',
            fontWeight: 600,
            width: '100%',
            textAlign: 'left',
          }}
        >
          <div
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: plugin.color,
              flexShrink: 0,
            }}
          />
          <span
            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}
          >
            {plugin.name}
          </span>
        </button>

        {/* Sub-items */}
        <div style={{ paddingLeft: 16 }}>
          <button
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 8px',
              border: 'none',
              background: 'transparent',
              color: 'var(--text-3)',
              fontSize: 12,
              cursor: 'pointer',
              width: '100%',
              textAlign: 'left',
            }}
          >
            <Wrench size={11} />
            Skills
          </button>
          <button
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 8px',
              border: 'none',
              background: 'transparent',
              color: 'var(--text-3)',
              fontSize: 12,
              cursor: 'pointer',
              width: '100%',
              textAlign: 'left',
            }}
          >
            <Plug size={11} />
            Connectors
          </button>
        </div>

        {/* Other plugins */}
        {OTHER_PLUGINS.filter((p) => p.id !== plugin.id).map((p) => (
          <button
            key={p.id}
            onClick={() => handlePluginSwitch(p.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 10px',
              border: 'none',
              background: 'transparent',
              color: 'var(--text-2)',
              fontSize: 12.5,
              cursor: 'pointer',
              width: '100%',
              textAlign: 'left',
            }}
          >
            <div
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: p.color,
                flexShrink: 0,
              }}
            />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.name}
            </span>
          </button>
        ))}
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: plugin.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Box size={16} style={{ color: '#fff' }} />
            </div>
            <h1
              style={{
                fontFamily: 'var(--serif)',
                fontSize: 22,
                fontWeight: 500,
                color: 'var(--text-1)',
                margin: 0,
              }}
            >
              {plugin.name}
            </h1>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* mcp_update_server does not exist — Update button intentionally omitted */}
            <button
              style={{
                padding: '6px 12px',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                background: 'transparent',
                color: 'var(--text-2)',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Customize
            </button>
            {/* iOS-style toggle wired to mcp_enable_server / mcp_disable_server */}
            <button
              onClick={() => void handleToggle()}
              disabled={toggling}
              style={{
                width: 38,
                height: 22,
                borderRadius: 11,
                border: 'none',
                background: enabled ? 'var(--teal)' : 'var(--border)',
                cursor: toggling ? 'not-allowed' : 'pointer',
                position: 'relative',
                transition: 'background 0.2s',
                flexShrink: 0,
                opacity: toggling ? 0.7 : 1,
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: 2,
                  left: enabled ? 18 : 2,
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: '#fff',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  transition: 'left 0.2s',
                }}
              />
            </button>
            <button
              style={{
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: 'var(--text-3)',
                display: 'flex',
                padding: 4,
              }}
            >
              <ChevronDown size={14} />
            </button>
          </div>
        </div>

        {/* Meta grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 12,
            marginBottom: 24,
            padding: '16px',
            background: 'var(--bg-soft)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
          }}
        >
          {[
            { label: 'Source', value: 'Marketplace (Anthropic & Partners)' },
            { label: 'Version', value: plugin.version },
            { label: 'Author', value: plugin.author },
            { label: 'Last updated', value: plugin.lastUpdated },
          ].map(({ label, value }) => (
            <div key={label}>
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--text-3)',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: 0.4,
                  marginBottom: 4,
                }}
              >
                {label}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-2)' }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Description */}
        <div
          style={{
            fontSize: 11,
            color: 'var(--text-3)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: 0.4,
            marginBottom: 6,
          }}
        >
          Description
        </div>
        <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.65, marginBottom: 24 }}>
          {plugin.desc}
        </p>

        {/* Skills / Commands */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text-1)',
              background: 'var(--bg-soft)',
              border: '1px solid var(--border)',
              padding: '3px 10px',
              borderRadius: 12,
            }}
          >
            Skills
          </span>
          <button
            style={{
              fontSize: 12,
              color: 'var(--teal)',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
            }}
          >
            See all
          </button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 14 }}>
          Invoke by typing{' '}
          <code
            style={{
              fontFamily: 'var(--mono)',
              background: 'var(--bg-soft)',
              padding: '1px 4px',
              borderRadius: 3,
            }}
          >
            /
          </code>{' '}
          in chat, or let AGI use them automatically for relevant tasks.
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 8,
            marginBottom: 32,
          }}
        >
          {plugin.commands.map((c) => (
            <div
              key={c.cmd}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '12px 14px',
                background: 'var(--bg-elev)',
              }}
            >
              <p
                style={{
                  fontSize: 12.5,
                  color: 'var(--text-2)',
                  margin: '0 0 8px',
                  lineHeight: 1.5,
                }}
              >
                {c.desc}
              </p>
              <code
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 11.5,
                  color: 'var(--teal)',
                  background: 'rgba(33,128,141,0.08)',
                  padding: '2px 6px',
                  borderRadius: 4,
                }}
              >
                {c.cmd}
              </code>
            </div>
          ))}
        </div>

        {/* Try asking */}
        <div
          style={{
            fontFamily: 'var(--serif)',
            fontSize: 17,
            fontWeight: 500,
            color: 'var(--text-1)',
            marginBottom: 12,
          }}
        >
          Try asking…
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {plugin.tryPrompts.map((p, i) => (
            <button
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                background: 'var(--bg-elev)',
                color: 'var(--text-2)',
                fontSize: 13,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span style={{ flex: 1, lineHeight: 1.4 }}>{p}</span>
              <ArrowRight size={13} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
