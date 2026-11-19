import { extractMarkdownHeadings } from '@agiworkforce/unified-chat/markdown-headings';
import { createReportSectionIds, extractReportSections } from '../reportSections';

jest.mock('@agiworkforce/unified-chat/markdown-headings', () => {
  const actual = jest.requireActual('@agiworkforce/unified-chat/markdown-headings');
  return { ...actual, extractMarkdownHeadings: jest.fn(actual.extractMarkdownHeadings) };
});

const REPORT = [
  '# Overview',
  '',
  '```md',
  '# not a heading',
  '```',
  '',
  '## Findings',
  '## Findings',
  '### **Costs** and `limits`',
  '#### Detail',
  '##### Too deep',
  '## ***',
  '## !!!',
].join('\n');

describe('extractReportSections', () => {
  it('lists exactly the headings the shared reader finds', () => {
    const sections = extractReportSections(REPORT);
    expect(extractMarkdownHeadings).toHaveBeenCalledWith(REPORT);
    expect(sections).toEqual([
      { id: 'overview', text: 'Overview', level: 1 },
      { id: 'findings', text: 'Findings', level: 2 },
      { id: 'findings-1', text: 'Findings', level: 2 },
      { id: 'costs-and-limits', text: 'Costs and limits', level: 3 },
      { id: 'detail', text: 'Detail', level: 4 },
      { id: 'section-6', text: '!!!', level: 2 },
    ]);
  });

  it('stops at 60 sections', () => {
    const many = Array.from({ length: 75 }, (_, index) => `## Part ${index + 1}`).join('\n');
    const sections = extractReportSections(many);
    expect(sections).toHaveLength(60);
    expect(sections[59]).toEqual({ id: 'part-60', text: 'Part 60', level: 2 });
  });
});

describe('createReportSectionIds', () => {
  it('gives each rendered heading the id the outline scrolls to', () => {
    const sectionId = createReportSectionIds();
    const rendered = [
      sectionId('Overview', 1),
      sectionId('Findings', 2),
      sectionId('Findings', 2),
      sectionId('**Costs** and `limits`', 3),
      sectionId('Detail', 4),
      sectionId('Too deep', 5),
      sectionId('***', 2),
      sectionId('!!!', 2),
    ];
    expect(rendered).toEqual([
      'overview',
      'findings',
      'findings-1',
      'costs-and-limits',
      'detail',
      null,
      null,
      'section-6',
    ]);
    expect(rendered.filter((id) => id !== null)).toEqual(
      extractReportSections(REPORT).map((section) => section.id),
    );
  });

  it('stops giving ids after 60 headings', () => {
    const sectionId = createReportSectionIds();
    const ids = Array.from({ length: 62 }, (_, index) => sectionId(`Part ${index + 1}`, 2));
    expect(ids[59]).toBe('part-60');
    expect(ids.slice(60)).toEqual([null, null]);
  });
});
