import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@shared/ui/card';
import { Button } from '@shared/ui/button';
import { Badge } from '@shared/ui/badge';
import { CheckCircle, AlertTriangle, Crown, Star, ArrowRight, Zap, X } from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { getPlanPriceUsd, getPlanUsageBudgetCents } from '@agiworkforce/types';
import { BillingInfo, CreditPack, CREDIT_PACKS, formatCurrency } from './types';

interface TopupProps {
  billing: BillingInfo | null;
  showBuyTokens: boolean;
  onClose: () => void;
  onBuyTokenPack: (pack: CreditPack) => void;
  onUpgradePro: () => void;
}

export const Topup: React.FC<TopupProps> = ({
  billing,
  showBuyTokens,
  onClose,
  onBuyTokenPack,
  onUpgradePro,
}) => {
  const totalTokens = billing?.usage?.totalTokens ?? 0;
  const totalLimit = billing?.usage?.totalLimit ?? 0;
  const isNearLimit = totalTokens > 0 && totalLimit > 0 && totalTokens >= totalLimit * 0.85;

  if (!showBuyTokens && !isNearLimit) return null;

  return (
    <Card id="buy-tokens-section" className="border-2 border-primary/50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-6 w-6 text-primary" />
              Buy More Credits
            </CardTitle>
            <CardDescription>
              Purchase additional credits to keep your AI employees working without interruption
            </CardDescription>
          </div>
          {showBuyTokens && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Warning if near limit */}
        {isNearLimit && (
          <div
            className={`mb-6 rounded-lg border p-4 ${
              totalTokens >= (totalLimit || 1) * 0.95
                ? 'border-red-500/50 bg-red-500/10'
                : 'border-yellow-500/50 bg-yellow-500/10'
            }`}
          >
            <div className="flex items-start gap-3">
              <AlertTriangle
                className={`mt-0.5 h-5 w-5 ${
                  totalTokens >= (totalLimit || 1) * 0.95 ? 'text-red-500' : 'text-yellow-500'
                }`}
              />
              <div className="flex-1">
                <h4 className="mb-1 font-semibold">
                  {totalTokens >= (totalLimit || 1) * 0.95
                    ? 'Critical: 95% Usage Reached'
                    : 'Warning: 85% Usage Reached'}
                </h4>
                <p className="text-sm text-muted-foreground">
                  You&apos;ve used {((totalTokens / (totalLimit || 1)) * 100).toFixed(1)}% of your{' '}
                  {totalLimit.toLocaleString()} credit limit. Buy more credits now to avoid service
                  interruption.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Credit Packs Grid */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {CREDIT_PACKS.map((pack) => (
            <Card
              key={pack.id}
              className={cn(
                'relative transition-all hover:shadow-lg',
                pack.popular && 'border-2 border-primary',
              )}
            >
              {pack.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-gradient-to-r from-primary to-accent text-white">
                    <Star className="mr-1 h-3 w-3" />
                    Most Popular
                  </Badge>
                </div>
              )}

              <CardHeader className="pb-4">
                <CardTitle className="text-lg">{pack.name}</CardTitle>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold">{formatCurrency(pack.price, 'USD')}</span>
                  <span className="text-sm text-muted-foreground">one-time</span>
                </div>
                {pack.savings && (
                  <Badge variant="secondary" className="mt-2 w-fit">
                    {pack.savings}
                  </Badge>
                )}
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Credits</span>
                    <span className="font-bold">{pack.credits.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Cost per credit</span>
                    <span className="font-medium">
                      {formatCurrency(pack.price / pack.credits, 'USD')}
                    </span>
                  </div>
                </div>

                <Button
                  onClick={() => onBuyTokenPack(pack)}
                  className={cn(
                    'w-full',
                    pack.popular && 'bg-gradient-to-r from-primary to-accent',
                  )}
                  variant={pack.popular ? 'default' : 'outline'}
                >
                  Buy {pack.name}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Credit Pack Benefits */}
        <div className="mt-6 rounded-lg border border-dashed bg-muted/50 p-4">
          <h4 className="mb-3 font-medium">Credit Pack Benefits</h4>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="flex items-start gap-2 text-sm">
              <CheckCircle className="mt-0.5 h-4 w-4 text-success" />
              <div>
                <span className="font-medium">Instant Activation</span>
                <p className="text-muted-foreground">
                  Credits available immediately after purchase
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2 text-sm">
              <CheckCircle className="mt-0.5 h-4 w-4 text-success" />
              <div>
                <span className="font-medium">No Expiration</span>
                <p className="text-muted-foreground">Use your credits whenever you need them</p>
              </div>
            </div>
            <div className="flex items-start gap-2 text-sm">
              <CheckCircle className="mt-0.5 h-4 w-4 text-success" />
              <div>
                <span className="font-medium">Zero Markup</span>
                <p className="text-muted-foreground">
                  Same input/output token prices as the LLM providers — no extra charge
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2 text-sm">
              <CheckCircle className="mt-0.5 h-4 w-4 text-success" />
              <div>
                <span className="font-medium">All Providers</span>
                <p className="text-muted-foreground">
                  Works with OpenAI, Claude, Gemini, Perplexity
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Alternative: Upgrade to Pro */}
        {billing?.plan === 'free' && (
          <div className="mt-6 rounded-lg border border-primary/30 bg-primary/5 p-4">
            <div className="flex items-start gap-3">
              <Crown className="mt-0.5 h-5 w-5 text-primary" />
              <div className="flex-1">
                <h4 className="mb-1 font-semibold">Better Value: Upgrade to Pro</h4>
                <p className="mb-3 text-sm text-muted-foreground">
                  Get {getPlanUsageBudgetCents('pro').toLocaleString()} credits/month for $
                  {getPlanPriceUsd('pro', 'monthly')} — better value than buying credit packs if you
                  use AI regularly
                </p>
                <Button variant="outline" size="sm" onClick={onUpgradePro}>
                  View Pro Plan
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
