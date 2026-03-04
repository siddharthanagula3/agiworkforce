import { ArrowUpDown } from 'lucide-react';
import { Button } from '@shared/ui/button';

// Helper function to create sortable header
export const createSortableHeader = (label: string) => {
  const SortableHeader = ({
    column,
  }: {
    column: { toggleSorting: (desc: boolean) => void; getIsSorted: () => false | 'asc' | 'desc' };
  }) => {
    return (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        className="p-0 font-medium hover:bg-transparent"
      >
        {label}
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    );
  };
  SortableHeader.displayName = `SortableHeader(${label})`;
  return SortableHeader;
};
