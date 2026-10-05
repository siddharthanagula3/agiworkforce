import { Suspense } from 'react';

import { SettingsModalRedirect } from '@/features/settings/components/SettingsModalRedirect';
import { buildMetadata } from '@/lib/seo/metadata';
import { getRequestIdentity } from '@/lib/server/identity';
import { getManagedSkillCatalog } from '@/lib/services/skill-catalog-service';
import { reportUnreadableIdentity } from '@/lib/server/unreadable-identity';
import { SignedOutSkills, type PublicSkill } from './SignedOutSkills';

export const metadata = buildMetadata({
  title: 'Skills',
  description:
    'The built-in skills every AGI Workforce account starts with: reusable instruction sets the assistant loads on demand.',
  path: '/skills',
});

export const dynamic = 'force-dynamic';

async function isSignedIn(): Promise<boolean> {
  try {
    return (await getRequestIdentity()).isSignedIn;
  } catch (error) {
    reportUnreadableIdentity(error, '/skills');
    return false;
  }
}

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
  if (await isSignedIn()) {
    return (
      <Suspense>
        <SettingsModalRedirect section="skills" />
      </Suspense>
    );
  }

  return <SignedOutSkills skills={await loadPublicSkills()} />;
}
