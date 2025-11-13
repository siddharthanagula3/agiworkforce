/**
 * PricingPage Component
 * Outcome-based pricing system for AGI Workforce
 * Pay-for-results model with transparent usage tracking
 */

import { useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/Tabs';
import { ScrollArea } from '../components/ui/ScrollArea';
import { DollarSign, Activity, FileText } from 'lucide-react';
import { PricingHero } from '../components/pricing/PricingHero';
import { PlansTab } from '../components/pricing/PlansTab';
import { UsageTab } from '../components/pricing/UsageTab';
import { InvoicesTab } from '../components/pricing/InvoicesTab';
import { InvoiceDetailModal } from '../components/pricing/InvoiceDetailModal';
import { PlanChangeModal } from '../components/pricing/PlanChangeModal';
import { usePricingStore } from '../stores/pricingStore';

export function PricingPage() {
  const { fetchPlans, fetchCurrentPlan } = usePricingStore();
  const [activeTab, setActiveTab] = useState<'plans' | 'usage' | 'invoices'>('plans');

  // Initialize data on mount
  useEffect(() => {
    const initializeData = async () => {
      try {
        await Promise.all([fetchPlans(), fetchCurrentPlan('default-user')]);
      } catch (error) {
        console.error('Failed to initialize pricing data:', error);
      }
    };

    void initializeData();
  }, [fetchPlans, fetchCurrentPlan]);

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Hero Section */}
      <PricingHero />

      {/* Tabs */}
      <div className="border-b border-border/60">
        <div className="px-6">
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)}>
            <TabsList className="h-12 bg-transparent border-b-0">
              <TabsTrigger
                value="plans"
                className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"
              >
                <DollarSign className="mr-2 h-4 w-4" />
                Plans & Pricing
              </TabsTrigger>
              <TabsTrigger
                value="usage"
                className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"
              >
                <Activity className="mr-2 h-4 w-4" />
                My Usage
              </TabsTrigger>
              <TabsTrigger
                value="invoices"
                className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"
              >
                <FileText className="mr-2 h-4 w-4" />
                Invoices
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Tab Content */}
      <ScrollArea className="flex-1">
        <Tabs value={activeTab}>
          <TabsContent value="plans" className="mt-0">
            <PlansTab />
          </TabsContent>

          <TabsContent value="usage" className="mt-0">
            <UsageTab />
          </TabsContent>

          <TabsContent value="invoices" className="mt-0">
            <InvoicesTab />
          </TabsContent>
        </Tabs>
      </ScrollArea>

      {/* Modals */}
      <InvoiceDetailModal />
      <PlanChangeModal />
    </div>
  );
}
