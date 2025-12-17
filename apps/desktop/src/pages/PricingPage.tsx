/**
 * PricingPage Component
 * Billing & Subscription management for AGI Workforce
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/Tabs';
import { ScrollArea } from '../components/ui/ScrollArea';
import { Activity, FileText, Wallet, Sparkles } from 'lucide-react';
import { PlansTab } from '../components/pricing/PlansTab';
import { UsageTab } from '../components/pricing/UsageTab';
import { InvoicesTab } from '../components/pricing/InvoicesTab';
import { PaymentMethodsTab } from '../components/pricing/PaymentMethodsTab';
import { InvoiceDetailModal } from '../components/pricing/InvoiceDetailModal';
import { PlanChangeModal } from '../components/pricing/PlanChangeModal';
import { usePricingStore } from '../stores/pricingStore';
import { cn } from '../lib/utils';

const tabs = [
  { id: 'plans', label: 'Plans', icon: Sparkles, description: 'Choose your plan' },
  { id: 'usage', label: 'Usage', icon: Activity, description: 'Track your usage' },
  { id: 'invoices', label: 'Invoices', icon: FileText, description: 'Billing history' },
  { id: 'payment', label: 'Payment', icon: Wallet, description: 'Payment methods' },
] as const;

type TabId = (typeof tabs)[number]['id'];

export function PricingPage() {
  const { fetchPlans, fetchCurrentPlan } = usePricingStore();
  const [activeTab, setActiveTab] = useState<TabId>('plans');

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
    <div className="flex h-full flex-col bg-zinc-950">
      {/* Tab Navigation */}
      <div className="border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur-xl sticky top-0 z-10">
        <div className="px-6 py-2">
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabId)}>
            <TabsList className="h-14 bg-transparent gap-1">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;

                return (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    className={cn(
                      'relative px-4 py-2 rounded-lg transition-all duration-200 group',
                      'data-[state=active]:bg-zinc-800/50',
                      'hover:bg-zinc-800/30',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Icon
                        className={cn(
                          'w-4 h-4 transition-colors',
                          isActive ? 'text-violet-400' : 'text-zinc-500 group-hover:text-zinc-300',
                        )}
                      />
                      <span
                        className={cn(
                          'font-medium transition-colors',
                          isActive ? 'text-white' : 'text-zinc-400 group-hover:text-zinc-200',
                        )}
                      >
                        {tab.label}
                      </span>
                    </div>

                    {/* Active indicator */}
                    {isActive && (
                      <motion.div
                        layoutId="activeTab"
                        className="absolute bottom-0 left-2 right-2 h-0.5 bg-gradient-to-r from-violet-500 to-cyan-500 rounded-full"
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      />
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Tab Content */}
      <ScrollArea className="flex-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            <Tabs value={activeTab}>
              <TabsContent value="plans" className="mt-0 focus-visible:outline-none">
                <PlansTab />
              </TabsContent>

              <TabsContent value="usage" className="mt-0 focus-visible:outline-none">
                <UsageTab />
              </TabsContent>

              <TabsContent value="invoices" className="mt-0 focus-visible:outline-none">
                <InvoicesTab />
              </TabsContent>

              <TabsContent value="payment" className="mt-0 focus-visible:outline-none">
                <PaymentMethodsTab />
              </TabsContent>
            </Tabs>
          </motion.div>
        </AnimatePresence>
      </ScrollArea>

      {/* Modals */}
      <InvoiceDetailModal />
      <PlanChangeModal />
    </div>
  );
}
