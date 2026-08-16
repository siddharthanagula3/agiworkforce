import React from 'react';
import { cn } from '../../lib/utils';

interface SimpleEmptyStateProps {
  onSuggestionClick?: (text: string) => void;
  className?: string;
}

export const SimpleEmptyState: React.FC<SimpleEmptyStateProps> = ({ className }) => {
  return <div className={cn('flex-1 min-h-[40vh]', className)} />;
};

export default SimpleEmptyState;
