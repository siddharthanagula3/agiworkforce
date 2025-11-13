/**
 * EmployeeHero Component
 * Eye-catching hero section for the AI Employee Library
 */

import { Users, Clock, Star, TrendingUp } from 'lucide-react';
import { Button } from '../ui/Button';

export function EmployeeHero() {
  return (
    <div className="relative overflow-hidden border-b border-border/60 bg-gradient-to-br from-primary/5 via-background to-background">
      {/* Animated background gradient */}
      <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-transparent to-primary/10 animate-gradient" />

      <div className="relative px-8 py-12">
        <div className="mx-auto max-w-5xl space-y-6">
          {/* Main heading */}
          <div className="space-y-3 text-center">
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Your AI Workforce
            </h1>
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground sm:text-xl">
              20+ pre-trained AI employees ready to work in seconds. No setup, no training
              required.
            </p>
          </div>

          {/* Stats row */}
          <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-12">
            <div className="flex items-center gap-2 text-sm">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                <Clock className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-semibold">10M+ hours saved</p>
                <p className="text-xs text-muted-foreground">Across all teams</p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                <Users className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-semibold">500K+ teams</p>
                <p className="text-xs text-muted-foreground">Trust our platform</p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                <Star className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-semibold">4.9★ rating</p>
                <p className="text-xs text-muted-foreground">From 50K+ reviews</p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                <TrendingUp className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-semibold">85% productivity</p>
                <p className="text-xs text-muted-foreground">Average increase</p>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="flex justify-center pt-2">
            <Button size="lg" className="gap-2">
              <Users className="h-4 w-4" />
              Browse All Employees
            </Button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes gradient {
          0%, 100% {
            opacity: 0.3;
          }
          50% {
            opacity: 0.6;
          }
        }
        .animate-gradient {
          animation: gradient 8s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
