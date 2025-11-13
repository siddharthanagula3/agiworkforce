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
import { Separator } from '../ui/Separator';
import { ScrollArea } from '../ui/ScrollArea';
import { usePricingStore } from '../../stores/pricingStore';
import { Download, Mail, CheckCircle2, XCircle } from 'lucide-react';
import type { InvoiceStatus } from '../../types/pricing';

export function InvoiceDetailModal() {
  const { selectedInvoice, isInvoiceDetailModalOpen, closeInvoiceDetailModal, downloadInvoice } =
    usePricingStore();

  if (!selectedInvoice) return null;

  const handleDownload = async () => {
    try {
      await downloadInvoice(selectedInvoice.id);
    } catch (error) {
      console.error('Failed to download invoice:', error);
    }
  };

  const handleEmail = () => {
    // TODO: Implement email invoice
    console.log('Email invoice:', selectedInvoice.id);
  };

  const periodStart = new Date(selectedInvoice.period_start);
  const periodEnd = new Date(selectedInvoice.period_end);

  return (
    <Dialog open={isInvoiceDetailModalOpen} onOpenChange={closeInvoiceDetailModal}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Invoice #{selectedInvoice.invoice_number}</DialogTitle>
          <DialogDescription>
            Billing Period: {periodStart.toLocaleDateString()} -{' '}
            {periodEnd.toLocaleDateString()}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Header Info */}
          <div className="flex items-start justify-between">
            <div>
              <div className="text-sm text-muted-foreground">Invoice Date</div>
              <div className="font-medium">
                {new Date(selectedInvoice.created_at).toLocaleDateString()}
              </div>
            </div>
            <StatusBadge status={selectedInvoice.status} />
          </div>

          <Separator />

          {/* Itemized List */}
          <div className="space-y-2">
            <h4 className="font-semibold">Billable Events</h4>
            <ScrollArea className="h-64 rounded-md border">
              <div className="p-4 space-y-2">
                {selectedInvoice.items.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No billable events in this period
                  </div>
                ) : (
                  selectedInvoice.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between py-2 border-b last:border-0"
                    >
                      <div className="flex items-center gap-2 flex-1">
                        {item.success ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {item.employee_name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(item.timestamp).toLocaleString()}
                          </div>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-4">
                        <div className="text-sm font-semibold">
                          ${item.billable_amount_usd.toFixed(2)}
                        </div>
                        <div className="text-xs text-green-600">
                          Saved ${item.cost_saved_usd.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          <Separator />

          {/* Summary */}
          <div className="p-4 bg-muted/30 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm">Subtotal</span>
              <span className="font-medium">${selectedInvoice.subtotal_usd.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Tax</span>
              <span className="font-medium">${selectedInvoice.tax_usd.toFixed(2)}</span>
            </div>
            <Separator className="my-2" />
            <div className="flex items-center justify-between text-lg font-bold">
              <span>Total</span>
              <span>${selectedInvoice.total_amount_usd.toFixed(2)}</span>
            </div>
          </div>

          {/* Value Summary */}
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-green-900">Total automations run</span>
              <span className="font-semibold text-green-900">
                {selectedInvoice.automations_run}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-green-900">Value delivered</span>
              <span className="text-xl font-bold text-green-600">
                ${selectedInvoice.value_delivered_usd.toLocaleString()}
              </span>
            </div>
            <div className="text-xs text-green-700 mt-2 text-center">
              {selectedInvoice.total_amount_usd > 0 &&
                `${(selectedInvoice.value_delivered_usd / selectedInvoice.total_amount_usd).toFixed(1)}x ROI`}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleEmail}>
            <Mail className="mr-2 h-4 w-4" />
            Email Invoice
          </Button>
          <Button variant="outline" onClick={handleDownload}>
            <Download className="mr-2 h-4 w-4" />
            Download PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusBadge({ status }: { status: InvoiceStatus }) {
  const variants: Record<
    InvoiceStatus,
    { variant: 'default' | 'outline' | 'secondary' | 'destructive'; label: string }
  > = {
    draft: { variant: 'outline', label: 'Draft' },
    sent: { variant: 'secondary', label: 'Sent' },
    paid: { variant: 'default', label: 'Paid' },
    refunded: { variant: 'destructive', label: 'Refunded' },
  };

  const config = variants[status];

  return <Badge variant={config.variant}>{config.label}</Badge>;
}
