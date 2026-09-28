'use client';

import { Ledger, Section, Stack } from '@/features/marketing/components/system';
import { SignedOutSurface } from '@shared/components/marketing/SignedOutSurface';

export interface PublicSkill {
  name: string;
  description: string;
}

export function SignedOutSkills({ skills }: { skills: readonly PublicSkill[] | null }) {
  return (
    <SignedOutSurface
      eyebrow="Skills"
      heading="Skills live in your workspace"
      signInHref="/login?redirectTo=%2Fskills"
      signInLabel="Sign in to use skills"
      secondary={{ href: '/features/plugins', label: 'What plugins can do' }}
      after={
        <Section id="skills-directory" labelledBy="agi-skills-directory-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-skills-directory-title">
              Built-in skills.
            </h2>
            {skills === null ? (
              <p className="agi-ds-prose" role="status">
                The skill catalogue is temporarily unreachable. Reload in a moment.
              </p>
            ) : (
              <Ledger
                caption="Built-in skills"
                rows={skills.map((skill) => ({ label: skill.name, value: skill.description }))}
              />
            )}
          </Stack>
        </Section>
      }
    >
      A skill is a reusable instruction set the assistant loads on demand: a house style, a review
      checklist, a domain glossary. Every account starts with the built-in skills below; signing in
      lets you turn them on or off, install more and write your own.
    </SignedOutSurface>
  );
}
