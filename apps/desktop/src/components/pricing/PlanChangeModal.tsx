import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card';
import { usePricingStore } from '../../stores/pricingStore';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import { cn } from '../../lib/utils';

export function PlanChangeModal() {
  const { isPlanChangeModalOpen, closePlanChangeModal, planChangeEstimate, upgradePlan } =
    usePricingStore();

  if (!planChangeEstimate) return null;

  const { current_plan, new_plan, is_upgrade, changes, prorated_amount_usd, next_billing_date } =
    planChangeEstimate;

  const handleConfirm = async () => {
    try {
      await upgradePlan(new_plan.id, 'default-user');
    } catch (error) {
      console.error('Failed to change plan:', error);
    }
  };

  return (
    <Dialog open={isPlanChangeModalOpen} onOpenChange={closePlanChangeModal}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {is_upgrade ? 'Upgrade' : 'Downgrade'} to {new_plan.name}
          </DialogTitle>
          <DialogDescription>Review your plan change details</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Plan Comparison */}
          <div className="grid grid-cols-2 gap-4">
            <PlanComparisonCard plan={current_plan} label="Current Plan" />
            <PlanComparisonCard plan={new_plan} label="New Plan" highlighted />
          </div>

          {/* Arrow between plans */}
          <div className="flex items-center justify-center -my-4">
            <div className="bg-primary text-primary-foreground rounded-full p-2">
              <ArrowRight className="h-5 w-5" />
            </div>
          </div>

          {/* What Changes */}
          <div className="space-y-3">
            <h4 className="font-semibold">What's changing:</h4>
            <ul className="space-y-2">
              {changes.map((change, index) => (
                <li key={index} className="flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <span className="text-sm">{change}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Pricing Details */}
          <div className="p-4 bg-muted/50 rounded-lg space-y-3">
            {is_upgrade ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Prorated charge today</span>
                  <span className="font-semibold">${prorated_amount_usd.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">
                    Next billing (${new_plan.base_price_usd ?? 0}/mo)
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {new Date(next_billing_date).toLocaleDateString()}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Remaining credit</span>
                  <span className="font-semibold">${prorated_amount_usd.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">
                    New rate (${new_plan.base_price_usd ?? 0}/mo)
                  </span>
                  <span className="text-sm text-muted-foreground">
                    Starts {new Date(next_billing_date).toLocaleDateString()}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={closePlanChangeModal}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>
            {is_upgrade ? 'Upgrade Now' : 'Confirm Downgrade'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface PlanComparisonCardProps {
  plan: { name: string; base_price_usd?: number; pricing_model: string };
  label: string;
  highlighted?: boolean;
}

function PlanComparisonCard({ plan, label, highlighted }: PlanComparisonCardProps) {
  const getPrice = () => {
    if (plan.pricing_model === 'free') return '$0';
    if (plan.pricing_model === 'enterprise') return 'Custom';
    return `$${plan.base_price_usd}`;
  };

  return (
    <Card className={cn('border-2', highlighted && 'border-primary bg-primary/5')}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardDescription className="text-xs">{label}</CardDescription>
          {highlighted && (
            <Badge variant="default" className="text-xs">
              New
            </Badge>
          )}
        </div>
        <CardTitle className="text-xl">{plan.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{getPrice()}</div>
        <div className="text-xs text-muted-foreground mt-1">
          {plan.pricing_model === 'free' && 'per month'}
          {plan.pricing_model === 'pro' && 'per month'}
          {plan.pricing_model === 'pay_per_result' && 'per automation'}
          {plan.pricing_model === 'enterprise' && 'pricing'}
        </div>
      </CardContent>
    </Card>
  );
}
