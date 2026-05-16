import { useState, useMemo, useEffect, useRef } from 'react';
import {
  Search,
  MessageSquare,
  FolderOpen,
  Wrench,
  Plug,
  Settings,
  ArrowRight,
} from 'lucide-react';

interface SearchItem {
  kind: 'chat' | 'project' | 'skill' | 'connector' | 'setting';
  id: string;
  title: string;
  sub?: string;
}

const DEMO_ITEMS: SearchItem[] = [
  { kind: 'chat', id: 'c1', title: 'Multi-provider routing research', sub: 'Today' },
  { kind: 'chat', id: 'c2', title: 'Quarterly KPI dashboard', sub: 'Yesterday' },
  { kind: 'chat', id: 'c3', title: 'Draft investor update email', sub: 'Yesterday' },
  { kind: 'chat', id: 'c4', title: 'Legal contract review — Series B', sub: 'Past week' },
  { kind: 'chat', id: 'c5', title: 'Refactor authentication middleware', sub: 'Past week' },
  { kind: 'project', id: 'p1', title: 'Sales pipeline', sub: 'Project' },
  { kind: 'project', id: 'p2', title: 'Customer support triage', sub: 'Project' },
  { kind: 'project', id: 'p3', title: 'Hiring loop', sub: 'Project' },
  { kind: 'skill', id: 's1', title: 'Humanizer', sub: 'Skill' },
  { kind: 'skill', id: 's2', title: 'Brand guidelines', sub: 'Skill' },
  { kind: 'connector', id: 'cn1', title: 'Gmail', sub: 'Connector · Connected' },
  { kind: 'connector', id: 'cn2', title: 'GitHub', sub: 'Connector · Connected' },
  { kind: 'setting', id: 'st1', title: 'Voice settings', sub: 'Settings' },
  { kind: 'setting', id: 'st2', title: 'BYOK & local models', sub: 'Settings' },
];

const KIND_ORDER: SearchItem['kind'][] = ['chat', 'project', 'skill', 'connector', 'setting'];
const KIND_ICON: Record<SearchItem['kind'], React.ElementType> = {
  chat: MessageSquare,
  project: FolderOpen,
  skill: Wrench,
  connector: Plug,
  setting: Settings,
};
const KIND_LABEL: Record<SearchItem['kind'], string> = {
  chat: 'Chats',
  project: 'Projects',
  skill: 'Skills',
  connector: 'Connectors',
  setting: 'Settings',
};

export interface SearchModalCmdKProps {
  onClose: () => void;
  onNavigate?: (dest: string, item: SearchItem) => void;
}

export function SearchModalCmdK({ onClose, onNavigate }: SearchModalCmdKProps) {
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = useMemo<SearchItem[]>(() => {
    if (!q.trim()) return DEMO_ITEMS.slice(0, 14);
    const qq = q.toLowerCase();
    return DEMO_ITEMS.filter((it) => it.title.toLowerCase().includes(qq));
  }, [q]);

  // Group by kind
  const grouped = useMemo(() => {
    const map = new Map<SearchItem['kind'], SearchItem[]>();
    for (const it of filtered) {
      if (!map.has(it.kind)) map.set(it.kind, []);
      map.get(it.kind)!.push(it);
    }
    return KIND_ORDER.filter((k) => map.has(k)).map((k) => ({ kind: k, items: map.get(k)! }));
  }, [filtered]);

  const flatItems = filtered;

  useEffect(() => {
    setSelected(0);
  }, [q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || (e.key === 'k' && e.metaKey)) {
        e.preventDefault();
        onClose();
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelected((s) => Math.min(s + 1, flatItems.length - 1));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelected((s) => Math.max(s - 1, 0));
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const it = flatItems[selected];
        if (it) {
          onNavigate?.(it.kind, it);
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flatItems, selected, onClose, onNavigate]);

  let flatIdx = 0;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '15vh',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 560,
          maxHeight: '60vh',
          background: 'var(--bg-elev)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.28)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Search bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <Search size={15} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search chats, projects, skills, connectors, settings…"
            style={{
              flex: 1,
              border: 'none',
              background: 'transparent',
              outline: 'none',
              fontSize: 14,
              color: 'var(--text-1)',
              fontFamily: 'inherit',
            }}
          />
          <span
            style={{
              fontSize: 11,
              color: 'var(--text-3)',
              fontFamily: 'var(--mono)',
              background: 'var(--bg-soft)',
              padding: '2px 6px',
              borderRadius: 4,
            }}
          >
            esc
          </span>
        </div>

        {/* Results */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <div
              style={{
                padding: '32px 0',
                textAlign: 'center',
                color: 'var(--text-3)',
                fontSize: 13,
              }}
            >
              No matches for "{q}"
            </div>
          ) : (
            grouped.map((group) => (
              <div key={group.kind}>
                <div
                  style={{
                    padding: '8px 16px 4px',
                    fontSize: 10.5,
                    fontWeight: 600,
                    color: 'var(--text-3)',
                    textTransform: 'uppercase',
                    letterSpacing: 0.6,
                  }}
                >
                  {KIND_LABEL[group.kind]}
                </div>
                {group.items.map((it) => {
                  const thisIdx = flatIdx++;
                  const Icon = KIND_ICON[it.kind];
                  const isSelected = thisIdx === selected;
                  return (
                    <button
                      key={it.id}
                      onClick={() => {
                        onNavigate?.(it.kind, it);
                        onClose();
                      }}
                      onMouseEnter={() => setSelected(thisIdx)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 16px',
                        border: 'none',
                        background: isSelected ? 'var(--bg-soft)' : 'transparent',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <Icon size={14} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                      <span
                        style={{
                          flex: 1,
                          fontSize: 13,
                          color: 'var(--text-1)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {it.title}
                      </span>
                      {it.sub && (
                        <span style={{ fontSize: 11, color: 'var(--text-3)', flexShrink: 0 }}>
                          {it.sub}
                        </span>
                      )}
                      {isSelected && (
                        <ArrowRight size={12} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            gap: 16,
            padding: '8px 16px',
            borderTop: '1px solid var(--border)',
            fontSize: 11,
            color: 'var(--text-3)',
          }}
        >
          {[
            ['↑↓', 'navigate'],
            ['⏎', 'open'],
            ['⌘K', 'close'],
          ].map(([kbd, label]) => (
            <span key={kbd} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span
                style={{
                  fontFamily: 'var(--mono)',
                  background: 'var(--bg-soft)',
                  padding: '1px 5px',
                  borderRadius: 3,
                }}
              >
                {kbd}
              </span>
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
