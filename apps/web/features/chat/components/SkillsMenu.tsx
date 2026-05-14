'use client';

/**
 * SkillsMenu — lists user-authored skills (sourced from `/api/skills`,
 * which loads via `@agiworkforce/skills`) and lets the user select one to
 * inject into the next message.
 *
 * Progressive disclosure: only metadata (name, description, location) is
 * fetched on mount. The body is loaded on-demand when the user expands a
 * skill — until then, the body section shows "Loading skill body…".
 */

import React, { useEffect, useState } from 'react';

import type { Skill } from '@agiworkforce/skills';

import { cn } from '@shared/lib/utils';

/**
 * `SkillSummary` is `Skill` minus its `body` field — bodies are loaded
 * lazily for progressive disclosure. `location` and `source` carry the
 * filesystem path and precedence-source string from the shared package's
 * `Skill` type so the consumer UI stays in sync with server-side parsing.
 */
interface SkillSummary {
  name: Skill['name'];
  description: Skill['description'];
  /** Skill body — undefined until the user expands the row. */
  body?: Skill['body'];
  location: Skill['filePath'];
  source: Skill['source'];
}

interface SkillsMenuProps {
  query: string;
  onSelect: (skill: SkillSummary) => void;
  onClose: () => void;
}

interface SkillsListResponse {
  skills: Array<Omit<SkillSummary, 'body'>>;
}

interface SkillBodyResponse {
  body: string;
}

export function SkillsMenu({ query, onSelect, onClose }: SkillsMenuProps): React.JSX.Element {
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [expandedSkillName, setExpandedSkillName] = useState<string | null>(null);
  const [bodyLoading, setBodyLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/skills');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as SkillsListResponse;
        if (!cancelled) setSkills(json.skills);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = skills.filter(
    (s) =>
      query === '' ||
      s.name.toLowerCase().includes(query.toLowerCase()) ||
      s.description.toLowerCase().includes(query.toLowerCase()),
  );

  async function handleExpand(skill: SkillSummary): Promise<void> {
    if (skill.body !== undefined) {
      setExpandedSkillName(skill.name === expandedSkillName ? null : skill.name);
      return;
    }
    setBodyLoading(skill.name);
    setExpandedSkillName(skill.name);
    try {
      const res = await fetch(`/api/skills/${encodeURIComponent(skill.name)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as SkillBodyResponse;
      setSkills((prev) => prev.map((s) => (s.name === skill.name ? { ...s, body: json.body } : s)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBodyLoading(null);
    }
  }

  if (error) {
    return (
      <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
        Failed to load skills: {error}
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="rounded-md border border-border bg-card p-3 text-sm text-muted-foreground">
        No skills available. Create skills under <code>~/.claude/skills/</code> or your
        project&apos;s <code>.claude/skills/</code>.
      </div>
    );
  }

  return (
    <div
      role="listbox"
      aria-label="Skills"
      className="overflow-hidden rounded-md border border-border bg-card shadow-md"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          onClose();
        } else if (e.key === 'ArrowDown') {
          setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
          e.preventDefault();
        } else if (e.key === 'ArrowUp') {
          setActiveIndex((i) => Math.max(i - 1, 0));
          e.preventDefault();
        } else if (e.key === 'Enter') {
          const selected = filtered[activeIndex];
          if (selected) onSelect(selected);
          e.preventDefault();
        }
      }}
    >
      {filtered.map((skill, idx) => {
        const isActive = idx === activeIndex;
        const isExpanded = expandedSkillName === skill.name;
        return (
          <div
            key={skill.name}
            role="option"
            aria-selected={isActive}
            className={cn(
              'border-b border-border px-3 py-2 last:border-b-0',
              isActive && 'bg-accent',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <button type="button" onClick={() => onSelect(skill)} className="flex-1 text-left">
                <div className="font-medium">{skill.name}</div>
                <div className="text-xs text-muted-foreground">{skill.description}</div>
              </button>
              <button
                type="button"
                aria-label={isExpanded ? 'Collapse skill body' : 'Expand skill body'}
                onClick={() => {
                  void handleExpand(skill);
                }}
                className="rounded px-2 py-1 text-xs hover:bg-accent"
              >
                {isExpanded ? '▾' : '▸'}
              </button>
            </div>
            {isExpanded ? (
              <div className="mt-2 rounded bg-muted/50 p-2 text-xs">
                {bodyLoading === skill.name ? (
                  <span className="text-muted-foreground">Loading skill body…</span>
                ) : (
                  <pre className="whitespace-pre-wrap break-words font-mono">{skill.body}</pre>
                )}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
