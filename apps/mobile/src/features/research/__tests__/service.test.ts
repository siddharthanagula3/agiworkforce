import { mapResearchReport, mapResearchReportsResponse, researchReportLabel } from '../service';
import { extractReportSections } from '../reportSections';

const ROW = {
  id: 'rep-1',
  requestId: 'req-1',
  conversationId: 'conv-1',
  title: 'State of the spec',
  query: 'what is the state of the spec',
  summary: 'It moved.',
  content: '# Overview\n\nBody\n\n## Detail\n\nMore',
  citations: [
    { id: 'c1', title: 'Spec', url: 'https://spec.example', accessedAt: '2026-09-01T00:00:00Z' },
    { title: '', url: 'https://two.example', accessedAt: '' },
    { title: 'No url' },
  ],
  steps: [
    { id: 's1', type: 'search', description: 'Find it', status: 'completed' },
    { id: 's2', type: 'nonsense', description: 'Bad', status: 'completed' },
  ],
  keyFindings: ['One', '', 2],
  status: 'completed',
  sourcesConsulted: '7',
  totalDurationMs: 44000,
  model: 'a-model',
  createdAt: '2026-09-10T12:00:00Z',
};

describe('mapResearchReport', () => {
  it('maps a row to the fields the list and detail render', () => {
    const report = mapResearchReport(ROW);
    expect(report).not.toBeNull();
    expect(report?.id).toBe('rep-1');
    expect(report?.requestId).toBe('req-1');
    expect(report?.conversationId).toBe('conv-1');
    expect(report?.sourcesConsulted).toBe(7);
    expect(report?.totalDurationMs).toBe(44000);
    expect(report?.model).toBe('a-model');
    expect(report?.status).toBe('completed');
  });

  it('drops citations with no url and keeps the url as a fallback title', () => {
    const report = mapResearchReport(ROW);
    expect(report?.citations).toHaveLength(2);
    expect(report?.citations[1]?.title).toBe('https://two.example');
  });

  it('drops steps and findings that do not match the contract', () => {
    const report = mapResearchReport(ROW);
    expect(report?.steps.map((step) => step.id)).toEqual(['s1']);
    expect(report?.keyFindings).toEqual(['One']);
  });

  it('falls back to failed for an unknown status', () => {
    expect(mapResearchReport({ ...ROW, status: 'weird' })?.status).toBe('failed');
  });

  it('rejects a row with no id or request id', () => {
    expect(mapResearchReport({ ...ROW, id: '' })).toBeNull();
    expect(mapResearchReport({ ...ROW, requestId: undefined })).toBeNull();
    expect(mapResearchReport(null)).toBeNull();
  });
});

describe('mapResearchReportsResponse', () => {
  it('maps the reports array and skips unusable rows', () => {
    expect(mapResearchReportsResponse({ reports: [ROW, null, { id: 'x' }] })).toHaveLength(1);
  });

  it('returns an empty list when the body carries no reports array', () => {
    expect(mapResearchReportsResponse({})).toEqual([]);
    expect(mapResearchReportsResponse({ reports: 'nope' })).toEqual([]);
    expect(mapResearchReportsResponse(null)).toEqual([]);
  });
});

describe('researchReportLabel', () => {
  it('prefers the title, then the question, then a placeholder', () => {
    const report = mapResearchReport(ROW)!;
    expect(researchReportLabel(report)).toBe('State of the spec');
    expect(researchReportLabel({ ...report, title: '  ' })).toBe('what is the state of the spec');
    expect(researchReportLabel({ ...report, title: '', query: '' })).toBe('Untitled report');
  });
});

describe('extractReportSections', () => {
  it('lists headings in document order and ignores fenced code', () => {
    const sections = extractReportSections(
      '# One\n\n```\n# not a heading\n```\n\n## Two\n\n## Two\n',
    );
    expect(sections.map((section) => section.text)).toEqual(['One', 'Two', 'Two']);
    expect(sections.map((section) => section.id)).toEqual(['one', 'two', 'two-1']);
    expect(sections.map((section) => section.level)).toEqual([1, 2, 2]);
  });

  it('returns nothing for a body with no headings', () => {
    expect(extractReportSections('just prose')).toEqual([]);
    expect(extractReportSections('')).toEqual([]);
  });
});
