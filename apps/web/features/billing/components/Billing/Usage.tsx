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
import { Progress } from '@agiworkforce/ui';
import {
  Download,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Zap,
  FileText,
  Settings,
  ExternalLink,
  CreditCard,
  XCircle,
  Clock,
} from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { BillingInfo } from './types';

interface UsageProps {
  billing: BillingInfo | null;
  isManagingBilling: boolean;
  invoicesLoading: boolean;
  paymentMethodsLoading: boolean;
  paymentMethodsData:
    | Array<{
        id: string;
        type: string;
        isDefault: boolean;
        card?: {
          brand: string;
          last4: string;
          expMonth: number;
          expYear: number;
        };
      }>
    | null
    | undefined;
  onManageBilling: () => void;
  onDownloadInvoice: (invoiceId: string) => void;
  formatCurrency: (amount: number, currency: string) => string;
  formatDate: (dateString: string) => string;
}

export const Usage: React.FC<UsageProps> = ({
  billing,
  isManagingBilling,
  invoicesLoading,
  paymentMethodsLoading,
  paymentMethodsData,
  onManageBilling,
  onDownloadInvoice,
  formatCurrency,
  formatDate,
}) => {
  const usagePercent = Math.min(100, Math.max(0, billing?.usage.usedPercent ?? 0));

  return (
    <>
      {/* Total Usage Overview */}
      <div className="grid grid-cols-1 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Zap className="h-5 w-5" />
              <span>Plan Usage</span>
            </CardTitle>
            <CardDescription>Managed usage in your current billing period</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Current period</span>
                <span className="text-2xl font-bold">{usagePercent.toFixed(0)}% used</span>
              </div>
              <Progress value={usagePercent} className="h-3" />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {(100 - usagePercent).toFixed(0)}% remaining
                </span>
                <span className="font-medium">
                  Resets{' '}
                  {billing?.current_period_end
                    ? formatDate(billing.current_period_end)
                    : 'on your next billing date'}
                </span>
              </div>
              {usagePercent >= 80 && (
                <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-500">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Approaching limit - {(100 - usagePercent).toFixed(0)}% remaining</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Payment Methods */}
      {billing?.plan !== 'free' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <CreditCard className="h-5 w-5" />
              <span>Payment Methods</span>
            </CardTitle>
            <CardDescription>Your saved payment methods</CardDescription>
          </CardHeader>
          <CardContent>
            {paymentMethodsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (paymentMethodsData ?? []).length === 0 ? (
              <div className="py-8 text-center">
                <CreditCard className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
                <p className="text-sm font-medium">No payment methods on file</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Add a payment method through the billing portal
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={onManageBilling}
                  disabled={isManagingBilling}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Manage in Portal
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {(paymentMethodsData ?? []).map((pm) => {
                  const isExpired =
                    pm.card && new Date(pm.card.expYear, pm.card.expMonth - 1) < new Date();
                  return (
                    <div
                      key={pm.id}
                      className={cn(
                        'flex items-center justify-between rounded-lg border p-4',
                        isExpired && 'border-destructive/30 bg-destructive/5',
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                          <CreditCard className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium capitalize">
                              {pm.card?.brand ?? pm.type} ending in {pm.card?.last4 ?? '••••'}
                            </p>
                            {pm.isDefault && (
                              <Badge variant="secondary" className="text-xs">
                                Default
                              </Badge>
                            )}
                            {isExpired && (
                              <Badge variant="destructive" className="text-xs">
                                Expired
                              </Badge>
                            )}
                          </div>
                          {pm.card && (
                            <p className="text-sm text-muted-foreground">
                              Expires {String(pm.card.expMonth).padStart(2, '0')}/{pm.card.expYear}
                              {isExpired && (
                                <span className="ml-2 text-destructive">
                                  · Please update your card
                                </span>
                              )}
                            </p>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={onManageBilling}
                        disabled={isManagingBilling}
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={onManageBilling}
                  disabled={isManagingBilling}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Manage Payment Methods
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Invoice History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <FileText className="h-5 w-5" />
            <span>Invoice History</span>
          </CardTitle>
          <CardDescription>Your recent invoices and payments</CardDescription>
        </CardHeader>
        <CardContent>
          {invoicesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : billing?.invoices.length === 0 ? (
            <div className="py-12 text-center">
              <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-muted">
                <FileText className="h-12 w-12 text-muted-foreground" />
              </div>
              <h3 className="mb-2 text-lg font-semibold">No Invoices Yet</h3>
              <p className="text-muted-foreground">
                Your invoice history will appear here once you start using paid features.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {billing?.invoices.map((invoice) => {
                const statusConfig = {
                  paid: {
                    icon: <CheckCircle className="h-4 w-4 text-success" />,
                    variant: 'default' as const,
                    label: 'Paid',
                  },
                  pending: {
                    icon: <Clock className="h-4 w-4 text-amber-500" />,
                    variant: 'secondary' as const,
                    label: 'Pending',
                  },
                  failed: {
                    icon: <XCircle className="h-4 w-4 text-destructive" />,
                    variant: 'destructive' as const,
                    label: 'Failed',
                  },
                };
                const config = statusConfig[invoice.status] ?? statusConfig.pending;
                return (
                  <div
                    key={invoice.id}
                    className={cn(
                      'flex items-center justify-between rounded-lg border p-4',
                      invoice.status === 'failed' && 'border-destructive/30 bg-destructive/5',
                      invoice.status === 'pending' && 'border-amber-500/30 bg-amber-500/5',
                    )}
                  >
                    <div className="flex items-center space-x-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium">
                          Invoice #{invoice.id.slice(0, 8).toUpperCase()}
                        </p>
                        <p className="text-sm text-muted-foreground">{formatDate(invoice.date)}</p>
                        {invoice.status === 'failed' && (
                          <p className="mt-0.5 text-xs text-destructive">
                            Payment failed · please update your payment method
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <div className="text-right">
                        <p className="font-medium">
                          {formatCurrency(invoice.amount, billing?.currency || 'USD')}
                        </p>
                        <Badge variant={config.variant} className="flex items-center gap-1">
                          {config.icon}
                          {config.label}
                        </Badge>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onDownloadInvoice(invoice.id)}
                        title="Download invoice"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
};
