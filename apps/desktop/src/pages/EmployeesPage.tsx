/**
 * EmployeesPage Component
 * Main page for the AI Employee Library marketplace
 */

import { useEffect, useState } from 'react';
import { ScrollArea } from '../components/ui/ScrollArea';
import { Button } from '../components/ui/Button';
import { Users } from 'lucide-react';
import { EmployeeHero } from '../components/employees/EmployeeHero';
import { EmployeeFilters } from '../components/employees/EmployeeFilters';
import { EmployeeGrid } from '../components/employees/EmployeeGrid';
import { EmployeeDetailModal } from '../components/employees/EmployeeDetailModal';
import { DemoResultsModal } from '../components/employees/DemoResultsModal';
import { MyEmployeesView } from '../components/employees/MyEmployeesView';
import { useEmployeeStore } from '../stores/employeeStore';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/Tabs';

export function EmployeesPage() {
  const {
    fetchAllEmployees,
    fetchMyEmployees,
    fetchFeaturedEmployees,
    fetchEmployeeStats,
    myEmployees,
  } = useEmployeeStore();

  const [activeTab, setActiveTab] = useState<'browse' | 'my-employees'>('browse');

  // Initialize data on mount
  useEffect(() => {
    const initializeData = async () => {
      try {
        await Promise.all([
          fetchAllEmployees(),
          fetchFeaturedEmployees(),
          fetchMyEmployees('default-user'),
          fetchEmployeeStats('default-user'),
        ]);
      } catch (error) {
        console.error('Failed to initialize employee data:', error);
      }
    };

    void initializeData();
  }, [fetchAllEmployees, fetchFeaturedEmployees, fetchMyEmployees, fetchEmployeeStats]);

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Tabs for switching between Browse and My Employees */}
      <div className="border-b border-border/60 bg-background/95 backdrop-blur-sm">
        <div className="px-6">
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)}>
            <TabsList className="h-12 bg-transparent border-b-0">
              <TabsTrigger
                value="browse"
                className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"
              >
                <Users className="mr-2 h-4 w-4" />
                Browse Library
              </TabsTrigger>
              <TabsTrigger
                value="my-employees"
                className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"
              >
                <Users className="mr-2 h-4 w-4" />
                My Employees
                {myEmployees.length > 0 && (
                  <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                    {myEmployees.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'browse' ? (
        <>
          {/* Hero Section */}
          <EmployeeHero />

          {/* Search & Filters */}
          <EmployeeFilters />

          {/* Employee Grid */}
          <ScrollArea className="flex-1">
            <EmployeeGrid />
          </ScrollArea>
        </>
      ) : (
        <MyEmployeesView />
      )}

      {/* Modals */}
      <EmployeeDetailModal />
      <DemoResultsModal />
    </div>
  );
}
