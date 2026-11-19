import { describe, expect, it } from 'vitest';
import { DEFAULT_RESEARCH_DELIVERABLE } from '@agiworkforce/types';

import {
  MAX_RUN_CONFIG_ENTRIES,
  parseResearchPlanQuestions,
  parseResearchRunConfig,
  researchAnswersGuidance,
} from './research-plan';

describe('clarifying questions on the research plan', () => {
  it('reads up to three questions from the plan event', () => {
    expect(
      parseResearchPlanQuestions({
        steps: [],
        questions: [' Which country? ', '', 7, 'B?', 'C?', 'D?'],
      }),
    ).toEqual(['Which country?', 'B?', 'C?']);
    expect(parseResearchPlanQuestions({ steps: [] })).toEqual([]);
    expect(parseResearchPlanQuestions({ questions: ['x'.repeat(250)] })[0]).toHaveLength(200);
  });

  it('turns only the answered questions into guidance for the run', () => {
    expect(researchAnswersGuidance(['Which country?', 'New or used?'], ['Norway', ' '])).toBe(
      'Q: Which country?\nA: Norway',
    );
    expect(researchAnswersGuidance(['Which country?', 'New or used?'], [' Norway ', 'Used'])).toBe(
      'Q: Which country?\nA: Norway\n\nQ: New or used?\nA: Used',
    );
    expect(researchAnswersGuidance(['Which country?'], [''])).toBeNull();
  });
});

describe('parseResearchRunConfig', () => {
  it('reads the sources and deliverable the run was started with', () => {
    expect(
      parseResearchRunConfig({
        run: {
          files: true,
          allow_domains: ['nodejs.org', '', 3],
          deny_domains: ['example.com'],
          connectors: ['github'],
          deliverable: { depth: 'unknown-depth', saveToLibrary: true },
        },
      }),
    ).toEqual({
      sources: {
        files: true,
        allowDomains: ['nodejs.org'],
        denyDomains: ['example.com'],
        connectors: ['github'],
      },
      deliverable: { ...DEFAULT_RESEARCH_DELIVERABLE, saveToLibrary: true },
    });
  });

  it('bounds the lists and rejects a payload without a run', () => {
    const many = Array.from({ length: MAX_RUN_CONFIG_ENTRIES + 5 }, (_, index) => `d${index}.com`);
    expect(parseResearchRunConfig({ run: { allow_domains: many } })?.sources.allowDomains).toEqual(
      many.slice(0, MAX_RUN_CONFIG_ENTRIES),
    );
    expect(parseResearchRunConfig({ run: { files: 'yes' } })?.sources.files).toBe(false);
    expect(parseResearchRunConfig({})).toBeNull();
    expect(parseResearchRunConfig(null)).toBeNull();
  });
});
