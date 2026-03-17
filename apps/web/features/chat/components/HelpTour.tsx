/**
 * HelpTour Component
 *
 * Displays an interactive guided tour with tooltips and highlights.
 * Features:
 * - Floating tooltip with step information and progress indicator
 * - Highlight overlay on target UI elements
 * - Navigation controls (Next, Previous, Skip, Finish)
 * - Responsive positioning to keep tooltip visible
 * - Accessibility features (ARIA labels, keyboard navigation)
 */

import React, { useEffect, useState } from 'react';
import { useHelpTour } from '../hooks/useHelpTour';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ElementPosition {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * HelpTour Component - Interactive guided tour with tooltips and highlights
 *
 * Displays step-by-step guidance overlaid on the UI with:
 * - Animated highlight box around target elements
 * - Floating tooltip with title, description, and progress
 * - Navigation buttons with disabled states
 * - Keyboard support (Escape to skip)
 */
export function HelpTour(): React.ReactNode {
  const {
    isActive,
    currentStep,
    totalSteps,
    hasNextStep,
    hasPreviousStep,
    getCurrentStep,
    nextStep,
    previousStep,
    skipTour,
    finishTour,
  } = useHelpTour();

  const [targetPosition, setTargetPosition] = useState<ElementPosition | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);

  const currentStepData = getCurrentStep();

  // Update target element position
  useEffect(() => {
    if (!currentStepData?.targetElementId) {
      return;
    }

    const updatePosition = () => {
      const element = document.getElementById(currentStepData.targetElementId);

      if (!element) {
        return;
      }

      const rect = element.getBoundingClientRect();
      const scrollX = window.scrollX;
      const scrollY = window.scrollY;

      const position: ElementPosition = {
        top: rect.top + scrollY,
        left: rect.left + scrollX,
        width: rect.width,
        height: rect.height,
      };

      setTargetPosition(position);

      // Calculate tooltip position (offset from element with bounds checking)
      const tooltipWidth = 320;
      const tooltipHeight = 220;
      const gap = 16;

      let tooltipTop = position.top - tooltipHeight - gap;
      let tooltipLeft = position.left + position.width / 2 - tooltipWidth / 2;

      // Adjust if tooltip goes above viewport
      if (tooltipTop < gap) {
        tooltipTop = position.top + position.height + gap;
      }

      // Adjust if tooltip goes beyond left edge
      if (tooltipLeft < gap) {
        tooltipLeft = gap;
      }

      // Adjust if tooltip goes beyond right edge
      const rightEdge = tooltipLeft + tooltipWidth;
      if (rightEdge + gap > window.innerWidth) {
        tooltipLeft = window.innerWidth - tooltipWidth - gap;
      }

      setTooltipPosition({
        top: tooltipTop,
        left: tooltipLeft,
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition);
    };
  }, [currentStepData?.targetElementId]);

  // Handle keyboard shortcuts
  useEffect(() => {
    if (!isActive) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        skipTour();
      } else if (e.key === 'ArrowRight' && hasNextStep()) {
        nextStep();
      } else if (e.key === 'ArrowLeft' && hasPreviousStep()) {
        previousStep();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- step navigation functions are stable refs from useTour()
  }, [isActive, skipTour, nextStep, previousStep]);

  if (!isActive || !currentStepData) {
    return null;
  }

  return (
    <>
      {/* Backdrop overlay */}
      <div
        className="fixed inset-0 bg-black/30 z-40 pointer-events-none"
        data-testid="tour-backdrop"
      />

      {/* Highlight box */}
      {targetPosition && (
        <div
          data-testid="tour-highlight"
          className="tour-highlight fixed border-2 border-blue-500 bg-blue-500/10 rounded-lg pointer-events-none z-50 transition-all duration-300"
          style={{
            top: `${targetPosition.top}px`,
            left: `${targetPosition.left}px`,
            width: `${targetPosition.width}px`,
            height: `${targetPosition.height}px`,
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.3)',
          }}
        />
      )}

      {/* Tooltip */}
      {tooltipPosition && (
        <div
          data-testid="help-tour"
          role="dialog"
          aria-label={`Help tour: ${currentStepData.title}`}
          className="fixed z-50 bg-white rounded-xl shadow-xl border border-gray-200 p-6 max-w-sm w-80"
          style={{
            top: `${tooltipPosition.top}px`,
            left: `${tooltipPosition.left}px`,
          }}
        >
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <Badge
                data-testid="tour-step-badge"
                variant="default"
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {currentStep + 1}
              </Badge>
              <h3 className="text-lg font-semibold text-gray-900">{currentStepData.title}</h3>
            </div>
            <button
              onClick={skipTour}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Skip tour"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Description */}
          <p className="text-gray-600 text-sm mb-6 leading-relaxed">
            {currentStepData.description}
          </p>

          {/* Progress */}
          <div className="flex items-center justify-between mb-6">
            <span className="text-xs font-medium text-gray-500">
              Step {currentStep + 1} of {totalSteps}
            </span>
            <div className="flex gap-1">
              {Array.from({ length: totalSteps }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    'h-1.5 w-1.5 rounded-full transition-colors',
                    i <= currentStep ? 'bg-blue-600' : 'bg-gray-300',
                  )}
                />
              ))}
            </div>
          </div>

          {/* Controls */}
          <div className="flex gap-3">
            <Button onClick={skipTour} variant="outline" size="sm" className="flex-1">
              Skip
            </Button>

            {hasPreviousStep() && (
              <Button
                onClick={previousStep}
                variant="outline"
                size="sm"
                className="flex-1 gap-2"
                disabled={!hasPreviousStep()}
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </Button>
            )}

            {hasNextStep() ? (
              <Button
                onClick={nextStep}
                variant="default"
                size="sm"
                className="flex-1 gap-2 bg-blue-600 hover:bg-blue-700"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                onClick={finishTour}
                variant="default"
                size="sm"
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                Finish
              </Button>
            )}
          </div>

          {/* Pointer arrow (optional visual element) */}
          <div
            className="absolute w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-white"
            style={{
              bottom: '-8px',
              left: '50%',
              transform: 'translateX(-50%)',
              filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))',
            }}
          />
        </div>
      )}

      {/* Tooltip data testid for easier testing */}
      {tooltipPosition && <div data-testid="tour-tooltip" style={{ display: 'none' }} />}
    </>
  );
}

export default HelpTour;
