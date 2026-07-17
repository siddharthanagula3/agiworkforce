/**
 * Web-surface wire shapes for search results and generated media stored in
 * chat message metadata.
 *
 * Ported from the deleted core/integrations netlify-proxy handlers
 * (web-search-handler.ts, media-generation-handler.ts): the runtime callers
 * were dead — live search and media generation go through /api/search and
 * /api/media/* — but persisted message metadata still uses these shapes.
 */

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source?: string;
  publishedDate?: string;
  favicon?: string;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  /** AI-generated answer based on search results. */
  answer?: string;
  /** URLs of sources used in the answer. */
  sources?: string[];
  timestamp: Date;
}

export interface MediaGenerationResult {
  id: string;
  type: 'image' | 'video';
  url: string;
  thumbnailUrl?: string;
  prompt: string;
  metadata: {
    size?: string;
    duration?: number;
    resolution?: string;
    style?: string;
    seed?: number;
    steps?: number;
    guidance?: number;
    fps?: number;
    aspectRatio?: string;
    model?: string;
    hasAudio?: boolean;
  };
  cost: number;
  tokensUsed: number;
  createdAt: Date;
  status: 'generating' | 'completed' | 'failed' | 'processing';
  progress?: number;
  images?: Array<{ url: string; mimeType: string }>;
}
