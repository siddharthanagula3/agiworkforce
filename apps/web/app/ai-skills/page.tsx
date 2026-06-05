import { redirect } from 'next/navigation';

/**
 * /ai-skills redirects to the unified Skills Library per D4 unification.
 * /features/ai-skills also redirects to the canonical skills directory.
 */
export default function AiSkillsAppRedirect() {
  redirect('/skills?tab=agents');
}
