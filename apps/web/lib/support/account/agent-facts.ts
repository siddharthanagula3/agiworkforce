import type { SupportAccountFact } from '@/lib/support/agent/types';
import type { ModelSafeAccountFacts } from './types';

interface FactSpec {
  key: keyof ModelSafeAccountFacts;
  label: string;
  sourceUrl: string;
  percentage?: boolean;
}

const AGENT_FACT_SPECS: readonly FactSpec[] = Object.freeze([
  { key: 'plan_tier', label: 'Plan', sourceUrl: '/settings/billing' },
  { key: 'effective_plan_tier', label: 'Effective plan', sourceUrl: '/settings/billing' },
  { key: 'subscription_status', label: 'Subscription status', sourceUrl: '/settings/billing' },
  { key: 'current_period_end', label: 'Current period ends', sourceUrl: '/settings/billing' },
  {
    key: 'usage_percentage',
    label: 'Usage this period',
    sourceUrl: '/settings/usage',
    percentage: true,
  },
  {
    key: 'weekly_usage_percentage',
    label: 'Weekly usage',
    sourceUrl: '/settings/usage',
    percentage: true,
  },
  { key: 'usage_reset_at', label: 'Usage resets', sourceUrl: '/settings/usage' },
  { key: 'has_usage_remaining', label: 'Usage remaining', sourceUrl: '/settings/usage' },
  { key: 'connector_count', label: 'Connected accounts', sourceUrl: '/settings/connections' },
  { key: 'active_api_key_count', label: 'Active API keys', sourceUrl: '/settings/account' },
  { key: 'api_key_at_ceiling', label: 'API key limit reached', sourceUrl: '/settings/account' },
  { key: 'email_verification_state', label: 'Email verification', sourceUrl: '/settings/account' },
]);

function formatValue(value: unknown, percentage: boolean): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return percentage ? `${String(Math.round(value))}%` : String(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

export function toSupportAgentAccountFacts(facts: ModelSafeAccountFacts): SupportAccountFact[] {
  const out: SupportAccountFact[] = [];
  for (const spec of AGENT_FACT_SPECS) {
    const value = formatValue(facts[spec.key], spec.percentage === true);
    if (value === null) continue;
    out.push({ label: spec.label, value, sourceUrl: spec.sourceUrl });
  }
  return out;
}
