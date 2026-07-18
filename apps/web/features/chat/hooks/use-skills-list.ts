'use client';

import { useState, useEffect } from 'react';
import { z } from 'zod';

export interface SkillItem {
  name: string;
  description: string;
  source: string;
}

const SkillsListResponseSchema = z.object({
  skills: z.array(
    z.object({
      name: z.string().min(1).max(200),
      description: z.string(),
      source: z.string().min(1),
    }),
  ),
});

export interface UseSkillsListResult {
  skills: SkillItem[];
  loading: boolean;
  error: string | null;
}

/**
 * Fetch path-free skill metadata for selection. Managed activation remains
 * server-owned; explicit customization previews use the authenticated body
 * endpoint directly.
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
        const parsed = SkillsListResponseSchema.safeParse(await res.json());
        if (!parsed.success) throw new Error('Invalid skills response');
        if (!cancelled) {
          setSkills(parsed.data.skills);
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

  return { skills, loading, error };
}
