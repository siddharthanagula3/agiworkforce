import { redirect } from 'next/navigation';

export default function AiSkillsAppRedirect() {
  redirect('/skills?tab=agents');
}
