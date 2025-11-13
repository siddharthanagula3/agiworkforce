import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card';
import { Label } from '../ui/Label';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Slider } from '../ui/Slider';
import { Separator } from '../ui/Separator';
import { usePricingStore } from '../../stores/pricingStore';
import { TrendingUp } from 'lucide-react';

export function PricingCalculator() {
  const [hoursPerMonth, setHoursPerMonth] = useState(40);
  const [hourlyRate, setHourlyRate] = useState(50);
  const { calculateEstimate, costEstimate, subscribeToPlan } = usePricingStore();

  useEffect(() => {
    calculateEstimate(hoursPerMonth, hourlyRate);
  }, [hoursPerMonth, hourlyRate, calculateEstimate]);

  const handleSubscribe = async () => {
    try {
      // In production, get real userId
      await subscribeToPlan('pro', 'default-user');
    } catch (error) {
      console.error('Failed to subscribe:', error);
    }
  };

  const valueSaved = costEstimate?.value_saved_usd ?? 0;
  const planCost = costEstimate?.plan_cost_usd ?? 39;
  const netSavings = costEstimate?.net_savings_usd ?? 0;
  const roiMultiplier = costEstimate?.roi_multiplier ?? 0;

  return (
    <Card className="sticky top-4">
      <CardHeader>
        <CardTitle>Calculate Your Savings</CardTitle>
        <CardDescription>See how much AGI Workforce saves you</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Hours Slider */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="hours-slider">Hours automated per month</Label>
            <span className="text-sm font-semibold text-primary">{hoursPerMonth}h</span>
          </div>
          <Slider
            id="hours-slider"
            value={[hoursPerMonth]}
            onValueChange={([value]) => setHoursPerMonth(value ?? 40)}
            max={200}
            min={5}
            step={5}
            className="w-full"
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>5h</span>
            <span>200h</span>
          </div>
        </div>

        {/* Hourly Rate Input */}
        <div className="space-y-2">
          <Label htmlFor="hourly-rate">Your hourly rate (USD)</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              $
            </span>
            <Input
              id="hourly-rate"
              type="number"
              value={hourlyRate}
              onChange={(e) => setHourlyRate(Number(e.target.value))}
              className="pl-7"
              min={1}
              step={1}
            />
          </div>
        </div>

        {/* Results */}
        <div className="mt-6 p-4 bg-primary/5 border border-primary/10 rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Time saved</span>
            <span className="font-semibold">{hoursPerMonth}h/month</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Value generated</span>
            <span className="font-semibold text-green-600">${valueSaved.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Your cost (Pro)</span>
            <span className="font-semibold">${planCost}</span>
          </div>
          <Separator className="my-2" />
          <div className="flex items-center justify-between">
            <span className="font-semibold">Net savings</span>
            <span className="text-2xl font-bold text-primary">
              ${netSavings.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center justify-center gap-2 mt-3 p-2 bg-primary/10 rounded-md">
            <TrendingUp className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-primary">
              {roiMultiplier.toFixed(1)}x ROI
            </span>
          </div>
        </div>

        <Button className="w-full" size="lg" onClick={handleSubscribe}>
          Start Saving - ${planCost}/mo
        </Button>

        <p className="text-xs text-center text-muted-foreground">
          No credit card required for free trial
        </p>
      </CardContent>
    </Card>
  );
}
