
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
  answer?: string;
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
