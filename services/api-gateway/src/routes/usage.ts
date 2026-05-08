import { Router, type Request, type Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { getUserScopedClient } from '../lib/supabaseClients';
import { createRateLimiter } from '../middleware/rateLimit';
import { logger } from '../lib/logger';

const router: Router = Router();

router.use(authenticateToken);

interface UsageRow {
  id: string;
  created_at: string;
  event_type: string;
  quantity?: number | null;
  metadata?: Record<string, unknown> | null;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  total_tokens?: number | null;
  total_cost?: number | null;
  cost_usd?: number | null;
  model?: string | null;
  provider?: string | null;
  conversation_id?: string | null;
  session_id?: string | null;
}

interface ModelUsage {
  modelId: string;
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;
}

interface DailyUsage {
  date: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;
}

function asMetadata(row: UsageRow): Record<string, unknown> {
  return row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function pickNumber(row: UsageRow, ...keys: string[]): number {
  const rowRecord = row as unknown as Record<string, unknown>;
  const metadata = asMetadata(row);
  for (const key of keys) {
    if (key in rowRecord) {
      return asNumber(rowRecord[key]);
    }
    if (key in metadata) {
      return asNumber(metadata[key]);
    }
  }
  return 0;
}

function pickString(row: UsageRow, ...keys: string[]): string | null {
  const rowRecord = row as unknown as Record<string, unknown>;
  const metadata = asMetadata(row);
  for (const key of keys) {
    if (key in rowRecord) {
      const value = rowRecord[key];
      if (typeof value === 'string' && value.trim()) {
        return value;
      }
    }
    if (key in metadata) {
      const value = metadata[key];
      if (typeof value === 'string' && value.trim()) {
        return value;
      }
    }
  }
  return null;
}

function getInputTokens(row: UsageRow): number {
  return pickNumber(row, 'prompt_tokens', 'input_tokens');
}

function getOutputTokens(row: UsageRow): number {
  return pickNumber(row, 'completion_tokens', 'output_tokens');
}

function getTotalTokens(row: UsageRow): number {
  const explicit = pickNumber(row, 'total_tokens');
  if (explicit > 0) return explicit;
  const summed = getInputTokens(row) + getOutputTokens(row);
  if (summed > 0) return summed;
  return pickNumber(row, 'quantity');
}

function getCost(row: UsageRow): number {
  return pickNumber(row, 'total_cost', 'cost_usd', 'estimated_cost', 'cost');
}

function getModel(row: UsageRow): string {
  return pickString(row, 'model', 'model_id', 'model_name') ?? 'unknown';
}

function getConversationId(row: UsageRow): string | null {
  return pickString(row, 'conversation_id', 'session_id');
}

function startOfCurrentMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

function endOfCurrentMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

function formatPeriodLabel(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

async function fetchUsageRows(userId: string, start: Date, end: Date): Promise<UsageRow[]> {
  // Wave 1.5+ singleton sweep: user-scoped client.
  const supabase = getUserScopedClient(userId);
  const { data, error } = await supabase
    .from('usage_events')
    .select('*')
    .eq('user_id', userId)
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString())
    .order('created_at', { ascending: false });

  if (error) {
    logger.error({ error, userId }, 'Failed to fetch usage rows');
    throw new AppError('Failed to fetch usage', 500);
  }

  return (data ?? []) as UsageRow[];
}

function summarizeRows(rows: UsageRow[]) {
  const messageCount = rows.length;
  const tokenCount = rows.reduce((sum, row) => sum + getTotalTokens(row), 0);
  const costUsd = rows.reduce((sum, row) => sum + getCost(row), 0);

  return { messageCount, tokenCount, costUsd };
}

function buildModelBreakdown(rows: UsageRow[]): ModelUsage[] {
  const models = new Map<string, ModelUsage>();

  for (const row of rows) {
    const modelId = getModel(row);
    const current = models.get(modelId) ?? {
      modelId,
      modelName: modelId,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCost: 0,
    };

    current.inputTokens += getInputTokens(row);
    current.outputTokens += getOutputTokens(row);
    current.totalTokens += getTotalTokens(row);
    current.estimatedCost += getCost(row);
    models.set(modelId, current);
  }

  return [...models.values()].sort((left, right) => right.totalTokens - left.totalTokens);
}

function buildDailyUsage(rows: UsageRow[]): DailyUsage[] {
  const byDay = new Map<string, DailyUsage>();
  const today = new Date();

  for (let offset = 6; offset >= 0; offset -= 1) {
    const day = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate() - offset,
        0,
        0,
        0,
        0,
      ),
    );
    const key = day.toISOString().slice(0, 10);
    byDay.set(key, {
      date: key,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCost: 0,
    });
  }

  for (const row of rows) {
    const dayKey = row.created_at.slice(0, 10);
    const current = byDay.get(dayKey);
    if (!current) continue;
    current.inputTokens += getInputTokens(row);
    current.outputTokens += getOutputTokens(row);
    current.totalTokens += getTotalTokens(row);
    current.estimatedCost += getCost(row);
  }

  return [...byDay.values()];
}

router.get('/', createRateLimiter('usage-summary'), async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  const periodStart = startOfCurrentMonth();
  const periodEnd = endOfCurrentMonth();
  const rows = await fetchUsageRows(user.userId, periodStart, periodEnd);
  const summary = summarizeRows(rows);

  res.json({
    period_start: periodStart.toISOString(),
    period_end: periodEnd.toISOString(),
    message_count: summary.messageCount,
    token_count: summary.tokenCount,
    cost_usd: Number(summary.costUsd.toFixed(6)),
  });
});

router.get('/summary', createRateLimiter('usage-summary'), async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  const periodStart = startOfCurrentMonth();
  const periodEnd = endOfCurrentMonth();
  const rows = await fetchUsageRows(user.userId, periodStart, periodEnd);
  const conversationIds = new Set(
    rows.map((row) => getConversationId(row)).filter((value): value is string => Boolean(value)),
  );
  const modelBreakdown = buildModelBreakdown(rows);
  const dailyUsage = buildDailyUsage(rows);

  const totalInputTokens = rows.reduce((sum, row) => sum + getInputTokens(row), 0);
  const totalOutputTokens = rows.reduce((sum, row) => sum + getOutputTokens(row), 0);
  const totalTokens = rows.reduce((sum, row) => sum + getTotalTokens(row), 0);
  const totalCost = rows.reduce((sum, row) => sum + getCost(row), 0);

  res.json({
    period: formatPeriodLabel(periodStart),
    totalInputTokens,
    totalOutputTokens,
    totalTokens,
    totalCost: Number(totalCost.toFixed(6)),
    conversationCount: conversationIds.size,
    modelBreakdown,
    dailyUsage,
  });
});

router.get('/history', createRateLimiter('usage-history'), async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  const limit = Math.max(1, Math.min(100, Number(req.query['limit'] ?? 50)));
  const offset = Math.max(0, Number(req.query['offset'] ?? 0));

  const supabase = getUserScopedClient(user.userId);
  const { data, error } = await supabase
    .from('usage_events')
    .select('*')
    .eq('user_id', user.userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    logger.error({ error, userId: user.userId }, 'Failed to fetch usage history');
    throw new AppError('Failed to fetch usage history', 500);
  }

  const items = ((data ?? []) as UsageRow[]).map((row) => ({
    id: row.id,
    created_at: row.created_at,
    event_type: row.event_type,
    model: getModel(row),
    input_tokens: getInputTokens(row),
    output_tokens: getOutputTokens(row),
    total_tokens: getTotalTokens(row),
    cost_usd: Number(getCost(row).toFixed(6)),
    conversation_id: getConversationId(row),
    metadata: asMetadata(row),
  }));

  res.json({
    items,
    limit,
    offset,
  });
});

export { router as usageRouter };
