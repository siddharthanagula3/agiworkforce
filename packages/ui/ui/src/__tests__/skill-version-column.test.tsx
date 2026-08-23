import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SettingsModal } from '../settings-modal/SettingsModal';
import type { SettingsSkill } from '../settings-modal/types';

function skill(over: Partial<SettingsSkill> = {}): SettingsSkill {
  return {
    id: over.id ?? 'skill-creator',
    name: over.name ?? 'Skill creator',
    description: 'Draft a small AGI skill bundle',
    source: 'bundled',
    tab: 'prompts',
    ...over,
  } as SettingsSkill;
}

function mount(skills: SettingsSkill[]) {
  return render(
    <SettingsModal
      open
      onClose={vi.fn()}
      activeSection="skills"
      onSectionChange={vi.fn()}
      sectionContent={{}}
      adapter={{ skills, skillsLoading: false } as never}
    />,
  );
}

// The reference shows "Last updated". The skills source exposes no modified
// time, so a date here would be invented. The bundle's own frontmatter version
// is real and answers the same question.
describe('skill version column', () => {
  it('shows the version the bundle declares', () => {
    mount([skill({ version: '1.0.0' })]);

    const row = screen.getByText('Skill creator').closest('tr');
    expect(within(row as HTMLElement).getByText('1.0.0')).toBeTruthy();
  });

  it('shows a dash rather than inventing one when the bundle has none', () => {
    mount([skill({ name: 'Unversioned' })]);

    const row = screen.getByText('Unversioned').closest('tr');
    expect(within(row as HTMLElement).getByText('—')).toBeTruthy();
  });

  it('never labels the column as a date it cannot supply', () => {
    mount([skill({ version: '1.0.0' })]);

    expect(screen.queryByText(/last updated/i)).toBeNull();
    expect(screen.getByText('Version')).toBeTruthy();
  });
});
