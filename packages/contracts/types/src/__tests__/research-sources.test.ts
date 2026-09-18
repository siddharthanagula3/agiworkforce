import { describe, expect, it } from 'vitest';

import {
  FILES_RESEARCH_SOURCE,
  RESEARCH_SOURCE_KINDS,
  addResearchSource,
  removeResearchSource,
  researchSourceKey,
  researchSourceRequest,
  type ResearchSource,
} from '../research';

const NATURE: ResearchSource = { kind: 'web', id: 'nature.com', label: 'nature.com' };
const FARM: ResearchSource = {
  kind: 'web',
  id: 'content-farm.example',
  label: 'content-farm.example',
  excluded: true,
};
const NOTION: ResearchSource = { kind: 'connector', id: 'notion', label: 'Notion' };

describe('a research source selection', () => {
  it('names web, files and connectors as the kinds a run can mix', () => {
    expect([...RESEARCH_SOURCE_KINDS]).toEqual(['web', 'files', 'connector']);
  });

  it('adds each source once', () => {
    const sources = addResearchSource(addResearchSource([], NATURE), NATURE);

    expect(sources).toEqual([NATURE]);
  });

  it('keeps a site chosen and the same site excluded apart', () => {
    const excludedNature = { ...NATURE, excluded: true };

    expect(researchSourceKey(NATURE)).not.toBe(researchSourceKey(excludedNature));
    expect(addResearchSource([NATURE], excludedNature)).toHaveLength(2);
  });

  it('removes one source and leaves the others in order', () => {
    const sources = [NATURE, FILES_RESEARCH_SOURCE, NOTION];

    expect(removeResearchSource(sources, researchSourceKey(FILES_RESEARCH_SOURCE))).toEqual([
      NATURE,
      NOTION,
    ]);
  });

  it('turns a mixed selection into the request the server enforces', () => {
    expect(researchSourceRequest([NATURE, FARM, FILES_RESEARCH_SOURCE, NOTION])).toEqual({
      files: true,
      allowDomains: ['nature.com'],
      denyDomains: ['content-farm.example'],
      connectors: ['notion'],
    });
  });

  it('reads an empty selection as an unrestricted web run', () => {
    expect(researchSourceRequest([])).toEqual({
      files: false,
      allowDomains: [],
      denyDomains: [],
      connectors: [],
    });
  });
});
