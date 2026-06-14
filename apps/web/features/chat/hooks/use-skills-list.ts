'use client';

import { useState, useEffect } from 'react';

export interface SkillItem {
  name: string;
  description: string;
  body?: string;
  source: string;
}

interface SkillsListResponse {
  skills: Array<Omit<SkillItem, 'body'>>;
}

interface SkillBodyResponse {
  body: string;
}

export interface UseSkillsListResult {
  skills: SkillItem[];
  loading: boolean;
  error: string | null;
  loadBody: (skillName: string) => Promise<void>;
}

/**
 * Shared hook for browsing skills. Fetches metadata from /api/skills on mount
 * and lazily loads skill bodies on demand. Used by DirectoryModal and CustomizePage.
 * (SkillsMenu in the composer uses its own local fetch for the list-picker UX.)
 */
export function useSkillsList(): UseSkillsListResult {
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/skills');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as SkillsListResponse;
        if (!cancelled) {
          setSkills(json.skills);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadBody(skillName: string): Promise<void> {
    const existing = skills.find((s) => s.name === skillName);
    if (existing?.body !== undefined) return;
    try {
      const res = await fetch(`/api/skills/${encodeURIComponent(skillName)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as SkillBodyResponse;
      setSkills((prev) => prev.map((s) => (s.name === skillName ? { ...s, body: json.body } : s)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return { skills, loading, error, loadBody };
}
