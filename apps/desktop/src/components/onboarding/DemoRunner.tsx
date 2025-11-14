/**
 * Demo Runner Component
 * Shows real-time execution of a demo with progress and actions
 */

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Progress } from '../ui/Progress';
import { Check, Loader2, Zap } from 'lucide-react';
import type { OnboardingDemo, DemoProgress } from '../../types/onboarding';

interface DemoRunnerProps {
  demo: OnboardingDemo;
  progress: DemoProgress;
  isRunning: boolean;
}

interface ActionLogItem {
  id: string;
  description: string;
  completed: boolean;
  timestamp: number;
}

export const DemoRunner: React.FC<DemoRunnerProps> = ({
  demo,
  progress,
  isRunning,
}) => {
  const [actionLog, setActionLog] = useState<ActionLogItem[]>([]);
  const [metrics, setMetrics] = useState({
    timeSaved: 0,
    actionsTaken: 0,
    filesProcessed: 0,
  });

  // Update action log based on progress
  useEffect(() => {
    if (progress && progress.currentStep < demo.steps.length) {
      const currentStepData = demo.steps[progress.currentStep];
      if (currentStepData && !actionLog.find((a) => a.id === currentStepData.id)) {
        setActionLog((prev) => [
          ...prev,
          {
            id: currentStepData.id,
            description: currentStepData.description,
            completed: false,
            timestamp: Date.now(),
          },
        ]);
      }
    }

    // Mark previous steps as completed
    if (progress && progress.currentStep > 0) {
      setActionLog((prev) =>
        prev.map((action, index) => ({
          ...action,
          completed: index < progress.currentStep,
        })),
      );
    }

    // Mark all completed if done
    if (progress?.completed) {
      setActionLog((prev) => prev.map((action) => ({ ...action, completed: true })));
    }
  }, [progress, demo.steps, actionLog]);

  // Animate metrics counting up
  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      setMetrics((prev) => ({
        timeSaved: Math.min(prev.timeSaved + 1, demo.valueSavedMinutes),
        actionsTaken: Math.min(prev.actionsTaken + 1, demo.steps.length),
        filesProcessed: Math.min(prev.filesProcessed + 5, 100),
      }));
    }, 200);

    return () => clearInterval(interval);
  }, [isRunning, demo.valueSavedMinutes, demo.steps.length]);

  const progressPercentage = progress
    ? ((progress.currentStep + 1) / progress.totalSteps) * 100
    : 0;

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6 py-8 px-4">
      {/* Header */}
      <Card className="border-2 border-primary bg-gradient-to-br from-primary/5 to-primary/10">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-primary rounded-full p-2">
                <Zap className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <CardTitle className="text-xl">{demo.employeeName}</CardTitle>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {demo.title}
                </p>
              </div>
            </div>

            {isRunning && (
              <Loader2 className="h-6 w-6 text-primary animate-spin" />
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Progress bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">
                Step {progress?.currentStep ?? 0} of {progress?.totalSteps ?? demo.steps.length}
              </span>
              <span className="text-muted-foreground">
                {Math.round(progressPercentage)}% complete
              </span>
            </div>
            <Progress
              value={progressPercentage}
              className="h-3"
              indicatorClassName="bg-primary transition-all duration-500"
            />
          </div>

          {/* Current action */}
          <div className="bg-background/60 rounded-lg p-4 border border-primary/20">
            <p className="text-sm font-medium text-muted-foreground mb-1">
              Current Action:
            </p>
            <p className="text-base font-semibold flex items-center gap-2">
              {isRunning && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
              {progress?.currentAction || 'Initializing...'}
            </p>
          </div>

          {/* Live metrics */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-background/60 rounded-lg p-3 border border-border">
              <div className="text-xs text-muted-foreground mb-1">Time Saved</div>
              <div className="text-2xl font-bold text-primary">
                {metrics.timeSaved}
                <span className="text-sm font-normal ml-1">min</span>
              </div>
            </div>

            <div className="bg-background/60 rounded-lg p-3 border border-border">
              <div className="text-xs text-muted-foreground mb-1">Actions</div>
              <div className="text-2xl font-bold text-purple-500">
                {metrics.actionsTaken}
                <span className="text-sm font-normal ml-1">done</span>
              </div>
            </div>

            <div className="bg-background/60 rounded-lg p-3 border border-border">
              <div className="text-xs text-muted-foreground mb-1">Items</div>
              <div className="text-2xl font-bold text-green-500">
                {metrics.filesProcessed}
                <span className="text-sm font-normal ml-1">items</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action log */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Live Action Log</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {actionLog.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                <p className="text-sm">Initializing demo...</p>
              </div>
            ) : (
              actionLog.map((action, index) => (
                <div
                  key={action.id}
                  className={`flex items-start gap-3 p-3 rounded-lg transition-all duration-300 ${
                    action.completed
                      ? 'bg-green-500/10 border border-green-500/20'
                      : index === actionLog.length - 1 && isRunning
                        ? 'bg-primary/10 border border-primary/20 animate-pulse'
                        : 'bg-secondary/50 border border-border'
                  }`}
                >
                  {/* Icon */}
                  <div className="flex-shrink-0 mt-0.5">
                    {action.completed ? (
                      <div className="bg-green-500 rounded-full p-1">
                        <Check className="h-3 w-3 text-white" />
                      </div>
                    ) : index === actionLog.length - 1 && isRunning ? (
                      <Loader2 className="h-5 w-5 text-primary animate-spin" />
                    ) : (
                      <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />
                    )}
                  </div>

                  {/* Description */}
                  <div className="flex-1">
                    <p
                      className={`text-sm font-medium ${
                        action.completed
                          ? 'text-foreground'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {action.description}
                    </p>
                    {action.completed && (
                      <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                        ✓ Complete
                      </p>
                    )}
                  </div>

                  {/* Timestamp */}
                  <div className="text-xs text-muted-foreground flex-shrink-0">
                    {new Date(action.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Info */}
      <div className="text-center text-sm text-muted-foreground">
        <p>Demo running with sample data • Results are simulated for demonstration</p>
      </div>
    </div>
  );
};
