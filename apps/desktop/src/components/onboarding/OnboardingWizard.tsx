import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Progress } from '../ui/progress';
import { InstantDemo } from './InstantDemo';
import { Sparkles, Rocket, Target } from 'lucide-react';

interface AIEmployee {
  id: string;
  name: string;
  description: string;
  estimatedTimeSavedPerRun: number;
  estimatedCostSavedPerRun: number;
  demoDurationSeconds: number;
  matchScore: number;
}

interface FirstRunSession {
  id: string;
  userId: string;
  step: string;
  recommendedEmployees: AIEmployee[];
  demoResults: any;
  timeToValueSeconds: number;
  selectedEmployeeId: string | null;
  startedAt: number;
}

interface OnboardingWizardProps {
  userId: string;
  userRole?: string;
}

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({
  userId,
  userRole = 'general',
}) => {
  const [session, setSession] = useState<FirstRunSession | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedEmployee, setSelectedEmployee] = useState<AIEmployee | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    initializeSession();
  }, []);

  const initializeSession = async () => {
    try {
      const newSession = await invoke<FirstRunSession>('start_first_run_experience', {
        userId,
        userRole,
      });
      setSession(newSession);
      setLoading(false);
    } catch (error) {
      console.error('Failed to start first-run:', error);
      setLoading(false);
    }
  };

  const handleEmployeeSelect = async (employee: AIEmployee) => {
    setSelectedEmployee(employee);
    if (session) {
      await invoke('select_demo_employee', {
        sessionId: session.id,
        employeeId: employee.id,
      });
    }
    setCurrentStep(2); // Move to demo step
  };

  const handleDemoComplete = async (results: any) => {
    setCurrentStep(3); // Move to results viewing
  };

  const handleHireEmployee = async () => {
    if (session) {
      await invoke('mark_employee_hired', {
        sessionId: session.id,
      });
      await invoke('complete_first_run', {
        sessionId: session.id,
      });
    }
    // Navigate to main app
  };

  const handleSkip = async () => {
    if (session) {
      await invoke('skip_first_run', {
        sessionId: session.id,
      });
    }
    // Navigate to main app
  };

  const steps = [
    { title: 'Welcome', icon: Sparkles },
    { title: 'Choose Employee', icon: Target },
    { title: 'See Demo', icon: Rocket },
    { title: 'Get Started', icon: Sparkles },
  ];

  if (loading || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-primary/5 py-12 px-4">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Progress Header */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            {steps.map((step, idx) => {
              const Icon = step.icon;
              return (
                <div
                  key={idx}
                  className={`flex items-center ${idx <= currentStep ? 'text-primary' : 'text-muted-foreground'}`}
                >
                  <div
                    className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                      idx <= currentStep
                        ? 'border-primary bg-primary/10'
                        : 'border-muted-foreground/30'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  {idx < steps.length - 1 && (
                    <div
                      className={`h-0.5 w-20 mx-2 ${idx < currentStep ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <Progress value={(currentStep / (steps.length - 1)) * 100} className="h-2" />
        </div>

        {/* Step Content */}
        {currentStep === 0 && (
          <Card className="border-2">
            <CardHeader className="text-center">
              <CardTitle className="text-4xl mb-4">
                Welcome to AGI Workforce! 🎉
              </CardTitle>
              <CardDescription className="text-lg">
                Let's get you started with your first AI employee in under 5 minutes
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-primary/10 rounded-lg p-6 space-y-4">
                <h3 className="font-semibold text-lg">Here's what will happen:</h3>
                <ol className="space-y-3 text-sm">
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                      1
                    </span>
                    <span>We'll recommend 3 AI employees perfect for your role</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                      2
                    </span>
                    <span>Run a 30-second demo with real sample data</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                      3
                    </span>
                    <span>See exactly how much time and money you'll save</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                      4
                    </span>
                    <span>Hire your first employee and start automating!</span>
                  </li>
                </ol>
              </div>

              <div className="flex gap-4">
                <Button size="lg" className="flex-1" onClick={() => setCurrentStep(1)}>
                  Get Started →
                </Button>
                <Button size="lg" variant="outline" onClick={handleSkip}>
                  Skip for Now
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {currentStep === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Choose Your First AI Employee</CardTitle>
              <CardDescription>
                Based on your role as a {userRole}, we recommend:
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                {session.recommendedEmployees.map((employee) => (
                  <Card
                    key={employee.id}
                    className="cursor-pointer hover:border-primary transition-colors"
                    onClick={() => handleEmployeeSelect(employee)}
                  >
                    <CardContent className="p-6">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h3 className="font-semibold text-lg">{employee.name}</h3>
                          <p className="text-sm text-muted-foreground mt-1">
                            {employee.description}
                          </p>
                          <div className="mt-4 flex gap-4 text-sm">
                            <span className="font-semibold text-blue-600">
                              Saves {employee.estimatedTimeSavedPerRun} min
                            </span>
                            <span className="font-semibold text-green-600">
                              ${employee.estimatedCostSavedPerRun}/run
                            </span>
                          </div>
                        </div>
                        <div className="bg-primary/10 rounded-full px-3 py-1 text-sm font-semibold text-primary">
                          {employee.matchScore}% match
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {currentStep === 2 && selectedEmployee && (
          <InstantDemo
            employee={selectedEmployee}
            sessionId={session.id}
            onComplete={handleDemoComplete}
          />
        )}

        {currentStep === 3 && (
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-3xl">Ready to Get Started?</CardTitle>
              <CardDescription>
                Start saving time and money today with {selectedEmployee?.name}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-center space-y-4">
                <p className="text-lg">
                  Join thousands of teams already automating with AGI Workforce
                </p>
                <Button size="lg" onClick={handleHireEmployee}>
                  Hire {selectedEmployee?.name} - Start Free Trial
                </Button>
                <p className="text-xs text-muted-foreground">
                  14-day free trial • No credit card required • Cancel anytime
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};
