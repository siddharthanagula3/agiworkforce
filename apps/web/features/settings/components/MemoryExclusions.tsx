'use client';

/**
 * Sensitive-data exclusions for account memory.
 *
 * Terms listed here are matched against every auto-memory candidate on the
 * SERVER, in `persistManagedAutoMemoryFacts`, before anything is written. That
 * placement is the point: filtering in the UI would leave the fact stored and
 * merely hidden, which tells the user something was excluded while it sits in
 * the database and keeps being fed to the model.
 *
 * The copy below is deliberately explicit that this governs NEW memories only.
 * Existing entries are listed underneath with their own delete control; silently
 * purging matching rows on save would delete user data on a rule they had no
 * chance to preview.
 *
 * Stored in the `memory` preference namespace (`user_settings.settings->'memory'`),
 * the same mechanism the capabilities and general namespaces use — no migration.
 *
 * DELIBERATELY NOT on `CLOUD_SAFE_SETTINGS_NAMESPACES`. That allowlist mirrors
 * settings to Desktop Managed Cloud, and Desktop's local memory is a different
 * store reached by a different write path — this filter does not run there.
 * Syncing the list would put the terms on a surface where they are not
 * enforced, which is the false-assurance shape this control exists to avoid.
 * These exclusions govern account memory written by the managed cloud chat
 * path, which is the only place `persistManagedAutoMemoryFacts` runs.
 */

import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';

import {
  fetchStoredPreferenceNamespace,
  savePreferenceNamespace,
} from '@/app/settings/_lib/preferences-client';

const PREF_NAMESPACE = 'memory';

/** Mirrors the server-side bounds in `managed-memory-context-service.ts`. */
const MAX_TERMS = 50;
const MIN_TERM_LENGTH = 3;

interface MemoryPreferences {
  excludedTerms?: unknown;
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

  const persist = useCallback(async (next: string[]) => {
    setSaving(true);
    try {
      await savePreferenceNamespace(PREF_NAMESPACE, { excludedTerms: next });
      setTerms(next);
      setError(null);
    } catch (cause) {
      // The list is NOT updated locally on failure. Showing the term as saved
      // when the server rejected it is the exact false-assurance this feature
      // exists to avoid.
      setError(cause instanceof Error ? cause.message : 'Could not save exclusions');
    } finally {
      setSaving(false);
    }
  }, []);

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
    void persist([...terms, term]);
  }, [draft, terms, persist]);

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
                  onClick={() => void persist(terms.filter((existing) => existing !== term))}
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
    </section>
  );
}

export default MemoryExclusions;
