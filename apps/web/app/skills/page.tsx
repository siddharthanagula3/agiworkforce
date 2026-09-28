import { Suspense } from 'react';

import { buildMetadata } from '@/lib/seo/metadata';
import { getManagedSkillCatalog } from '@/lib/services/skill-catalog-service';
import type { PublicSkill } from './SignedOutSkills';
import { SkillsRoute } from './SkillsRoute';

export const metadata = buildMetadata({
  title: 'Skills',
  description:
    'The built-in skills every AGI Workforce account starts with: reusable instruction sets the assistant loads on demand.',
  path: '/skills',
});

export const dynamic = 'force-dynamic';

async function loadPublicSkills(): Promise<PublicSkill[] | null> {
  try {
    const catalog = await getManagedSkillCatalog();
    return catalog
      .map((skill) => ({ name: skill.name, description: skill.description }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return null;
  }
}

export default async function SkillsPage() {
  const skills = await loadPublicSkills();
  return (
    <Suspense>
      <SkillsRoute skills={skills} />
    </Suspense>
  );
}
