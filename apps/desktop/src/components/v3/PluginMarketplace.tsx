import { useState, useMemo } from 'react';
import { X, Search, Wrench, Plug, Box, ChevronDown, Check, Settings } from 'lucide-react';

interface PluginEntry {
  id: string;
  name: string;
  desc: string;
  author: string;
  installs: string;
  color: string;
  installed: boolean;
  tab: 'plugin' | 'skill' | 'connector';
}

const CATALOG: PluginEntry[] = [
  {
    id: 'legal',
    name: 'Legal',
    desc: 'Contract drafting, clause extraction, risk flagging, and court filing templates.',
    author: 'Anthropic',
    installs: '84k',
    color: '#3a7daa',
    installed: true,
    tab: 'plugin',
  },
  {
    id: 'finance',
    name: 'Finance',
    desc: 'P&L summarization, cash-flow forecasting, earnings call analysis, and SEC filing parsing.',
    author: 'Anthropic',
    installs: '61k',
    color: '#2a9d4e',
    installed: true,
    tab: 'plugin',
  },
  {
    id: 'research',
    name: 'Deep Research',
    desc: 'Multi-source research plans with citation tracking, sub-claim synthesis, and export to Notion or PDF.',
    author: 'Anthropic',
    installs: '112k',
    color: '#21808d',
    installed: false,
    tab: 'plugin',
  },
  {
    id: 'code',
    name: 'Code',
    desc: 'Inline diff review, test generation, repo-aware context, and CI/CD hook integration.',
    author: 'Anthropic',
    installs: '203k',
    color: '#7c4ed7',
    installed: false,
    tab: 'plugin',
  },
  {
    id: 'marketing',
    name: 'Marketing Suite',
    desc: 'Campaign brief generation, A/B copy variants, SEO meta tag optimizer, and social scheduler.',
    author: 'Partners',
    installs: '38k',
    color: '#da7756',
    installed: false,
    tab: 'plugin',
  },
  {
    id: 'sales',
    name: 'Sales Intelligence',
    desc: 'Lead scoring, outreach personalization, objection handling playbooks, and CRM sync.',
    author: 'Partners',
    installs: '29k',
    color: '#c47a2c',
    installed: false,
    tab: 'plugin',
  },
  {
    id: 'humanizer',
    name: 'Humanizer',
    desc: 'Rewrites AI-generated text to sound natural, on-brand, and human. Adjustable tone dials.',
    author: 'Community',
    installs: '175k',
    color: '#a25fb5',
    installed: false,
    tab: 'skill',
  },
  {
    id: 'brand',
    name: 'Brand Guidelines',
    desc: 'Enforces tone, terminology, and visual identity rules across all generated content.',
    author: 'Community',
    installs: '52k',
    color: '#3a7daa',
    installed: false,
    tab: 'skill',
  },
  {
    id: 'gmail-conn',
    name: 'Gmail',
    desc: 'Read, draft, and send emails directly from your AGI workflow.',
    author: 'Anthropic',
    installs: '98k',
    color: '#e04a3a',
    installed: true,
    tab: 'connector',
  },
  {
    id: 'github-conn',
    name: 'GitHub',
    desc: 'Access repos, issues, PRs, and commit history in context.',
    author: 'Anthropic',
    installs: '144k',
    color: '#24292e',
    installed: true,
    tab: 'connector',
  },
  {
    id: 'notion-conn',
    name: 'Notion',
    desc: 'Read and write Notion pages, databases, and comments.',
    author: 'Partners',
    installs: '87k',
    color: '#000',
    installed: false,
    tab: 'connector',
  },
  {
    id: 'cal-conn',
    name: 'Google Calendar',
    desc: 'Create, update, and query calendar events.',
    author: 'Anthropic',
    installs: '76k',
    color: '#4285f4',
    installed: false,
    tab: 'connector',
  },
];

const FILTER_OPTIONS = ['All', 'Anthropic', 'Anthropic & Partners', 'Community', 'Installed'];
const SORT_OPTIONS = ['Most installed', 'Newest', 'Recently updated', 'A–Z'];

export interface PluginMarketplaceProps {
  onClose: () => void;
  onInstall?: (pluginId: string) => void;
  onOpenDetail?: (pluginId: string) => void;
}

export function PluginMarketplace({ onClose, onInstall, onOpenDetail }: PluginMarketplaceProps) {
  const [tab, setTab] = useState<'skill' | 'connector' | 'plugin'>('plugin');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('All');
  const [filterOpen, setFilterOpen] = useState(false);
  const [sort, setSort] = useState('Most installed');
  const [sortOpen, setSortOpen] = useState(false);

  const filtered = useMemo(() => {
    let list = CATALOG.filter((p) => p.tab === tab);
    if (filter === 'Installed') list = list.filter((p) => p.installed);
    else if (filter === 'Anthropic') list = list.filter((p) => p.author === 'Anthropic');
    else if (filter === 'Anthropic & Partners') list = list.filter((p) => p.author !== 'Community');
    else if (filter === 'Community') list = list.filter((p) => p.author === 'Community');
    if (q.trim()) list = list.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
    if (sort === 'A–Z') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [tab, filter, sort, q]);

  const tabDefs = [
    { id: 'skill' as const, label: 'Skills', Icon: Wrench },
    { id: 'connector' as const, label: 'Connectors', Icon: Plug },
    { id: 'plugin' as const, label: 'Plugins', Icon: Box },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 780,
          maxHeight: '80vh',
          background: 'var(--bg-elev)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.28)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            gap: 12,
          }}
        >
          <h2
            style={{
              fontFamily: 'var(--serif)',
              fontSize: 18,
              fontWeight: 500,
              color: 'var(--text-1)',
              margin: 0,
              flex: 1,
            }}
          >
            Directory
          </h2>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: 'var(--text-3)',
              display: 'flex',
              padding: 4,
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Sidebar */}
          <aside
            style={{
              width: 160,
              borderRight: '1px solid var(--border)',
              padding: '12px 8px',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            {tabDefs.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 10px',
                  border: 'none',
                  borderRadius: 'var(--radius)',
                  background: tab === id ? 'var(--bg-soft)' : 'transparent',
                  color: tab === id ? 'var(--text-1)' : 'var(--text-3)',
                  fontSize: 13,
                  fontWeight: tab === id ? 600 : 400,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </aside>

          {/* Main */}
          <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Search + filters */}
            <div
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: 'var(--bg-soft)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  padding: '7px 12px',
                }}
              >
                <Search size={14} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={`Search ${tabDefs.find((t) => t.id === tab)?.label.toLowerCase()}…`}
                  style={{
                    flex: 1,
                    border: 'none',
                    background: 'transparent',
                    outline: 'none',
                    fontSize: 13,
                    color: 'var(--text-1)',
                    fontFamily: 'inherit',
                  }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text-3)', marginRight: 4 }}>
                  {filter !== 'All' && (
                    <button
                      style={{
                        padding: '3px 10px',
                        border: '1px solid var(--teal)',
                        borderRadius: 12,
                        background: 'rgba(33,128,141,0.1)',
                        color: 'var(--teal)',
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      {filter}
                    </button>
                  )}
                </span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  {/* Filter dropdown */}
                  <div style={{ position: 'relative' }}>
                    <button
                      onClick={() => {
                        setFilterOpen((o) => !o);
                        setSortOpen(false);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '4px 10px',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius)',
                        background: 'transparent',
                        color: 'var(--text-2)',
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      Filter by <ChevronDown size={11} />
                    </button>
                    {filterOpen && (
                      <div
                        style={{
                          position: 'absolute',
                          top: 32,
                          right: 0,
                          minWidth: 180,
                          background: 'var(--bg-elev)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius)',
                          boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                          zIndex: 10,
                          padding: '4px 0',
                        }}
                      >
                        {FILTER_OPTIONS.map((f) => (
                          <button
                            key={f}
                            onClick={() => {
                              setFilter(f);
                              setFilterOpen(false);
                            }}
                            style={{
                              width: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              padding: '7px 14px',
                              border: 'none',
                              background: 'transparent',
                              color: 'var(--text-2)',
                              fontSize: 13,
                              cursor: 'pointer',
                              textAlign: 'left',
                            }}
                          >
                            <span style={{ flex: 1 }}>{f}</span>
                            {filter === f && <Check size={12} style={{ color: 'var(--teal)' }} />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Sort dropdown */}
                  <div style={{ position: 'relative' }}>
                    <button
                      onClick={() => {
                        setSortOpen((o) => !o);
                        setFilterOpen(false);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '4px 10px',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius)',
                        background: 'transparent',
                        color: 'var(--text-2)',
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      Sort by <ChevronDown size={11} />
                    </button>
                    {sortOpen && (
                      <div
                        style={{
                          position: 'absolute',
                          top: 32,
                          right: 0,
                          minWidth: 190,
                          background: 'var(--bg-elev)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius)',
                          boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                          zIndex: 10,
                          padding: '4px 0',
                        }}
                      >
                        {SORT_OPTIONS.map((s) => (
                          <button
                            key={s}
                            onClick={() => {
                              setSort(s);
                              setSortOpen(false);
                            }}
                            style={{
                              width: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              padding: '7px 14px',
                              border: 'none',
                              background: 'transparent',
                              color: 'var(--text-2)',
                              fontSize: 13,
                              cursor: 'pointer',
                              textAlign: 'left',
                            }}
                          >
                            <span style={{ flex: 1 }}>{s}</span>
                            {sort === s && <Check size={12} style={{ color: 'var(--teal)' }} />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Grid */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
              {filtered.length === 0 ? (
                <div
                  style={{
                    padding: '40px 0',
                    textAlign: 'center',
                    color: 'var(--text-3)',
                    fontSize: 13,
                  }}
                >
                  No {tabDefs.find((t) => t.id === tab)?.label.toLowerCase()} found.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                  {filtered.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => onOpenDetail?.(p.id)}
                      style={{
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius)',
                        background: 'var(--bg)',
                        padding: '14px 14px 12px',
                        cursor: 'pointer',
                        position: 'relative',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 10,
                          marginBottom: 8,
                        }}
                      >
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 8,
                            background: p.color,
                            flexShrink: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Box size={14} style={{ color: '#fff' }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
                            {p.name}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                            {p.author}
                            <span style={{ margin: '0 4px' }}>·</span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                              ↓ {p.installs}
                            </span>
                          </div>
                        </div>
                        {p.installed && (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              color: 'var(--teal)',
                              background: 'rgba(33,128,141,0.1)',
                              padding: '2px 6px',
                              borderRadius: 8,
                            }}
                          >
                            Installed
                          </span>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            color: 'var(--text-3)',
                            padding: 2,
                            display: 'flex',
                          }}
                        >
                          <Settings size={13} />
                        </button>
                      </div>
                      <p
                        style={{ margin: 0, fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}
                      >
                        {p.desc}
                      </p>
                      {!p.installed && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onInstall?.(p.id);
                          }}
                          style={{
                            marginTop: 10,
                            padding: '5px 12px',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius)',
                            background: 'transparent',
                            color: 'var(--text-2)',
                            fontSize: 12,
                            cursor: 'pointer',
                          }}
                        >
                          Install
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

// Default export required for React.lazy() used by PluginsHub
export default PluginMarketplace;
