import { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/Table';
import { usePricingStore } from '../../stores/pricingStore';
import { Download, Mail, Eye, TrendingUp, DollarSign, FileText } from 'lucide-react';
import type { Invoice, InvoiceStatus } from '../../types/pricing';

export function InvoicesTab() {
  const { invoices, fetchInvoices, selectInvoice, openInvoiceDetailModal } = usePricingStore();

  useEffect(() => {
    void fetchInvoices('default-user');
  }, [fetchInvoices]);

  // Calculate totals
  const totalSpent = invoices.reduce((sum, inv) => sum + inv.total_amount_usd, 0);
  const totalValue = invoices.reduce((sum, inv) => sum + inv.value_delivered_usd, 0);
  const roiMultiplier = totalSpent > 0 ? totalValue / totalSpent : 0;

  const handleViewInvoice = (invoice: Invoice) => {
    selectInvoice(invoice);
    openInvoiceDetailModal();
  };

  return (
    <div className="p-6 space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-muted-foreground mb-1">Total Spent</div>
                <div className="text-2xl font-bold">${totalSpent.toLocaleString()}</div>
              </div>
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-muted-foreground mb-1">Total Value Delivered</div>
                <div className="text-2xl font-bold text-green-600">
                  ${totalValue.toLocaleString()}
                </div>
              </div>
              <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-muted-foreground mb-1">Net ROI</div>
                <div className="text-2xl font-bold text-primary">
                  {roiMultiplier.toFixed(1)}x
                </div>
              </div>
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <FileText className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Invoice Table */}
      <Card>
        <CardHeader>
          <CardTitle>Invoice History</CardTitle>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No invoices yet</p>
              <p className="text-sm mt-1">Your invoices will appear here</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Automations</TableHead>
                  <TableHead>Value Delivered</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => (
                  <InvoiceRow
                    key={invoice.id}
                    invoice={invoice}
                    onView={() => handleViewInvoice(invoice)}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface InvoiceRowProps {
  invoice: Invoice;
  onView: () => void;
}

function InvoiceRow({ invoice, onView }: InvoiceRowProps) {
  const { downloadInvoice } = usePricingStore();

  const periodStart = new Date(invoice.period_start);
  const periodEnd = new Date(invoice.period_end);

  const formatPeriod = () => {
    return `${periodStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${periodEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  };

  const handleDownload = async () => {
    try {
      await downloadInvoice(invoice.id);
    } catch (error) {
      console.error('Failed to download invoice:', error);
    }
  };

  return (
    <TableRow>
      <TableCell className="font-medium">#{invoice.invoice_number}</TableCell>
      <TableCell>{formatPeriod()}</TableCell>
      <TableCell className="font-semibold">${invoice.total_amount_usd.toFixed(2)}</TableCell>
      <TableCell>{invoice.automations_run}</TableCell>
      <TableCell className="text-green-600 font-semibold">
        ${invoice.value_delivered_usd.toLocaleString()}
      </TableCell>
      <TableCell>
        <StatusBadge status={invoice.status} />
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onView}>
            <Eye className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleDownload}>
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function StatusBadge({ status }: { status: InvoiceStatus }) {
  const variants: Record<InvoiceStatus, { variant: 'default' | 'outline' | 'secondary'; label: string }> = {
    draft: { variant: 'outline', label: 'Draft' },
    sent: { variant: 'secondary', label: 'Sent' },
    paid: { variant: 'default', label: 'Paid' },
    refunded: { variant: 'outline', label: 'Refunded' },
  };

  const config = variants[status];

  return <Badge variant={config.variant}>{config.label}</Badge>;
}
