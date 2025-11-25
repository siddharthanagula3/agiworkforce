/**
 * DemoResultsModal Component
 * Celebration modal showing demo results and encouraging user to hire
 */

import { CheckCircle, CheckCircle2, Clock, DollarSign, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Dialog, DialogContent, DialogFooter, DialogTitle } from '../../../components/ui/Dialog';
import { useEmployeeStore } from '../employeeStore';

function MetricCard({
  icon: Icon,
  label,
  value,
  subtext,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  subtext: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
        <Icon className="h-6 w-6 text-primary" />
      </div>
      <div className="mb-1 text-sm font-medium text-muted-foreground">{label}</div>
      <div className="mb-1 text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{subtext}</div>
    </div>
  );
}

export function DemoResultsModal() {
  const { demoResults, clearDemoResults, hireEmployee, employees } = useEmployeeStore();
  const [isHiring, setIsHiring] = useState(false);

  if (!demoResults) return null;

  const employee = employees.find((e) => e.id === demoResults.employee_id);
  const isAlreadyHired = employee?.is_hired;

  const handleClose = () => {
    clearDemoResults();
  };

  const handleHire = async () => {
    if (isAlreadyHired) return;

    setIsHiring(true);
    try {
      await hireEmployee(demoResults.employee_id, 'default-user');
      // Keep modal open briefly to show success, then close
      setTimeout(() => {
        clearDemoResults();
      }, 1000);
    } catch (error) {
      console.error('Failed to hire employee:', error);
      setIsHiring(false);
    }
  };

  // Calculate monthly projections (assuming 20 runs per month)
  const monthlyRuns = 20;
  const monthlyTimeSaved = Math.round((demoResults.time_saved_minutes * monthlyRuns) / 60); // hours
  const monthlyCostSaved = Math.round(demoResults.cost_saved_usd * monthlyRuns);

  return (
    <Dialog open={true} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        {/* Success Header */}
        <div className="text-center space-y-4 pt-6">
          <div className="mx-auto w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center animate-in zoom-in duration-300">
            <CheckCircle className="w-12 h-12 text-green-500" />
          </div>
          <DialogTitle className="text-3xl font-bold">Demo Complete!</DialogTitle>
          <p className="text-muted-foreground text-lg">
            {demoResults.employee_name} completed the demo in{' '}
            <span className="font-semibold text-foreground">
              {Math.round(demoResults.execution_time_ms / 1000)}s
            </span>
          </p>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-3 gap-4 my-8">
          <MetricCard
            icon={Clock}
            label="Time Saved"
            value={`${demoResults.time_saved_minutes} min`}
            subtext="vs manual work"
          />
          <MetricCard
            icon={DollarSign}
            label="Cost Saved"
            value={`$${demoResults.cost_saved_usd}`}
            subtext="at $50/hr"
          />
          <MetricCard
            icon={TrendingUp}
            label="Quality Score"
            value={`${(demoResults.quality_score * 100).toFixed(0)}%`}
            subtext="accuracy"
          />
        </div>

        {/* Actions Taken */}
        <div className="space-y-3 mb-6">
          <h4 className="font-semibold text-lg">What {demoResults.employee_name} did:</h4>
          <div className="rounded-lg border bg-muted/30 p-4">
            <ul className="space-y-2">
              {demoResults.actions_taken.map((action, i) => (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>{action}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Sample Output */}
        {demoResults.sample_output && (
          <div className="space-y-2 mb-6">
            <h4 className="font-semibold">Sample Output:</h4>
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {demoResults.sample_output}
              </p>
            </div>
          </div>
        )}

        {/* Monthly Projection */}
        <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-lg p-6 mb-6">
          <h4 className="font-semibold mb-4 text-lg">Monthly Projection</h4>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="text-3xl font-bold text-primary mb-1">{monthlyTimeSaved} hours</div>
              <div className="text-sm text-muted-foreground">Time saved per month</div>
              <div className="text-xs text-muted-foreground mt-1">
                Based on {monthlyRuns} runs/month
              </div>
            </div>
            <div>
              <div className="text-3xl font-bold text-primary mb-1">${monthlyCostSaved}</div>
              <div className="text-sm text-muted-foreground">Value generated</div>
              <div className="text-xs text-muted-foreground mt-1">
                {Math.round(monthlyCostSaved / (employee?.monthly_price || 39))}x ROI
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-3 sm:gap-3">
          <Button variant="outline" onClick={handleClose} className="flex-1" disabled={isHiring}>
            Maybe Later
          </Button>
          {isAlreadyHired ? (
            <Button variant="secondary" disabled className="flex-1">
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Already Hired
            </Button>
          ) : (
            <Button
              onClick={handleHire}
              disabled={isHiring}
              className="flex-1 text-lg py-6"
              size="lg"
            >
              {isHiring ? (
                'Hiring...'
              ) : (
                <>
                  Hire {demoResults.employee_name} - ${employee?.monthly_price || 39}/mo
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
