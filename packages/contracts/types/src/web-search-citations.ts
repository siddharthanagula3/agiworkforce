export const WEB_SEARCH_CITATION_DELTA_KEY = 'x_citation' as const;
export const WEB_SEARCH_CITATION_KIND = 'url_citation' as const;

export interface WebSearchCitationDeltaWire {
  url: string;
  title: string;
}
