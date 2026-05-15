import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@shared/ui/card';
import { Button } from '@shared/ui/button';
import { Badge } from '@shared/ui/badge';
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
import { getPlanPriceUsd, getPlanUsageBudgetCents } from '@agiworkforce/types';
import { BillingInfo, normalizePlan, normalizeStatus } from './types';

function formatPlanPrice(
  plan: 'hobby' | 'pro' | 'pro_plus' | 'max',
  billingPeriod: 'monthly' | 'yearly',
) {
  if (billingPeriod === 'monthly') {
    return `$${getPlanPriceUsd(plan, 'monthly')}`;
  }
  return `$${(getPlanPriceUsd(plan, 'yearly') / 12).toFixed(2)}`;
}

function formatPlanBilledAmount(
  plan: 'hobby' | 'pro' | 'pro_plus' | 'max',
  billingPeriod: 'monthly' | 'yearly',
) {
  const interval = billingPeriod === 'yearly' ? 'yearly' : 'monthly';
  return `$${getPlanPriceUsd(plan, interval).toFixed(2).replace(/\.00$/, '')}`;
}

function formatUsageBudgetLine(
  plan: 'hobby' | 'pro' | 'pro_plus' | 'max',
  billingPeriod: 'monthly' | 'yearly',
) {
  const interval = billingPeriod === 'yearly' ? 'yearly' : 'monthly';
  const budgetCents = getPlanUsageBudgetCents(plan, interval);
  return `${budgetCents.toLocaleString()} credits/${billingPeriod === 'yearly' ? 'year' : 'month'} ($${(budgetCents / 100).toFixed(2)} in AI usage)`;
}

function getPlanIcon(plan: string) {
  const normalized = normalizePlan(plan);
  switch (normalized) {
    case 'free':
      return <Zap className="h-5 w-5" />;
    case 'hobby':
      return <Star className="h-5 w-5" />;
    case 'pro':
      return <Crown className="h-5 w-5" />;
    case 'pro_plus':
      return <Crown className="h-5 w-5 text-violet-500" />;
    case 'max':
      return <Crown className="h-5 w-5 text-amber-500" />;
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
    case 'cancelled':
      return {
        icon: <XCircle className="h-4 w-4 text-muted-foreground" />,
        label: 'Cancelled',
      };
    case 'past_due':
      return { icon: <AlertTriangle className="h-4 w-4 text-amber-500" />, label: 'Past Due' };
    case 'unpaid':
      return {
        icon: <AlertTriangle className="h-4 w-4 text-destructive" />,
        label: 'Unpaid',
      };
  }
}

interface SubscriptionProps {
  billing: BillingInfo | null;
  stripeCustomerId: string | null;
  isManagingBilling: boolean;
  billingPeriod: 'monthly' | 'yearly';
  onBillingPeriodChange: (period: 'monthly' | 'yearly') => void;
  onManageBilling: () => void;
  onUpgrade: (
    plan: 'hobby' | 'pro' | 'pro_plus' | 'max' | 'enterprise',
    billingPeriod?: 'monthly' | 'yearly',
  ) => void;
  formatCurrency: (amount: number, currency: string) => string;
  formatDate: (dateString: string) => string;
}

export const Subscription: React.FC<SubscriptionProps> = ({
  billing,
  stripeCustomerId,
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
                {billing?.price === 0
                  ? 'Free'
                  : formatCurrency(billing?.price || 0, billing?.currency || 'USD')}
                {(billing?.price ?? 0) > 0 && (
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
              <p className="text-sm font-medium">{billing?.plan === 'free' ? 'N/A' : 'Monthly'}</p>
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
                  disabled={isManagingBilling || !stripeCustomerId}
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
      {normalizePlan(billing?.plan) !== 'max' && normalizePlan(billing?.plan) !== 'enterprise' && (
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
                      Save 14%
                    </Badge>
                  </button>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {/* Hobby Plan */}
              {normalizePlan(billing?.plan) === 'free' && (
                <Card className="border-2 border-muted-foreground/30">
                  <CardHeader>
                    <div className="flex items-center space-x-2">
                      <Zap className="h-5 w-5 text-primary" />
                      <CardTitle>Hobby</CardTitle>
                    </div>
                    <div className="text-2xl font-bold">
                      {billingPeriod === 'yearly' ? (
                        <>
                          <div className="text-3xl font-bold">
                            {formatPlanPrice('hobby', 'yearly')}
                            <span className="text-lg text-muted-foreground">/month</span>
                          </div>
                          <div className="mt-1 text-sm text-muted-foreground">
                            Billed yearly as {formatPlanBilledAmount('hobby', 'yearly')}
                          </div>
                        </>
                      ) : (
                        <>
                          {formatPlanPrice('hobby', 'monthly')}
                          <span className="text-sm text-muted-foreground">/month</span>
                        </>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2 text-sm">
                      <li className="flex items-center space-x-2">
                        <CheckCircle className="h-4 w-4 text-success" />
                        <span>{formatUsageBudgetLine('hobby', billingPeriod)}</span>
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
                        <span>Basic computer use</span>
                      </li>
                    </ul>
                    <Button
                      className="mt-4 w-full"
                      variant="outline"
                      onClick={() => onUpgrade('hobby', billingPeriod)}
                    >
                      Get Hobby
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Pro Plan */}
              {(normalizePlan(billing?.plan) === 'free' ||
                normalizePlan(billing?.plan) === 'hobby') && (
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
                        <span>{formatUsageBudgetLine('pro', billingPeriod)}</span>
                      </li>
                      <li className="flex items-center space-x-2">
                        <CheckCircle className="h-4 w-4 text-success" />
                        <span>Same price as direct provider rates</span>
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

              {/* Max Plan */}
              <Card className="border-2 border-secondary">
                <CardHeader>
                  <div className="flex items-center space-x-2">
                    <Star className="h-5 w-5 text-primary" />
                    <CardTitle>Max</CardTitle>
                  </div>
                  <div className="text-2xl font-bold">
                    {billingPeriod === 'yearly' ? (
                      <>
                        <div className="text-3xl font-bold">
                          {formatPlanPrice('max', 'yearly')}
                          <span className="text-lg text-muted-foreground">/month</span>
                        </div>
                        <div className="mt-1 text-sm text-muted-foreground">
                          Billed yearly as {formatPlanBilledAmount('max', 'yearly')}
                        </div>
                      </>
                    ) : (
                      <>
                        {formatPlanPrice('max', 'monthly')}
                        <span className="text-sm text-muted-foreground">/month</span>
                      </>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-center space-x-2">
                      <CheckCircle className="h-4 w-4 text-success" />
                      <span>{formatUsageBudgetLine('max', billingPeriod)}</span>
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
                      <span>Video generation &amp; analysis</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <CheckCircle className="h-4 w-4 text-success" />
                      <span>Priority support</span>
                    </li>
                  </ul>
                  <Button
                    className="mt-4 w-full"
                    variant="outline"
                    onClick={() => onUpgrade('max', billingPeriod)}
                  >
                    Upgrade to Max
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>

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
                      <span>Everything in Max</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <CheckCircle className="h-4 w-4 text-success" />
                      <span>Custom credit allocation</span>
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
