'use client';

import { createContext, useContext, useEffect, useState } from 'react';

import {
  loadSkillsCatalog,
  skillAuthoringCapability,
} from '@/features/skills/services/skills-catalog';

/**
 * The request that turns the finished work in a chat into a skill. The gateway
 * offers draft_plugin for it, and the draft card's Save creates the skill.
 */
export const SAVE_AS_SKILL_PROMPT =
  'Turn the work we just finished in this chat into a reusable skill I can use again.';

export interface SaveAsSkill {
  save: () => void;
}

const SaveAsSkillContext = createContext<SaveAsSkill | null>(null);

export const SaveAsSkillProvider = SaveAsSkillContext.Provider;

export function useSaveAsSkill(): SaveAsSkill | null {
  return useContext(SaveAsSkillContext);
}

/** Whether this account may author skills, read from the skills catalogue. */
export function useSkillAuthoringCapability(enabled: boolean): boolean {
  const [capable, setCapable] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    loadSkillsCatalog()
      .then(() => {
        if (live) setCapable(skillAuthoringCapability());
      })
      .catch(() => {
        if (live) setCapable(false);
      });
    return () => {
      live = false;
    };
  }, [enabled]);
  return enabled && capable;
}
