import type { WebSearchAction } from './WebSearchAction';

export type WebSearchEndEvent = { call_id: string; query: string; action: WebSearchAction };
