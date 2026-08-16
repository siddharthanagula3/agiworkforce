'use client';

import { useState, useEffect } from 'react';
import {
  ManagedSkillsResponseSchema,
  type ManagedSkillSummary,
} from '@agiworkforce/cloud-contracts';
import { SKILL_CATALOG_CHANGED_EVENT } from '@shared/events/skill-catalog-events';

export type SkillItem = Pick<ManagedSkillSummary, 'name' | 'description' | 'source'>;

export interface UseSkillsListResult {
  skills: SkillItem[];
  loading: boolean;
  error: string | null;
}

export function useSkillsList(): UseSkillsListResult {
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/skills', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const parsed = ManagedSkillsResponseSchema.safeParse(await res.json());
        if (!parsed.success) throw new Error('Invalid skills response');
        if (!cancelled) {
          setSkills(parsed.data.skills.filter((skill) => skill.lifecycle === 'included'));
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    const handleCatalogChanged = () => {
      void load();
    };
    window.addEventListener(SKILL_CATALOG_CHANGED_EVENT, handleCatalogChanged);
    void load();
    return () => {
      cancelled = true;
      window.removeEventListener(SKILL_CATALOG_CHANGED_EVENT, handleCatalogChanged);
    };
  }, []);

  return { skills, loading, error };
}
