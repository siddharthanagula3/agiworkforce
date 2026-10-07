import { BILLING_PLAN_PRICING } from '@agiworkforce/types';
import { buildMetadata } from '@/lib/seo/metadata';
import '@/features/marketing/components/system/public-reference.css';
import QueryRuntimeProvider from '../QueryRuntimeProvider';

const TITLE = 'Pricing: what each plan and each route costs';
const LISTED_PLANS = [
  BILLING_PLAN_PRICING.free.label,
  BILLING_PLAN_PRICING.basic.label,
  BILLING_PLAN_PRICING.pro.label,
  BILLING_PLAN_PRICING.max.label,
  BILLING_PLAN_PRICING.max_15x.label,
  BILLING_PLAN_PRICING.team.label,
].join(', ');
const DESCRIPTION = `AGI public alpha pricing for ${LISTED_PLANS}, and ${BILLING_PLAN_PRICING.enterprise.label}, with Local and BYOK choices kept separate from managed cloud.`;

export const metadata = buildMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: '/pricing',
  imageAlt: 'AGI pricing plans',
  keywords: [
    'AI pricing',
    'AI agent plans',
    'AGI pricing',
    'AI automation cost',
    'BYOK AI',
    'AI subscription',
    'AI for teams',
    'enterprise AI',
  ],
});

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return <QueryRuntimeProvider>{children}</QueryRuntimeProvider>;
}
