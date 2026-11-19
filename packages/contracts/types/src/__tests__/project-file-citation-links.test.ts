import { describe, expect, it } from 'vitest';
import {
  orderProjectFileCitationsByAnswer,
  projectFileCitationHref,
  projectFileCitationTarget,
  type ProjectFileCitation,
} from '../project-file-citations';

const pageOne: ProjectFileCitation = {
  fileName: 'Handbook.pdf',
  fileId: 'file 1',
  projectId: 'project/a',
  anchor: { page: 1 },
};
const pageSeven: ProjectFileCitation = { ...pageOne, anchor: { page: 7 } };
const headings: ProjectFileCitation = {
  fileName: 'Policy.md',
  fileId: 'file-2',
  projectId: 'project-a',
  anchor: { headingPath: ['Pricing', 'Refunds'] },
};

describe('project file citation target', () => {
  it('opens the cited file at its page in the project knowledge panel', () => {
    expect(projectFileCitationTarget(pageSeven)).toEqual({
      projectId: 'project/a',
      fileId: 'file 1',
      page: 7,
    });
    expect(projectFileCitationHref(pageSeven)).toBe(
      '/chat/projects/project%2Fa?knowledgeFile=file+1&page=7',
    );
    expect(projectFileCitationHref(headings)).toBe('/chat/projects/project-a?knowledgeFile=file-2');
  });

  it('is not a link when the turn carried no project or file id', () => {
    expect(projectFileCitationTarget({ fileName: 'Loose.pdf', fileId: 'f' })).toBeUndefined();
    expect(projectFileCitationHref({ fileName: 'Loose.pdf', projectId: 'p' })).toBeUndefined();
  });
});

describe('orderProjectFileCitationsByAnswer', () => {
  it('leads with the place the answer named', () => {
    expect(
      orderProjectFileCitationsByAnswer([pageOne, pageSeven, headings], 'See p. 7 for details.'),
    ).toEqual([pageSeven, pageOne, headings]);
  });

  it('keeps the original order when the answer names none or all of them', () => {
    const all = [pageOne, pageSeven];
    expect(orderProjectFileCitationsByAnswer(all, 'No locations here.')).toBe(all);
    expect(orderProjectFileCitationsByAnswer(all, 'p. 1 and p. 7')).toBe(all);
    expect(orderProjectFileCitationsByAnswer(all, '')).toBe(all);
  });
});
