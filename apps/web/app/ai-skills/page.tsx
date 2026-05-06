import { redirect } from 'next/navigation';

/**
 * /ai-skills redirects to the unified Skills Library per D4 unification.
 * The marketing editorial page remains at /features/ai-skills.
 */
export default function AiSkillsAppRedirect() {
  redirect('/skills?tab=agents');
}
