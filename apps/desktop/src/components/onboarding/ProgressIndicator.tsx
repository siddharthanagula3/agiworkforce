/**
 * Progress Indicator Component
 * Shows step progress at the top of the onboarding wizard
 */

import React from 'react';
import { Button } from '../ui/Button';
import { ChevronLeft, X } from 'lucide-react';

interface ProgressIndicatorProps {
  currentStep: number;
  totalSteps: number;
  stepLabels: string[];
  onBack?: () => void;
  onSkip?: () => void;
  showBack?: boolean;
  showSkip?: boolean;
}

export const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({
  currentStep,
  totalSteps,
  stepLabels,
  onBack,
  onSkip,
  showBack = true,
  showSkip = true,
}) => {
  const progressPercentage = ((currentStep + 1) / totalSteps) * 100;

  return (
    <div className="w-full space-y-4">
      {/* Top bar with back and skip */}
      <div className="flex items-center justify-between">
        {/* Back button */}
        <div className="w-24">
          {showBack && currentStep > 0 && onBack ? (
            <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
          ) : (
            <div />
          )}
        </div>

        {/* Step counter */}
        <div className="text-center">
          <span className="text-sm font-medium text-muted-foreground">
            Step {currentStep + 1} of {totalSteps}
          </span>
        </div>

        {/* Skip button */}
        <div className="w-24 flex justify-end">
          {showSkip && onSkip ? (
            <Button variant="ghost" size="sm" onClick={onSkip} className="gap-1">
              Skip
              <X className="h-4 w-4" />
            </Button>
          ) : (
            <div />
          )}
        </div>
      </div>

      {/* Progress dots */}
      <div className="flex items-center justify-center gap-2">
        {Array.from({ length: totalSteps }).map((_, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;
          const label = stepLabels[index] || `Step ${index + 1}`;

          return (
            <div key={index} className="flex items-center">
              <div
                className="flex flex-col items-center gap-1"
                title={label}
              >
                <div
                  className={`h-2.5 w-2.5 rounded-full transition-all duration-300 ${
                    isCompleted
                      ? 'bg-primary scale-100'
                      : isCurrent
                        ? 'bg-primary scale-125 ring-4 ring-primary/20'
                        : 'bg-muted scale-100'
                  }`}
                />
              </div>
              {index < totalSteps - 1 && (
                <div
                  className={`h-0.5 w-8 transition-all duration-300 ${
                    isCompleted ? 'bg-primary' : 'bg-muted'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-500 ease-out"
          style={{ width: `${progressPercentage}%` }}
        />
      </div>

      {/* Current step label */}
      <div className="text-center">
        <p className="text-sm font-medium text-foreground">
          {stepLabels[currentStep] || `Step ${currentStep + 1}`}
        </p>
      </div>
    </div>
  );
};
