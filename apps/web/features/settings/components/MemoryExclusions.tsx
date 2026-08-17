'use client';

import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';

import {
  fetchStoredPreferenceNamespace,
  savePreferenceNamespace,
} from '@/app/settings/_lib/preferences-client';

const PREF_NAMESPACE = 'memory';

const MAX_TERMS = 50;
const MIN_TERM_LENGTH = 3;

interface MemoryPreferences {
  excludedTerms?: unknown;
  suppressedSources?: unknown;
}

const MEMORY_SOURCES = [
  { id: 'auto', label: 'Automatically captured from chats' },
  { id: 'web', label: 'Saved on the web app' },
  { id: 'desktop', label: 'Saved on Desktop' },
  { id: 'mobile', label: 'Saved on mobile' },
] as const;

type MemorySourceId = (typeof MEMORY_SOURCES)[number]['id'];

function normalizeSources(value: unknown): MemorySourceId[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<MemorySourceId>();
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const known = MEMORY_SOURCES.find((source) => source.id === entry.trim().toLowerCase());
    if (known) seen.add(known.id);
  }
  return [...seen];
}

function normalize(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const term = entry.trim().toLowerCase();
    if (term.length < MIN_TERM_LENGTH) continue;
    seen.add(term);
    if (seen.size >= MAX_TERMS) break;
  }
  return [...seen];
}

export function MemoryExclusions() {
  const [terms, setTerms] = useState<string[]>([]);
  const [suppressedSources, setSuppressedSources] = useState<MemorySourceId[]>([]);
  const [draft, setDraft] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchStoredPreferenceNamespace<MemoryPreferences>(PREF_NAMESPACE)
      .then((stored) => {
        if (cancelled) return;
        setTerms(normalize(stored.excludedTerms));
        setSuppressedSources(normalizeSources(stored.suppressedSources));
        setError(null);
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Could not load exclusions');
        }
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(
    async (next: { excludedTerms: string[]; suppressedSources: MemorySourceId[] }) => {
      setSaving(true);
      try {
        await savePreferenceNamespace(PREF_NAMESPACE, next);
        setTerms(next.excludedTerms);
        setSuppressedSources(next.suppressedSources);
        setError(null);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not save exclusions');
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  const toggleSource = useCallback(
    (source: MemorySourceId) => {
      const next = suppressedSources.includes(source)
        ? suppressedSources.filter((existing) => existing !== source)
        : [...suppressedSources, source];
      void persist({ excludedTerms: terms, suppressedSources: next });
    },
    [persist, suppressedSources, terms],
  );

  const addTerm = useCallback(() => {
    const term = draft.trim().toLowerCase();
    if (term.length < MIN_TERM_LENGTH) {
      setError(
        `Enter at least ${MIN_TERM_LENGTH} characters — shorter terms match almost anything.`,
      );
      return;
    }
    if (terms.includes(term)) {
      setDraft('');
      return;
    }
    if (terms.length >= MAX_TERMS) {
      setError(`You can store up to ${MAX_TERMS} exclusions.`);
      return;
    }
    setDraft('');
    void persist({ excludedTerms: [...terms, term], suppressedSources });
  }, [draft, terms, suppressedSources, persist]);

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)', margin: '0 0 4px' }}>
          Never remember
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>
          New memories containing any of these terms are discarded before they are saved. Matching
          is case-insensitive. This applies to <strong>new</strong> memories only — anything already
          saved stays until you delete it below.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              addTerm();
            }
          }}
          placeholder="e.g. my home address"
          aria-label="Term to never remember"
          disabled={!loaded || saving}
          maxLength={100}
          style={{
            flex: 1,
            height: 34,
            padding: '0 10px',
            fontSize: 13,
            color: 'var(--text-1)',
            background: 'var(--bg-base)',
            border: '1px solid var(--settings-border)',
            borderRadius: 'var(--radius-md)',
          }}
        />
        <button
          type="button"
          onClick={addTerm}
          disabled={!loaded || saving || draft.trim().length === 0}
          style={{
            height: 34,
            padding: '0 12px',
            fontSize: 13,
            color: 'var(--text-1)',
            background: 'transparent',
            border: '1px solid var(--settings-border)',
            borderRadius: 'var(--radius-md)',
            cursor: saving ? 'default' : 'pointer',
          }}
        >
          Add
        </button>
      </div>

      {error !== null && (
        <p role="alert" style={{ fontSize: 12, color: 'var(--danger, #dc2626)', margin: 0 }}>
          {error}
        </p>
      )}

      {loaded && terms.length === 0 && (
        <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>
          No exclusions yet. Everything the assistant learns is eligible to be remembered.
        </p>
      )}

      {terms.length > 0 && (
        <ul
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            listStyle: 'none',
            padding: 0,
            margin: 0,
          }}
        >
          {terms.map((term) => (
            <li key={term}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '3px 6px 3px 10px',
                  fontSize: 12,
                  color: 'var(--text-1)',
                  background: 'var(--bg-base)',
                  border: '1px solid var(--settings-border)',
                  borderRadius: 999,
                }}
              >
                {term}
                <button
                  type="button"
                  onClick={() =>
                    void persist({
                      excludedTerms: terms.filter((existing) => existing !== term),
                      suppressedSources,
                    })
                  }
                  disabled={saving}
                  aria-label={`Stop excluding ${term}`}
                  style={{
                    display: 'inline-flex',
                    background: 'transparent',
                    border: 'none',
                    padding: 2,
                    cursor: saving ? 'default' : 'pointer',
                    color: 'var(--text-3)',
                  }}
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)', margin: '12px 0 4px' }}>
          Where memories come from
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>
          Suppress a source to keep its memories out of every answer. They stay saved and stay
          listed below, and suppressing automatic capture also stops new ones being written.
        </p>
      </div>

      <ul
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          listStyle: 'none',
          padding: 0,
          margin: 0,
        }}
      >
        {MEMORY_SOURCES.map((source) => (
          <li key={source.id}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 13,
                color: 'var(--text-1)',
              }}
            >
              <input
                type="checkbox"
                checked={suppressedSources.includes(source.id)}
                disabled={!loaded || saving}
                onChange={() => toggleSource(source.id)}
              />
              Suppress: {source.label}
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default MemoryExclusions;
