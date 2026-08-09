import React from 'react';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
} from '@agiworkforce/ui';
import {
  CheckCircle,
  AlertTriangle,
  Crown,
  Building,
  Star,
  ArrowRight,
  Zap,
  Settings,
  ExternalLink,
  XCircle,
} from 'lucide-react';
import {
  BILLING_PLAN_PRICING,
  getBillingPlanPricing,
  isPlanSelectableOnSurface,
} from '@agiworkforce/types';
import {
  formatCatalogPrice,
  getBillingPlanDisplay,
  type DisplayPaidPlan,
  type SelectablePaidPlan,
} from '@features/billing/lib/plan-display';
import { BillingInfo, normalizePlan, normalizeStatus } from './types';

function formatPlanPrice(plan: DisplayPaidPlan, billingPeriod: 'monthly' | 'yearly') {
  const pricing = BILLING_PLAN_PRICING[plan];
  return billingPeriod === 'yearly' && pricing.yearlyPriceUsd > 0
    ? formatCatalogPrice(pricing.yearlyPriceUsd / 12)
    : formatCatalogPrice(pricing.monthlyPriceUsd);
}

function formatPlanBilledAmount(plan: DisplayPaidPlan, billingPeriod: 'monthly' | 'yearly') {
  const interval = billingPeriod === 'yearly' ? 'yearly' : 'monthly';
  return formatCatalogPrice(
    interval === 'yearly'
      ? BILLING_PLAN_PRICING[plan].yearlyPriceUsd
      : BILLING_PLAN_PRICING[plan].monthlyPriceUsd,
  );
}

function annualSavingsPct(plan: DisplayPaidPlan): number {
  const pricing = BILLING_PLAN_PRICING[plan];
  if (pricing.monthlyPriceUsd <= 0 || pricing.yearlyPriceUsd <= 0) return 0;
  return Math.round((1 - pricing.yearlyPriceUsd / 12 / pricing.monthlyPriceUsd) * 100);
}

const PRO_ANNUAL_SAVINGS = annualSavingsPct('pro');

function getPlanIcon(plan: string) {
  const normalized = normalizePlan(plan);
  switch (normalized) {
    case 'free':
      return <Zap className="h-5 w-5" />;
    case 'basic':
      return <Star className="h-5 w-5" />;
    case 'pro':
      return <Crown className="h-5 w-5" />;
    case 'max':
      return <Crown className="h-5 w-5 text-amber-500" />;
    case 'max_15x':
      return <Crown className="h-5 w-5 text-amber-500" />;
    case 'team':
      return <Building className="h-5 w-5" />;
    case 'enterprise':
      return <Building className="h-5 w-5" />;
    default:
      return <Zap className="h-5 w-5" />;
  }
}

function getStatusDisplay(status: string | undefined) {
  const normalized = normalizeStatus(status);
  switch (normalized) {
    case 'active':
      return { icon: <CheckCircle className="h-4 w-4 text-success" />, label: 'Active' };
    case 'trialing':
      return { icon: <CheckCircle className="h-4 w-4 text-success" />, label: 'Trial' };
    case 'canceled':
      return {
        icon: <XCircle className="h-4 w-4 text-muted-foreground" />,
        label: 'Canceled',
      };
    case 'past_due':
      return { icon: <AlertTriangle className="h-4 w-4 text-amber-500" />, label: 'Past Due' };
    case 'unpaid':
      return {
        icon: <AlertTriangle className="h-4 w-4 text-destructive" />,
        label: 'Unpaid',
      };
    case 'incomplete':
      return {
        icon: <AlertTriangle className="h-4 w-4 text-amber-500" />,
        label: 'Payment incomplete',
      };
    case 'incomplete_expired':
      return {
        icon: <XCircle className="h-4 w-4 text-muted-foreground" />,
        label: 'Payment expired',
      };
    case 'paused':
      return {
        icon: <AlertTriangle className="h-4 w-4 text-amber-500" />,
        label: 'Paused',
      };
    case 'none':
      return {
        icon: <XCircle className="h-4 w-4 text-muted-foreground" />,
        label: 'No subscription',
      };
  }
}

interface SubscriptionProps {
  billing: BillingInfo | null;
  isManagingBilling: boolean;
  billingPeriod: 'monthly' | 'yearly';
  onBillingPeriodChange: (period: 'monthly' | 'yearly') => void;
  onManageBilling: () => void;
  onUpgrade: (
    plan: SelectablePaidPlan | 'enterprise',
    billingPeriod?: 'monthly' | 'yearly',
  ) => void;
  formatCurrency: (amount: number, currency: string) => string;
  formatDate: (dateString: string) => string;
}

export const Subscription: React.FC<SubscriptionProps> = ({
  billing,
  isManagingBilling,
  billingPeriod,
  onBillingPeriodChange,
  onManageBilling,
  onUpgrade,
  formatCurrency,
  formatDate,
}) => {
  return (
    <>
      {/* Current Plan */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center space-x-2">
                {getPlanIcon(billing?.plan || 'free')}
                <span>Current Plan</span>
              </CardTitle>
              <CardDescription>Your current subscription details</CardDescription>
            </div>
            <Badge>{normalizePlan(billing?.plan).toUpperCase()}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
            <div>
              <p className="text-sm text-muted-foreground">Plan Price</p>
              <p className="text-2xl font-bold">
                {billing?.plan === 'free'
                  ? 'Free'
                  : billing?.price != null && billing.currency
                    ? formatCurrency(billing.price, billing.currency)
                    : 'See invoice'}
                {billing?.price != null && billing.price > 0 && billing.currency && (
                  <span className="text-sm text-muted-foreground">/month</span>
                )}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <div className="flex items-center space-x-2">
                {getStatusDisplay(billing?.status).icon}
                <span className="text-sm font-medium">
                  {getStatusDisplay(billing?.status).label}
                </span>
              </div>
              {normalizeStatus(billing?.status) === 'past_due' && (
                <p className="mt-1 text-xs text-amber-600 dark:text-amber-500">
                  Please update your payment method to avoid service interruption.
                </p>
              )}
              {normalizeStatus(billing?.status) === 'unpaid' && (
                <p className="mt-1 text-xs text-destructive">
                  Your account has an unpaid balance. Please update your payment method.
                </p>
              )}
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Next Billing Date</p>
              <p className="text-sm font-medium">
                {billing?.current_period_end ? formatDate(billing.current_period_end) : '--'}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Billing Period</p>
              <p className="text-sm font-medium">
                {billing?.plan === 'free'
                  ? 'N/A'
                  : billing?.current_period_start && billing.current_period_end
                    ? `${formatDate(billing.current_period_start)} – ${formatDate(
                        billing.current_period_end,
                      )}`
                    : 'Not available'}
              </p>
            </div>
          </div>

          {billing?.plan !== 'free' && (
            <div className="mt-6 rounded-lg border bg-muted/50 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">Subscription Management</h4>
                  <p className="text-sm text-muted-foreground">
                    Update payment methods, view invoices, and manage your subscription
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={onManageBilling}
                  disabled={isManagingBilling}
                  className="flex items-center gap-2"
                >
                  <Settings className="h-4 w-4" />
                  {isManagingBilling ? 'Opening...' : 'Manage'}
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Plan Features */}
      <Card>
        <CardHeader>
          <CardTitle>Plan Features</CardTitle>
          <CardDescription>Features included in your current plan</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {billing?.features.map((feature, index) => (
              <div key={index} className="flex items-center space-x-3">
                <CheckCircle className="h-5 w-5 text-success" />
                <span className="text-sm">{feature}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Upgrade Options */}
      {!['max_15x', 'team', 'enterprise'].includes(normalizePlan(billing?.plan)) && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Upgrade Your Plan</CardTitle>
                <CardDescription>Choose a plan that fits your needs</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Billing:</span>
                <div className="flex items-center rounded-lg bg-muted p-1">
                  <button
                    onClick={() => onBillingPeriodChange('monthly')}
                    className={`rounded-md px-3 py-1 text-sm transition-colors ${
                      billingPeriod === 'monthly'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Monthly
                  </button>
                  <button
                    onClick={() => onBillingPeriodChange('yearly')}
                    className={`rounded-md px-3 py-1 text-sm transition-colors ${
                      billingPeriod === 'yearly'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Yearly
                    <Badge variant="secondary" className="ml-1 text-xs">
                      Save {PRO_ANNUAL_SAVINGS}%
                    </Badge>
                  </button>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {/* Basic is selectable on customer app surfaces; developer surfaces
                  remain a separate Pro entitlement. */}
              {normalizePlan(billing?.plan) === 'free' &&
                isPlanSelectableOnSurface('basic', 'web') && (
                  <Card className="border-2 border-muted-foreground/30">
                    <CardHeader>
                      <div className="flex items-center space-x-2">
                        <Zap className="h-5 w-5 text-primary" />
                        <CardTitle>Basic</CardTitle>
                      </div>
                      <div className="text-2xl font-bold">
                        {formatPlanPrice('basic', 'monthly')}
                        <span className="text-sm text-muted-foreground">/month</span>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2 text-sm">
                        <li className="flex items-center space-x-2">
                          <CheckCircle className="h-4 w-4 text-success" />
                          <span>Basic plan usage</span>
                        </li>
                        <li className="flex items-center space-x-2">
                          <CheckCircle className="h-4 w-4 text-success" />
                          <span>Speed-optimized AI models</span>
                        </li>
                        <li className="flex items-center space-x-2">
                          <CheckCircle className="h-4 w-4 text-success" />
                          <span>Vision &amp; image analysis</span>
                        </li>
                        <li className="flex items-center space-x-2">
                          <CheckCircle className="h-4 w-4 text-success" />
                          <span>Chat tools and web search</span>
                        </li>
                      </ul>
                      <Button
                        className="mt-4 w-full"
                        variant="outline"
                        onClick={() => onUpgrade('basic', 'monthly')}
                      >
                        Get Basic
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </CardContent>
                  </Card>
                )}

              {/* Pro Plan */}
              {(normalizePlan(billing?.plan) === 'free' ||
                normalizePlan(billing?.plan) === 'basic') && (
                <Card className="border-2 border-primary">
                  <CardHeader>
                    <div className="flex items-center space-x-2">
                      <Crown className="h-5 w-5 text-primary" />
                      <CardTitle>Pro</CardTitle>
                      <Badge className="bg-primary text-primary-foreground">Popular</Badge>
                    </div>
                    <div className="text-2xl font-bold">
                      {billingPeriod === 'yearly' ? (
                        <>
                          <div className="text-3xl font-bold">
                            {formatPlanPrice('pro', 'yearly')}
                            <span className="text-lg text-muted-foreground">/month</span>
                          </div>
                          <div className="mt-1 text-sm text-muted-foreground">
                            Billed yearly as {formatPlanBilledAmount('pro', 'yearly')}
                          </div>
                        </>
                      ) : (
                        <>
                          {formatPlanPrice('pro', 'monthly')}
                          <span className="text-sm text-muted-foreground">/month</span>
                        </>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2 text-sm">
                      <li className="flex items-center space-x-2">
                        <CheckCircle className="h-4 w-4 text-success" />
                        <span>5x Basic usage</span>
                      </li>
                      <li className="flex items-center space-x-2">
                        <CheckCircle className="h-4 w-4 text-success" />
                        <span>Managed CLI, Chrome, and VS Code access</span>
                      </li>
                      <li className="flex items-center space-x-2">
                        <CheckCircle className="h-4 w-4 text-success" />
                        <span>Full computer use &amp; browser automation</span>
                      </li>
                      <li className="flex items-center space-x-2">
                        <CheckCircle className="h-4 w-4 text-success" />
                        <span>Image generation &amp; analysis</span>
                      </li>
                      <li className="flex items-center space-x-2">
                        <CheckCircle className="h-4 w-4 text-success" />
                        <span>Email support</span>
                      </li>
                    </ul>
                    <Button
                      className="gradient-primary mt-4 w-full"
                      onClick={() => onUpgrade('pro', billingPeriod)}
                    >
                      Upgrade to Pro
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Max 5x — monthly billing only */}
              {!['max', 'max_15x'].includes(normalizePlan(billing?.plan)) && (
                <Card className="border-2 border-secondary">
                  <CardHeader>
                    <div className="flex items-center space-x-2">
                      <Star className="h-5 w-5 text-primary" />
                      <CardTitle>{getBillingPlanPricing('max').label}</CardTitle>
                    </div>
                    <div className="text-2xl font-bold">
                      {formatPlanPrice('max', 'monthly')}
                      <span className="text-sm text-muted-foreground">/month</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">Billed monthly</div>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2 text-sm">
                      <li className="flex items-center space-x-2">
                        <CheckCircle className="h-4 w-4 text-success" />
                        <span>5x Pro usage</span>
                      </li>
                      <li className="flex items-center space-x-2">
                        <CheckCircle className="h-4 w-4 text-success" />
                        <span>Deep reasoning &amp; thinking models</span>
                      </li>
                      <li className="flex items-center space-x-2">
                        <CheckCircle className="h-4 w-4 text-success" />
                        <span>Advanced agentic coding models</span>
                      </li>
                      <li className="flex items-center space-x-2">
                        <CheckCircle className="h-4 w-4 text-success" />
                        <span>Image generation &amp; analysis</span>
                      </li>
                      <li className="flex items-center space-x-2">
                        <CheckCircle className="h-4 w-4 text-success" />
                        <span>Priority support</span>
                      </li>
                    </ul>
                    <Button
                      className="mt-4 w-full"
                      variant="outline"
                      onClick={() => onUpgrade('max', 'monthly')}
                    >
                      Upgrade to {getBillingPlanPricing('max').label}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Max 15x — the video-capable individual tier. */}
              {normalizePlan(billing?.plan) !== 'max_15x' && (
                <Card className="border-2 border-amber-500/50">
                  <CardHeader>
                    <div className="flex items-center space-x-2">
                      <Star className="h-5 w-5 text-amber-500" />
                      <CardTitle>{getBillingPlanPricing('max_15x').label}</CardTitle>
                    </div>
                    <div className="text-2xl font-bold">
                      {formatPlanPrice('max_15x', 'monthly')}
                      <span className="text-sm text-muted-foreground">/month</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">Billed monthly</div>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2 text-sm">
                      <li className="flex items-center space-x-2">
                        <CheckCircle className="h-4 w-4 text-success" />
                        <span>15x Pro usage</span>
                      </li>
                      <li className="flex items-center space-x-2">
                        <CheckCircle className="h-4 w-4 text-success" />
                        <span>Everything in {getBillingPlanPricing('max').label}</span>
                      </li>
                      <li className="flex items-center space-x-2">
                        <CheckCircle className="h-4 w-4 text-success" />
                        <span>Video generation</span>
                      </li>
                    </ul>
                    <Button
                      className="mt-4 w-full"
                      variant="outline"
                      onClick={() => onUpgrade('max_15x', 'monthly')}
                    >
                      Upgrade to {getBillingPlanPricing('max_15x').label}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Team is self-serve and billed PER SEAT. It is offered from
                  Free, Basic, or Pro rather than as a downgrade from Max. The
                  CTA goes to /pricing because that is where the seat selector
                  lives — checkout REFUSES a Team request with no seat count, so
                  a direct "buy" button here would be a dead control. */}
              {['free', 'basic', 'pro'].includes(normalizePlan(billing?.plan)) &&
                isPlanSelectableOnSurface('team', 'web') && (
                  <Card className="border-2 border-muted-foreground/30">
                    <CardHeader>
                      <div className="flex items-center space-x-2">
                        <Building className="h-5 w-5 text-primary" />
                        <CardTitle>{getBillingPlanPricing('team').label}</CardTitle>
                      </div>
                      <div className="text-2xl font-bold">
                        {formatCatalogPrice(BILLING_PLAN_PRICING.team.monthlyPriceUsd)}
                        <span className="text-sm text-muted-foreground"> per seat / month</span>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2 text-sm">
                        {getBillingPlanDisplay('team').features.map((feature) => (
                          <li key={feature} className="flex items-center space-x-2">
                            <CheckCircle className="h-4 w-4 text-success" />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                      <a
                        className="mt-4 flex h-10 w-full items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
                        href="/pricing#pricing-team-title"
                      >
                        Choose seats
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </a>
                    </CardContent>
                  </Card>
                )}

              {/* Enterprise Plan */}
              <Card className="border-2 border-muted-foreground/30">
                <CardHeader>
                  <div className="flex items-center space-x-2">
                    <Building className="h-5 w-5 text-primary" />
                    <CardTitle>Enterprise</CardTitle>
                  </div>
                  <div className="text-2xl font-bold">
                    Custom
                    <span className="text-sm text-muted-foreground"> pricing</span>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-center space-x-2">
                      <CheckCircle className="h-4 w-4 text-success" />
                      <span>Everything in {getBillingPlanPricing('max_15x').label}</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <CheckCircle className="h-4 w-4 text-success" />
                      <span>Contracted plan usage</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <CheckCircle className="h-4 w-4 text-success" />
                      <span>White-label option</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <CheckCircle className="h-4 w-4 text-success" />
                      <span>Dedicated account manager</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <CheckCircle className="h-4 w-4 text-success" />
                      <span>SLA guarantee</span>
                    </li>
                  </ul>
                  <Button
                    className="mt-4 w-full"
                    variant="outline"
                    onClick={() => onUpgrade('enterprise', 'monthly')}
                  >
                    Contact Sales
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
};
