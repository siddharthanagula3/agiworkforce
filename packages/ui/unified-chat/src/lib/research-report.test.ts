import { describe, expect, it } from 'vitest';

import {
  FOLLOW_UP_GROUNDING_CHARS,
  researchReportFilename,
  researchReportFollowUpPrompt,
  researchReportToArtifact,
  researchReportToMarkdown,
  type ResearchReportDocument,
} from './research-report';

function makeReport(overrides: Partial<ResearchReportDocument> = {}): ResearchReportDocument {
  return {
    title: 'Node.js release status',
    summary: 'Node 24 is the active LTS line.',
    content: '## Overview\n\nNode 24 is LTS [1]. Node 26 is Current [2].',
    citations: [
      {
        id: '1',
        title: 'nodejs.org releases',
        url: 'https://nodejs.org/en/about/previous-releases',
        accessedAt: '2026-08-05T10:00:00.000Z',
      },
      {
        id: '2',
        title: 'Node blog',
        url: 'https://nodejs.org/en/blog',
        accessedAt: '2026-08-05T10:00:00.000Z',
      },
    ],
    keyFindings: ['v24.18.0 is LTS', 'v26.5.0 is Current'],
    ...overrides,
  };
}

describe('researchReportToMarkdown', () => {
  it('assembles title, summary, findings, body, and numbered sources', () => {
    expect(researchReportToMarkdown(makeReport())).toBe(
      [
        '# Node.js release status',
        'Node 24 is the active LTS line.',
        '## Key findings\n- v24.18.0 is LTS\n- v26.5.0 is Current',
        '## Overview\n\nNode 24 is LTS [1]. Node 26 is Current [2].',
        '## Sources\n1. [nodejs.org releases](https://nodejs.org/en/about/previous-releases)\n2. [Node blog](https://nodejs.org/en/blog)',
      ].join('\n\n'),
    );
  });

  it('omits sections the report does not have instead of emitting empty ones', () => {
    const markdown = researchReportToMarkdown(
      makeReport({ summary: '', keyFindings: [], citations: [] }),
    );
    expect(markdown).not.toContain('## Key findings');
    expect(markdown).not.toContain('## Sources');
    expect(researchReportToMarkdown(makeReport({ keyFindings: undefined }))).not.toContain(
      '## Key findings',
    );
  });
});

describe('researchReportFilename', () => {
  it('slugifies the report title and falls back when it is empty', () => {
    expect(researchReportFilename(makeReport())).toBe('node-js-release-status');
    expect(researchReportFilename(makeReport({ title: '   ' }))).toBe('research-report');
  });

  it('joins words across runs of separators and drops them at both ends', () => {
    expect(researchReportFilename({ title: '--Node -- JS: 2026!--' })).toBe('node-js-2026');
    expect(researchReportFilename({ title: `Node${'-'.repeat(100_000)}js` })).toBe('node-js');
    expect(researchReportFilename({ title: '!!!' })).toBe('research-report');
  });
});

describe('researchReportToArtifact', () => {
  it('carries the whole markdown document under the report title', () => {
    expect(researchReportToArtifact(makeReport())).toEqual({
      title: 'Node.js release status',
      language: 'md',
      content: researchReportToMarkdown(makeReport()),
    });
    expect(researchReportToArtifact(makeReport({ title: '' })).title).toBe('Research report');
  });
});

describe('researchReportFollowUpPrompt', () => {
  it('grounds the question in the whole report when it fits', () => {
    const prompt = researchReportFollowUpPrompt(makeReport(), '  and then?  ');
    expect(prompt).toContain(`<research_report>\n\n${researchReportToMarkdown(makeReport())}`);
    expect(prompt.endsWith('</research_report>\n\nand then?')).toBe(true);
    expect(prompt).not.toContain('[report truncated');
  });

  it('declares the cut when the report is too long to carry whole', () => {
    const prompt = researchReportFollowUpPrompt(
      makeReport({ content: 'x'.repeat(9_000) }),
      'and then?',
    );
    expect(FOLLOW_UP_GROUNDING_CHARS).toBe(8_000);
    expect(prompt).toContain('[report truncated after 8000 characters]');
    expect(prompt).toContain('and then?');
  });
});
