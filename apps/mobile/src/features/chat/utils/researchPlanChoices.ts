import {
  DEFAULT_RESEARCH_DELIVERABLE,
  type ResearchDeliverableSpec,
  type ResearchSourceRequest,
} from '@agiworkforce/types';

export interface ResearchPlanChoices {
  deliverable: ResearchDeliverableSpec;
  sources: ResearchSourceRequest;
}

export function defaultResearchPlanChoices(): ResearchPlanChoices {
  return {
    deliverable: { ...DEFAULT_RESEARCH_DELIVERABLE },
    sources: { files: false, allowDomains: [], denyDomains: [], connectors: [] },
  };
}

export function hasResearchSourceChoice(sources: ResearchSourceRequest): boolean {
  return (
    sources.files ||
    sources.allowDomains.length > 0 ||
    sources.denyDomains.length > 0 ||
    sources.connectors.length > 0
  );
}
