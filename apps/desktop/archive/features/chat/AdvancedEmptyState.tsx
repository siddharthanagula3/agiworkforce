import React from 'react';
import { cn } from '../../lib/utils';

interface AdvancedEmptyStateProps {
  onSuggestionClick?: (text: string) => void;
  className?: string;
}

export const AdvancedEmptyState: React.FC<AdvancedEmptyStateProps> = ({ className }) => {
  return <div className={cn('flex-1 min-h-[40vh]', className)} />;
};

export default AdvancedEmptyState;
