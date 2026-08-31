'use client';

import { useState, useEffect } from 'react';
import { toUserMessage } from '@/lib/user-error-message';
import { type ManagedSkillSummary } from '@agiworkforce/cloud-contracts';
import {
  loadSkillsCatalog,
  invalidateSkillsCatalog,
} from '@features/skills/services/skills-catalog';
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
        const all = await loadSkillsCatalog();
        if (!cancelled) {
          setSkills(all.filter((skill) => skill.lifecycle === 'included'));
        }
      } catch (err) {
        if (!cancelled) setError(toUserMessage(err, 'Something went wrong.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    const handleCatalogChanged = () => {
      invalidateSkillsCatalog();
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
