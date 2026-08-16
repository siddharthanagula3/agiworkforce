import { redirect } from 'next/navigation';

/**
 * This alias used to append a tab query parameter that nothing reads: /skills
 * has no tab state at all. It survived only as a misleading URL in the address
 * bar and in any link someone copied from there.
 */
export default function AiSkillsAppRedirect() {
  redirect('/skills');
}
