import { redirect } from 'next/navigation';

// /features/ai-skills — redirected to /skills (the canonical skills directory).
export default function FeaturesAiSkillsPage(): never {
  redirect('/skills');
}
