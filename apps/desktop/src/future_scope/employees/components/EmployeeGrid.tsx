/**
 * EmployeeGrid Component
 * Grid layout for displaying employee cards with loading states
 * Updated Nov 16, 2025: Added React.memo for performance optimization
 */

import { Users } from 'lucide-react';
import { memo, useMemo } from 'react';
import { Skeleton } from '../../../components/ui/Skeleton';
import { useEmployeeStore } from '../employeeStore';
import { EmployeeCard } from './EmployeeCard';

// Updated Nov 16, 2025: Memoized LoadingSkeleton to prevent re-renders
const LoadingSkeleton = memo(function LoadingSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-6 space-y-4">
      <div className="flex items-start gap-3">
        <Skeleton className="h-12 w-12 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-20" />
        </div>
      </div>
      <Skeleton className="h-10 w-full" />
      <div className="flex gap-2">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-5 w-16" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-9 flex-1" />
        <Skeleton className="h-9 flex-1" />
      </div>
    </div>
  );
});

// Updated Nov 16, 2025: Memoized EmptyState to prevent re-renders
const EmptyState = memo(function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <Users className="h-8 w-8 text-primary" />
      </div>
      <h3 className="mb-2 text-lg font-semibold">No employees found</h3>
      <p className="mb-6 max-w-md text-sm text-muted-foreground">
        Try adjusting your filters or search query to find the perfect AI employee for your needs.
      </p>
    </div>
  );
});

// Updated Nov 16, 2025: Memoized EmployeeGrid to prevent unnecessary re-renders
export const EmployeeGrid = memo(function EmployeeGrid() {
  const filteredEmployees = useEmployeeStore(selectFilteredEmployees);
  const isLoading = useEmployeeStore((state) => state.isLoading);
  const error = useEmployeeStore((state) => state.error);

  // Updated Nov 16, 2025: Memoized skeleton array to prevent re-creation
  const skeletonArray = useMemo(() => Array.from({ length: 8 }), []);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
        <div className="mb-4 text-4xl">⚠️</div>
        <h3 className="mb-2 text-lg font-semibold">Failed to load employees</h3>
        <p className="mb-6 max-w-md text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (isLoading && filteredEmployees.length === 0) {
    return (
      <div className="grid grid-cols-1 gap-6 p-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {skeletonArray.map((_, i) => (
          <LoadingSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (filteredEmployees.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="grid grid-cols-1 gap-6 p-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {filteredEmployees.map((employee) => (
        <EmployeeCard key={employee.id} employee={employee} />
      ))}
    </div>
  );
});
