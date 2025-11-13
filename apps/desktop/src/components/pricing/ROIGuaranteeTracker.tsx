import { useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card';
import { Progress } from '../ui/Progress';
import { Alert, AlertDescription, AlertTitle } from '../ui/Alert';
import { usePricingStore } from '../../stores/pricingStore';
import { CheckCircle, TrendingUp, AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';

interface ROIGuaranteeTrackerProps {
  subscriptionId: string;
}

export function ROIGuaranteeTracker({ subscriptionId }: ROIGuaranteeTrackerProps) {
  const { roiGuarantee, fetchROIGuarantee, roiLoading } = usePricingStore();

  useEffect(() => {
    void fetchROIGuarantee(subscriptionId);
  }, [subscriptionId, fetchROIGuarantee]);

  if (roiLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground">Loading ROI guarantee...</div>
        </CardContent>
      </Card>
    );
  }

  if (!roiGuarantee) {
    return null;
  }

  const promisedHours = roiGuarantee.promised_hours;
  const actualHours = roiGuarantee.actual_hours;
  const progressPercentage = (actualHours / promisedHours) * 100;
  const hoursRemaining = Math.max(0, promisedHours - actualHours);

  const now = Date.now();
  const daysRemaining = Math.max(
    0,
    Math.floor((roiGuarantee.ends_at - now) / (1000 * 60 * 60 * 24)),
  );

  const getStatusColor = () => {
    if (roiGuarantee.status === 'exceeded') return 'bg-green-50 border-green-200';
    if (roiGuarantee.status === 'met') return 'bg-green-50 border-green-200';
    if (roiGuarantee.status === 'failed') return 'bg-red-50 border-red-200';
    return 'bg-blue-50 border-blue-200';
  };

  const getStatusIcon = () => {
    if (roiGuarantee.status === 'exceeded' || roiGuarantee.status === 'met') {
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    }
    if (roiGuarantee.status === 'failed') {
      return <AlertTriangle className="h-5 w-5 text-red-500" />;
    }
    return <TrendingUp className="h-5 w-5 text-blue-500" />;
  };

  const getStatusMessage = () => {
    if (roiGuarantee.status === 'exceeded') {
      return {
        title: 'Guarantee Exceeded!',
        description: `You've saved ${actualHours - promisedHours}h more than guaranteed`,
      };
    }
    if (roiGuarantee.status === 'met') {
      return {
        title: 'Guarantee Met!',
        description: `You've met your guaranteed ${promisedHours}h savings`,
      };
    }
    if (roiGuarantee.status === 'failed') {
      return {
        title: 'Refund Issued',
        description: `We didn't meet our guarantee. A full refund of $${roiGuarantee.refund_amount_usd?.toFixed(2) ?? 0} has been processed.`,
      };
    }
    return {
      title: 'On Track',
      description: `${hoursRemaining}h remaining to meet guarantee`,
    };
  };

  const status = getStatusMessage();

  return (
    <Card>
      <CardHeader>
        <CardTitle>ROI Guarantee Progress</CardTitle>
        <CardDescription>
          We guarantee you'll save at least {promisedHours}h over {roiGuarantee.period_days} days
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span>Hours saved this period</span>
            <span className="font-semibold">
              {actualHours} / {promisedHours}h
            </span>
          </div>
          <Progress
            value={progressPercentage}
            className={cn(
              progressPercentage >= 100 && '[&>div]:bg-green-500',
              progressPercentage < 100 && progressPercentage >= 80 && '[&>div]:bg-blue-500',
            )}
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{progressPercentage.toFixed(0)}% complete</span>
            <span>{daysRemaining} days remaining</span>
          </div>
        </div>

        {/* Status Card */}
        <div className={cn('p-4 rounded-lg border', getStatusColor())}>
          <div className="flex items-start gap-3">
            {getStatusIcon()}
            <div className="flex-1">
              <div className="font-semibold">{status.title}</div>
              <div className="text-sm mt-1">{status.description}</div>
            </div>
          </div>
        </div>

        {/* Refund Alert */}
        {roiGuarantee.refund_issued && roiGuarantee.refund_amount_usd && (
          <Alert variant="default" className="border-green-200 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertTitle className="text-green-900">Refund Processed</AlertTitle>
            <AlertDescription className="text-green-700">
              A refund of ${roiGuarantee.refund_amount_usd.toFixed(2)} has been issued to your
              original payment method.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
