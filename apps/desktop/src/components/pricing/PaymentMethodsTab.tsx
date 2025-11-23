/**
 * PaymentMethodsTab Component
 * Manages payment methods (credit cards) for billing
 */

import { useEffect, useState } from 'react';
import { Card, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { CreditCard, Plus, Trash2, Star, AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useBillingStore } from '../../stores/billingStore';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/AlertDialog';
import { toast } from 'sonner';

interface PaymentMethodInfo {
  id: string;
  customer_id: string;
  stripe_payment_method_id: string;
  payment_type: string;
  card_brand?: string;
  card_last4?: string;
  card_exp_month?: number;
  card_exp_year?: number;
  is_default: boolean;
  created_at: number;
  updated_at: number;
}

export function PaymentMethodsTab() {
  const { customer } = useBillingStore();
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [methodToDelete, setMethodToDelete] = useState<PaymentMethodInfo | null>(null);

  useEffect(() => {
    if (customer) {
      void fetchPaymentMethods();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer]); // fetchPaymentMethods is stable, no need to include

  const fetchPaymentMethods = async () => {
    if (!customer) return;

    setLoading(true);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const methods = await invoke<PaymentMethodInfo[]>('stripe_get_payment_methods', {
        customerStripeId: customer.stripe_customer_id,
      });
      setPaymentMethods(methods);
    } catch (error) {
      console.error('Failed to fetch payment methods:', error);
      toast.error('Failed to load payment methods');
    } finally {
      setLoading(false);
    }
  };

  const handleAddPaymentMethod = async () => {
    if (!customer) {
      toast.error('Please create a customer account first');
      return;
    }

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const clientSecret = await invoke<string>('stripe_create_setup_intent', {
        customerStripeId: customer.stripe_customer_id,
      });

      if (!clientSecret) {
        toast.error('Failed to create payment setup');
        return;
      }

      // Redirect to Stripe Checkout for payment method setup
      // In production, you would use Stripe.js Payment Element or redirect to Stripe Checkout
      // For now, we'll open Stripe's hosted setup page
      const setupUrl = `https://pay.stripe.com/setup/${clientSecret.split('_secret_')[0]}`;
      
      // Open in external browser for security (Stripe handles the setup)
      window.open(setupUrl, '_blank');
      
      toast.info('Opening payment method setup. Please complete the form and return here.');
      
      // Refresh payment methods after a delay (user should complete setup)
      setTimeout(() => {
        void fetchPaymentMethods();
      }, 5000);
    } catch (error) {
      console.error('Failed to add payment method:', error);
      toast.error('Failed to add payment method');
    }
  };

  const handleSetDefault = async (methodId: string) => {
    if (!customer) return;

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('stripe_set_default_payment_method', {
        customerStripeId: customer.stripe_customer_id,
        paymentMethodId: methodId,
      });
      await fetchPaymentMethods();
      toast.success('Default payment method updated');
    } catch (error) {
      console.error('Failed to set default payment method:', error);
      toast.error('Failed to update default payment method');
    }
  };

  const handleDelete = async () => {
    if (!methodToDelete) return;

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('stripe_delete_payment_method', {
        paymentMethodId: methodToDelete.stripe_payment_method_id,
      });
      await fetchPaymentMethods();
      toast.success('Payment method removed');
      setDeleteDialogOpen(false);
      setMethodToDelete(null);
    } catch (error) {
      console.error('Failed to delete payment method:', error);
      toast.error('Failed to remove payment method');
    }
  };

  const openDeleteDialog = (method: PaymentMethodInfo) => {
    setMethodToDelete(method);
    setDeleteDialogOpen(true);
  };

  const getCardBrandIcon = (_brand?: string) => {
    // Return appropriate icon based on card brand
    return <CreditCard className="h-5 w-5" />;
  };

  const formatExpiry = (month?: number, year?: number) => {
    if (!month || !year) return 'N/A';
    return `${String(month).padStart(2, '0')}/${String(year).slice(-2)}`;
  };

  if (!customer) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Customer Account</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Please subscribe to a plan to add payment methods.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Payment Methods</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your payment methods for subscriptions
          </p>
        </div>
        <Button onClick={handleAddPaymentMethod} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Payment Method
        </Button>
      </div>

      {/* Payment Methods List */}
      {loading ? (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                <p className="text-sm text-muted-foreground">Loading payment methods...</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : paymentMethods.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CreditCard className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Payment Methods</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Add a payment method to enable subscriptions and automatic billing.
              </p>
              <Button onClick={handleAddPaymentMethod} variant="outline" className="gap-2">
                <Plus className="h-4 w-4" />
                Add Payment Method
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {paymentMethods.map((method) => (
            <Card
              key={method.id}
              className={cn(
                'transition-all',
                method.is_default && 'ring-2 ring-primary',
              )}
            >
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                      {getCardBrandIcon(method.card_brand)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">
                          {method.card_brand ? `${method.card_brand.toUpperCase()} ` : ''}
                          •••• {method.card_last4 || '****'}
                        </span>
                        {method.is_default && (
                          <Badge variant="default" className="gap-1">
                            <Star className="h-3 w-3 fill-current" />
                            Default
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        Expires {formatExpiry(method.card_exp_month, method.card_exp_year)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!method.is_default && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSetDefault(method.id)}
                      >
                        Set as Default
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openDeleteDialog(method)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Payment Method?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this payment method? This action cannot be undone.
              {methodToDelete?.is_default && (
                <span className="block mt-2 text-destructive font-medium">
                  This is your default payment method. Removing it may affect your subscription.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

