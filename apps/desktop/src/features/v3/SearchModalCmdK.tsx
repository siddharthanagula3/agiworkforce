import { useState, useMemo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Search,
  MessageSquare,
  FolderOpen,
  Wrench,
  Plug,
  Settings,
  ArrowRight,
} from 'lucide-react';
import {
  useGlobalSearch,
  type SearchResultItem,
  type SearchResultGroup,
} from '../../hooks/useGlobalSearch';

const GROUP_ICON: Record<SearchResultGroup['group'], React.ElementType> = {
  Chats: MessageSquare,
  Projects: FolderOpen,
  Skills: Wrench,
  Connectors: Plug,
  Settings: Settings,
};

export interface SearchModalCmdKProps {
  onClose: () => void;
  onNavigate?: (dest: string, item: SearchResultItem) => void;
}

export function SearchModalCmdK({ onClose, onNavigate }: SearchModalCmdKProps) {
  const { t } = useTranslation('v3');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const groups = useGlobalSearch(q);

  const flatItems = useMemo(() => groups.flatMap((g) => g.items), [groups]);

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
          it.onClick?.();
          onNavigate?.(it.id, it);
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
            placeholder={t('search.placeholder')}
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
            {t('search.esc')}
          </span>
        </div>

        {/* Results */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {flatItems.length === 0 ? (
            <div
              style={{
                padding: '32px 0',
                textAlign: 'center',
                color: 'var(--text-3)',
                fontSize: 13,
              }}
            >
              {q ? t('search.noMatches', { query: q }) : t('search.noResults')}
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.group}>
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
                  {group.group}
                </div>
                {group.items.map((it) => {
                  const thisIdx = flatIdx++;
                  const Icon = GROUP_ICON[group.group];
                  const isSelected = thisIdx === selected;
                  return (
                    <button
                      key={it.id}
                      onClick={() => {
                        it.onClick?.();
                        onNavigate?.(it.id, it);
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
                      {it.subtitle && (
                        <span style={{ fontSize: 11, color: 'var(--text-3)', flexShrink: 0 }}>
                          {it.subtitle}
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
            ['↑↓', t('search.navigate')],
            ['⏎', t('search.open')],
            ['⌘K', t('search.closeKbd')],
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
