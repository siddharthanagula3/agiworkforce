'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';
import { CreditCard, Loader2 } from 'lucide-react';
import { addCsrfHeaders } from '@/lib/client/csrf';

export function ManageBillingButton() {
  const [loading, setLoading] = useState(false);

  const handleManage = async () => {
    setLoading(true);
    try {
      const headers = await addCsrfHeaders({ 'Content-Type': 'application/json' });
      const res = await fetch('/api/portal', {
        method: 'POST',
        headers,
      });
      const data = await res.json();
      if (!res.ok) {
        const errorMessage =
          data.error?.message ||
          (typeof data.error === 'string' ? data.error : 'Failed to open portal');
        throw new Error(errorMessage);
      }
      if (data.url) window.location.href = data.url;
    } catch (err) {
      console.error('Portal error:', err);
      // Optional: Add toast notification here
      alert('Failed to load billing portal. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="outline" className="gap-2" onClick={handleManage} disabled={loading}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
      Manage Billing in Stripe
    </Button>
  );
}
