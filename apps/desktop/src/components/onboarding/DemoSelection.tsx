/**
 * Demo Selection Component
 * Shows available demos for the selected role
 */

import React, { useState } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/Badge';
import { Clock, DollarSign, Play, TrendingUp, Sparkles } from 'lucide-react';
import type { OnboardingDemo, UserRole } from '../../types/onboarding';
import { getDemosForRole, getRoleOption } from '../../data/onboardingDemos';

interface DemoSelectionProps {
  role: UserRole;
  onSelectDemo: (demo: OnboardingDemo) => void;
  selectedDemoId?: string | null;
}

export const DemoSelection: React.FC<DemoSelectionProps> = ({
  role,
  onSelectDemo,
  selectedDemoId = null,
}) => {
  const [hoveredDemo, setHoveredDemo] = useState<string | null>(null);
  const demos = getDemosForRole(role);
  const roleOption = getRoleOption(role);

  if (!demos.length) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No demos available for this role</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto space-y-8 py-8 px-4">
      {/* Header */}
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center gap-2 text-3xl">
          <span>{roleOption?.icon}</span>
          <h2 className="text-4xl font-bold tracking-tight">
            See AGI Workforce in Action
          </h2>
        </div>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Choose a quick demo tailored to <span className="font-semibold">{roleOption?.title}</span>
        </p>
        <p className="text-sm text-muted-foreground">
          Each demo takes 30-60 seconds and shows real ROI
        </p>
      </div>

      {/* Demo cards */}
      <div className="space-y-4">
        {demos.map((demo) => {
          const isSelected = selectedDemoId === demo.id;
          const isHovered = hoveredDemo === demo.id;
          const monthlySavings = demo.valueSavedUsd * 30;

          return (
            <Card
              key={demo.id}
              className={`cursor-pointer transition-all duration-300 ${
                isSelected
                  ? 'border-primary border-2 shadow-lg scale-[1.01]'
                  : isHovered
                    ? 'border-primary/50 shadow-md'
                    : 'border-border hover:border-primary/30'
              }`}
              onClick={() => onSelectDemo(demo)}
              onMouseEnter={() => setHoveredDemo(demo.id)}
              onMouseLeave={() => setHoveredDemo(null)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-xl">{demo.title}</CardTitle>
                      {demo.isPopular && (
                        <Badge
                          variant="default"
                          className="bg-gradient-to-r from-amber-500 to-orange-500 border-none"
                        >
                          <Sparkles className="h-3 w-3 mr-1" />
                          Popular
                        </Badge>
                      )}
                    </div>
                    <CardDescription className="text-base">
                      {demo.description}
                    </CardDescription>
                  </div>

                  {/* Action button */}
                  <Button
                    size="lg"
                    className={`min-w-[120px] ${
                      isSelected ? 'bg-primary' : ''
                    }`}
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Try Demo
                  </Button>
                </div>
              </CardHeader>

              <CardContent>
                {/* Metrics grid */}
                <div className="grid grid-cols-4 gap-4">
                  {/* Duration */}
                  <div className="flex items-center gap-2 bg-secondary/50 rounded-lg p-3">
                    <Clock className="h-4 w-4 text-blue-500 flex-shrink-0" />
                    <div>
                      <div className="text-sm font-bold">{demo.estimatedTimeSeconds}s</div>
                      <div className="text-xs text-muted-foreground">Demo Time</div>
                    </div>
                  </div>

                  {/* Time saved */}
                  <div className="flex items-center gap-2 bg-secondary/50 rounded-lg p-3">
                    <TrendingUp className="h-4 w-4 text-purple-500 flex-shrink-0" />
                    <div>
                      <div className="text-sm font-bold">{demo.valueSavedMinutes} min</div>
                      <div className="text-xs text-muted-foreground">Time Saved</div>
                    </div>
                  </div>

                  {/* Cost saved per run */}
                  <div className="flex items-center gap-2 bg-secondary/50 rounded-lg p-3">
                    <DollarSign className="h-4 w-4 text-green-500 flex-shrink-0" />
                    <div>
                      <div className="text-sm font-bold">${demo.valueSavedUsd}</div>
                      <div className="text-xs text-muted-foreground">Per Run</div>
                    </div>
                  </div>

                  {/* Monthly projection */}
                  <div className="flex items-center gap-2 bg-primary/10 rounded-lg p-3 border border-primary/20">
                    <DollarSign className="h-4 w-4 text-primary flex-shrink-0" />
                    <div>
                      <div className="text-sm font-bold text-primary">
                        ${monthlySavings.toFixed(0)}
                      </div>
                      <div className="text-xs text-muted-foreground">Per Month*</div>
                    </div>
                  </div>
                </div>

                {/* Monthly projection note */}
                <div className="mt-3 text-xs text-muted-foreground text-center">
                  * Projected savings if run daily (30x per month)
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Info callout */}
      <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
        <CardContent className="pt-6">
          <div className="text-center space-y-2">
            <p className="text-sm font-semibold">
              💡 All demos use sample data and run instantly
            </p>
            <p className="text-xs text-muted-foreground">
              No setup required • See results in seconds • Real ROI calculations
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
