'use client';

/**
 * AI Agent Card Component
 * Displays an AI agent card with details and chat functionality
 *
 * Performance optimizations:
 * - React.memo to prevent unnecessary re-renders when parent re-renders
 */

import React, { memo } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@shared/ui/card';
import { Button } from '@shared/ui/button';
import { Badge } from '@shared/ui/badge';
import { MessageSquare, TrendingUp } from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { AnimatedAvatar } from '@shared/components/AnimatedAvatar';
import { EmployeeCardSkeleton } from './EmployeeCardSkeleton';
import type { MarketplaceEmployee } from '@shared/types';

/**
 * Simplified AIEmployee type for card display
 */
export interface AIEmployee extends Omit<MarketplaceEmployee, 'provider' | 'avatar'> {
  provider: string;
  avatar: string;
  popular: boolean;
}

interface EmployeeCardProps {
  employee: AIEmployee;
  viewMode?: 'grid' | 'list';
  isLoading?: boolean;
  className?: string;
}

export const EmployeeCard = memo(function EmployeeCard({
  employee,
  viewMode = 'grid',
  isLoading = false,
  className,
}: EmployeeCardProps) {
  const router = useRouter();

  const handleChat = () => {
    router.push(`/chat?skill=${employee.id}`);
  };

  // Show skeleton while loading
  if (isLoading) {
    return <EmployeeCardSkeleton viewMode={viewMode} className={className} />;
  }

  // List view layout
  if (viewMode === 'list') {
    return (
      <Card
        className={cn(
          'border-border bg-card transition-all duration-300 hover:border-primary/50 hover:shadow-lg',
          className,
        )}
      >
        <CardContent className="p-6">
          <div className="flex items-start gap-6">
            {/* Avatar */}
            <AnimatedAvatar
              src={employee.avatar}
              alt={employee.name}
              size="lg"
              className="h-16 w-16 shrink-0"
            />

            {/* Main content */}
            <div className="flex flex-1 flex-col gap-3">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-card-foreground">{employee.name}</h3>
                  <p className="text-sm text-muted-foreground">{employee.role}</p>
                </div>
                <div className="flex items-center gap-2">
                  {employee.popular && (
                    <Badge variant="default" className="text-xs">
                      <TrendingUp className="mr-1 h-3 w-3" />
                      Popular
                    </Badge>
                  )}
                  {employee.fitLevel === 'excellent' && (
                    <Badge
                      variant="outline"
                      className="border-green-600 text-xs text-green-600 dark:border-green-500 dark:text-green-500"
                    >
                      Excellent Fit
                    </Badge>
                  )}
                </div>
              </div>

              {/* Description */}
              <p className="line-clamp-2 text-sm text-muted-foreground">{employee.description}</p>

              {/* Skills Row */}
              <div className="flex flex-wrap gap-1">
                {employee.skills.slice(0, 4).map((skill) => (
                  <Badge key={skill} variant="secondary" className="text-xs">
                    {skill}
                  </Badge>
                ))}
                {employee.skills.length > 4 && (
                  <Badge variant="outline" className="border-border text-xs">
                    +{employee.skills.length - 4} more
                  </Badge>
                )}
              </div>

              {/* Actions */}
              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={handleChat}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                  aria-label={`Chat with ${employee.name}`}
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Chat with {employee.name}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Grid view layout (default)
  return (
    <Card
      className={cn(
        'border-border bg-card transition-all duration-300 hover:border-primary/50 hover:shadow-lg',
        className,
      )}
    >
      <CardContent className="p-6">
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <AnimatedAvatar
              src={employee.avatar}
              alt={employee.name}
              size="md"
              className="h-12 w-12"
            />
            <div>
              <h3 className="font-semibold text-card-foreground">{employee.name}</h3>
              <p className="text-sm text-muted-foreground">{employee.role}</p>
            </div>
          </div>
          <div className="flex items-center space-x-1">
            {employee.popular && (
              <Badge variant="default" className="text-xs">
                <TrendingUp className="mr-1 h-3 w-3" />
                Popular
              </Badge>
            )}
            {employee.fitLevel === 'excellent' && (
              <Badge
                variant="outline"
                className="border-green-600 text-xs text-green-600 dark:border-green-500 dark:text-green-500"
              >
                Excellent Fit
              </Badge>
            )}
          </div>
        </div>

        <p className="mb-4 line-clamp-3 text-sm text-muted-foreground">{employee.description}</p>

        {/* Skills */}
        <div className="mb-6">
          <div className="flex flex-wrap gap-1">
            {employee.skills.slice(0, 3).map((skill) => (
              <Badge key={skill} variant="secondary" className="text-xs">
                {skill}
              </Badge>
            ))}
            {employee.skills.length > 3 && (
              <Badge variant="outline" className="border-border text-xs">
                +{employee.skills.length - 3} more
              </Badge>
            )}
          </div>
        </div>

        <Button
          onClick={handleChat}
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
          aria-label={`Chat with ${employee.name}`}
        >
          <MessageSquare className="mr-2 h-4 w-4" />
          Chat with {employee.name}
        </Button>
      </CardContent>
    </Card>
  );
});

export default EmployeeCard;
