import { supabase } from '@shared/lib/supabase-client';

interface DBUsageRow {
  tokens_used: number;
  cost: number;
  agent_type: string;
  timestamp: string;
}

export interface APICallRecord {
  userId: string;
  agentType: string;
  provider: string;
  tokensUsed: number;
  inputTokens: number;
  outputTokens: number;
  taskId: string;
  timestamp: Date;
  cost: number;
}

export interface UsageRecord {
  userId: string;
  timestamp: Date;
  agentType: string;
  apiProvider: string;
  tokensUsed: number;
  cost: number;
  taskId: string;
}

export interface UsageSummary {
  totalCalls: number;
  totalTokens: number;
  totalCost: number;
  byAgent: Record<string, { calls: number; tokens: number; cost: number }>;
  byDay: Record<string, { calls: number; tokens: number; cost: number }>;
}

export interface DateRange {
  start: Date;
  end: Date;
}

export class UsageTracker {
  private cache: Map<string, UsageRecord[]> = new Map();

  async trackAPICall(params: {
    userId: string;
    agentType: string;
    provider: string;
    tokensUsed: number;
    inputTokens: number;
    outputTokens: number;
    taskId: string;
    timestamp: Date;
    cost: number;
  }): Promise<void> {
    try {
      await (
        supabase.from('api_usage' as never) as unknown as ReturnType<typeof supabase.from>
      ).insert({
        user_id: params.userId,
        agent_type: params.agentType,
        provider: params.provider,
        tokens_used: params.tokensUsed,
        input_tokens: params.inputTokens,
        output_tokens: params.outputTokens,
        task_id: params.taskId,
        timestamp: params.timestamp.toISOString(),
        cost: params.cost,
      } as never);
    } catch (error) {
      console.error('[UsageTracker] Failed to track API call:', error);
    }
  }

  async getUsageSummary(userId: string, period: DateRange): Promise<UsageSummary> {
    try {
      const { data, error } = await (
        supabase.from('api_usage' as never) as unknown as ReturnType<typeof supabase.from>
      )
        .select('*')
        .eq('user_id', userId)
        .gte('timestamp', period.start.toISOString())
        .lte('timestamp', period.end.toISOString())
        .order('timestamp', { ascending: true });

      if (error) {
        throw error;
      }

      const usage = (data || []) as DBUsageRow[];

      const summary: UsageSummary = {
        totalCalls: usage.length,
        totalTokens: usage.reduce((sum: number, r: DBUsageRow) => sum + (r.tokens_used || 0), 0),
        totalCost: usage.reduce((sum: number, r: DBUsageRow) => sum + (r.cost || 0), 0),
        byAgent: this.groupByAgent(usage),
        byDay: this.groupByDay(usage),
      };

      return summary;
    } catch (error) {
      throw new Error(`Failed to get usage summary: ${(error as Error).message}`);
    }
  }

  private groupByAgent(
    usage: DBUsageRow[],
  ): Record<string, { calls: number; tokens: number; cost: number }> {
    const grouped: Record<string, { calls: number; tokens: number; cost: number }> = {};

    for (const record of usage) {
      const agent = record.agent_type || 'unknown';

      if (!grouped[agent]) {
        grouped[agent] = { calls: 0, tokens: 0, cost: 0 };
      }

      grouped[agent].calls += 1;
      grouped[agent].tokens += record.tokens_used || 0;
      grouped[agent].cost += record.cost || 0;
    }

    return grouped;
  }

  private groupByDay(
    usage: DBUsageRow[],
  ): Record<string, { calls: number; tokens: number; cost: number }> {
    const grouped: Record<string, { calls: number; tokens: number; cost: number }> = {};

    for (const record of usage) {
      const date = new Date(record.timestamp).toISOString().split('T')[0];

      if (!grouped[date!]) {
        grouped[date!] = { calls: 0, tokens: 0, cost: 0 };
      }

      grouped![date!]!.calls += 1;
      grouped![date!]!.tokens += record.tokens_used || 0;
      grouped![date!]!.cost += record.cost || 0;
    }

    return grouped;
  }

  calculateCost(provider: string, inputTokens: number, outputTokens: number): number {
    const rates: Record<string, { input: number; output: number }> = {
      claude: { input: 3, output: 15 },
      gemini: { input: 0.075, output: 0.3 },
      gpt4: { input: 10, output: 30 },
      'gpt3.5': { input: 0.5, output: 1.5 },
    };

    const rate = rates[provider.toLowerCase()] || { input: 1, output: 1 };
    const inputCost = (inputTokens / 1000000) * rate.input;
    const outputCost = (outputTokens / 1000000) * rate.output;

    return inputCost + outputCost;
  }

  async getCurrentMonthUsage(userId: string): Promise<UsageSummary> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    return this.getUsageSummary(userId, {
      start: startOfMonth,
      end: endOfMonth,
    });
  }

  async getDailyUsage(userId: string, days: number = 30): Promise<UsageSummary> {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);

    return this.getUsageSummary(userId, { start, end });
  }

  async clearCache(): Promise<void> {
    this.cache.clear();
  }
}
