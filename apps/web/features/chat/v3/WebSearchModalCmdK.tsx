'use client';

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
import { useChatStore } from '@/stores/unified/chat/chatStore';
import type { ConversationSummary } from '@/stores/unified/chat/types';

interface SearchItem {
  kind: 'chat' | 'project' | 'skill' | 'connector' | 'setting';
  id: string;
  title: string;
  sub?: string;
}

const STATIC_ITEMS: SearchItem[] = [
  { kind: 'project', id: 'p-sales', title: 'Sales pipeline', sub: 'Project' },
  { kind: 'skill', id: 's-humanizer', title: 'Humanizer', sub: 'Skill' },
  { kind: 'skill', id: 's-brand', title: 'Brand guidelines', sub: 'Skill' },
  { kind: 'connector', id: 'cn-gmail', title: 'Gmail', sub: 'Connector' },
  { kind: 'connector', id: 'cn-github', title: 'GitHub', sub: 'Connector' },
  { kind: 'setting', id: 'st-voice', title: 'Voice settings', sub: 'Settings' },
  { kind: 'setting', id: 'st-byok', title: 'BYOK and local models', sub: 'Settings' },
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

function formatAge(updatedAt: Date | undefined | null): string {
  if (!updatedAt) return '';
  const now = Date.now();
  const age = now - updatedAt.getTime();
  const DAY = 86_400_000;
  if (age < DAY) return 'Today';
  if (age < 2 * DAY) return 'Yesterday';
  if (age < 7 * DAY) return 'Past week';
  return 'Past month';
}

export interface WebSearchModalCmdKProps {
  onClose: () => void;
  onNavigate?: (dest: string, item: SearchItem) => void;
}

export function WebSearchModalCmdK({ onClose, onNavigate }: WebSearchModalCmdKProps) {
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const conversations = useChatStore((s) => s.conversations);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const allItems = useMemo<SearchItem[]>(() => {
    const chatItems: SearchItem[] = conversations.slice(0, 20).map((c: ConversationSummary) => ({
      kind: 'chat' as const,
      id: c.id,
      title: c.title || 'Untitled',
      sub: formatAge(c.updatedAt),
    }));
    return [...chatItems, ...STATIC_ITEMS];
  }, [conversations]);

  const filtered = useMemo<SearchItem[]>(() => {
    if (!q.trim()) return allItems.slice(0, 14);
    const qq = q.toLowerCase();
    return allItems.filter((it) => it.title.toLowerCase().includes(qq));
  }, [q, allItems]);

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
      if (e.key === 'Escape' || ((e.metaKey || e.ctrlKey) && e.key === 'k')) {
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
            placeholder="Search chats, projects, skills, connectors, settings..."
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
              No matches for &ldquo;{q}&rdquo;
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
            ['Esc', 'close'],
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
