import { skillsMatchingMention, skillTurnTools } from '@/src/features/skills/skillRequirements';
import type { ManagedSkillSummary } from '@/src/features/skills/service';

function skill(overrides: Partial<ManagedSkillSummary>): ManagedSkillSummary {
  return {
    name: 'alpha',
    description: '',
    source: 'bundled',
    lifecycle: 'included',
    downloadable: false,
    ...overrides,
  };
}

describe('which tools a skill turns on for its turn', () => {
  it('maps the office file tool and the code tool, and nothing else', () => {
    expect(skillTurnTools(['create_office_file'])).toEqual({
      officeCreation: true,
      codeExecution: false,
    });
    expect(skillTurnTools(['execute_code', 'web_search'])).toEqual({
      officeCreation: false,
      codeExecution: true,
    });
    expect(skillTurnTools(['create_office_file', 'execute_code'])).toEqual({
      officeCreation: true,
      codeExecution: true,
    });
    expect(skillTurnTools(undefined)).toEqual({ officeCreation: false, codeExecution: false });
    expect(skillTurnTools(['web_search'])).toEqual({ officeCreation: false, codeExecution: false });
  });
});

describe('skills offered by a typed mention', () => {
  const skills = [
    skill({ name: 'pdf-forms', title: 'PDF forms' }),
    skill({ name: 'code-review' }),
    skill({ name: 'draft-skill', lifecycle: 'draft' }),
    skill({ name: 'pdf-merge' }),
  ];

  it('matches by name or title, ignoring case, and leaves out skills that are not ready', () => {
    expect(skillsMatchingMention(skills, 'PDF').map((s) => s.name)).toEqual([
      'pdf-forms',
      'pdf-merge',
    ]);
    expect(skillsMatchingMention(skills, 'forms').map((s) => s.name)).toEqual(['pdf-forms']);
    expect(skillsMatchingMention(skills, 'draft')).toEqual([]);
  });

  it('shows at most four for a bare @', () => {
    const many = Array.from({ length: 7 }, (_, index) => skill({ name: `skill-${index}` }));
    expect(skillsMatchingMention(many, '')).toHaveLength(4);
  });
});
