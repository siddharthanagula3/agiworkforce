'use client';

/**
 * SkillsMenu -- flat name-only picker for user-authored skills.
 * Body preview and expand/collapse have been removed; the heavy progressive-
 * disclosure version lives in the settings/skills page.
 *
 * Footer row: "Open skills library".
 */

import React, { useEffect, useState } from 'react';

import type { Skill } from '@agiworkforce/skills';

import { cn } from '@shared/lib/utils';

/**
 * `SkillSummary` is `Skill` minus host-only fields. The flat picker does not
 * need body content or filesystem paths.
 */
interface SkillSummary {
  name: Skill['name'];
  description: Skill['description'];
  source: Skill['source'];
}

interface SkillsMenuProps {
  query: string;
  onSelect: (skill: SkillSummary) => void;
  onClose: () => void;
}

interface SkillsListResponse {
  skills: Array<SkillSummary>;
}

export function SkillsMenu({ query, onSelect, onClose }: SkillsMenuProps): React.JSX.Element {
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Internal search box — the flyout is a searchable list (parity with Claude's
  // "+" Skills flyout). Combined with the external `query` prop so a caller can
  // still pre-filter; the typed value narrows further.
  const [search, setSearch] = useState('');

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

  const effectiveQuery = `${query} ${search}`.trim().toLowerCase();
  const matchesQuery = (s: SkillSummary): boolean => {
    if (effectiveQuery === '') return true;
    // Every whitespace-separated term must match name or description.
    return effectiveQuery
      .split(/\s+/)
      .every(
        (term) => s.name.toLowerCase().includes(term) || s.description.toLowerCase().includes(term),
      );
  };
  const filtered = skills.filter(matchesQuery);

  // Keep the active row in range as the search narrows the list.
  useEffect(() => {
    setActiveIndex(0);
  }, [search]);

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive"
      >
        Failed to load skills: {error}
      </div>
    );
  }

  const footer = (
    <div className="border-t border-border/40 pt-1">
      <a
        href="/skills"
        onClick={onClose}
        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
      >
        Open skills library
      </a>
    </div>
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
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
  };

  return (
    <div className="flex w-56 flex-col p-1" onKeyDown={handleKeyDown}>
      <input
        type="text"
        autoFocus
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search skills"
        aria-label="Search skills"
        className="mb-1 w-full rounded-md border border-border/40 bg-transparent px-3 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus:border-border"
      />

      {filtered.length === 0 ? (
        <div className="px-3 py-3 text-sm text-muted-foreground">
          {skills.length === 0
            ? 'No skills installed. Open the skills library to manage available AGI skills.'
            : 'No skills match your search.'}
        </div>
      ) : (
        <div role="listbox" aria-label="Skills" className="py-1">
          {filtered.map((skill, idx) => {
            const isActive = idx === activeIndex;
            return (
              <button
                key={skill.name}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => onSelect(skill)}
                className={cn(
                  'flex w-full items-center rounded-md px-3 py-2 text-left text-sm transition-colors',
                  isActive ? 'bg-muted/60 text-foreground' : 'text-foreground hover:bg-muted/60',
                )}
              >
                {skill.name}
              </button>
            );
          })}
        </div>
      )}
      {footer}
    </div>
  );
}
