import { invoke } from '../lib/tauri-mock';

export interface CouncilModel {
  provider: string;
  model: string;
}

export interface CouncilMemberResponse {
  provider: string;
  model: string;
  content: string;
  tokens: number;
  cost: number;
  latencyMs: number;
  error: string | null;
}

export interface CouncilResult {
  query: string;
  responses: CouncilMemberResponse[];
  consensusSummary: string;
  totalCost: number;
  totalLatencyMs: number;
  agreementScore: number;
  successfulCount: number;
  failedCount: number;
}

export interface CouncilQueryOptions {
  prompt: string;
  systemPrompt?: string;
  models?: CouncilModel[];
  timeoutSecs?: number;
  synthesizeConsensus?: boolean;
}

export async function councilQuery(options: CouncilQueryOptions): Promise<CouncilResult> {
  return invoke<CouncilResult>('llm_council_query', {
    request: {
      prompt: options.prompt,
      systemPrompt: options.systemPrompt,
      models: options.models,
      timeoutSecs: options.timeoutSecs ?? 60,
      synthesizeConsensus: options.synthesizeConsensus ?? true,
    },
  });
}
