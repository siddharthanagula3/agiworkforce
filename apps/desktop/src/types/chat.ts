export type ArtifactType =
  | 'code'
  | 'chart'
  | 'diagram'
  | 'table'
  | 'csv'
  | 'email'
  | 'mermaid'
  | 'spreadsheet'
  | 'presentation'
  | 'html'
  | 'image'
  | 'video'
  | 'audio'
  | 'music'
  | 'search'
  | 'document'
  | 'svg'
  | 'markdown'
  | 'react'
  | 'component';

export interface Artifact {
  id: string;
  type: ArtifactType;
  title?: string;
  content: string;
  language?: string;
  metadata?: Record<string, unknown>;
}

export interface CostOverviewResponse {
  today_total: number;
  month_total: number;
  monthly_budget?: number | null;
  remaining_budget?: number | null;
}

export interface CostTimeseriesPoint {
  date: string;
  total_cost: number;
}

export interface ProviderCostBreakdown {
  provider: string;
  total_cost: number;
}

export interface ConversationCostBreakdown {
  conversation_id: number;
  title: string;
  total_cost: number;
}

export interface CostAnalyticsResponse {
  timeseries: CostTimeseriesPoint[];
  providers: ProviderCostBreakdown[];
  top_conversations: ConversationCostBreakdown[];
}
