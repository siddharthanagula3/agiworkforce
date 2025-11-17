/**
 * Enhanced Onboarding Wizard
 * Complete multi-step onboarding experience with instant value demonstration
 * Target: <5 minutes to first value
 */

import React, { useEffect, useRef, useState } from 'react';
import { Button } from '../ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card';
import { Sparkles, Rocket, Target, Clock, DollarSign } from 'lucide-react';
import { useOnboardingStore } from '../../stores/onboardingStore';
import { ProgressIndicator } from './ProgressIndicator';
import { RoleSelection } from './RoleSelection';
import { DemoSelection } from './DemoSelection';
import { DemoRunner } from './DemoRunner';
import { DemoResults } from './DemoResults';
import { QuickSetup } from './QuickSetup';
import { getDemoById } from '../../data/onboardingDemos';
import type { UserRole, OnboardingDemo } from '../../types/onboarding';

interface OnboardingWizardNewProps {
  onComplete: () => void;
}

export const OnboardingWizardNew: React.FC<OnboardingWizardNewProps> = ({ onComplete }) => {
  const {
    currentStep,
    totalSteps,
    selectedRole,
    selectedDemo,
    demoRunning,
    demoProgress,
    demoResult,
    settings,
    initialize,
    setCurrentStep,
    nextStep,
    previousStep,
    setSelectedRole,
    setSelectedDemo,
    runDemo,
    updateSettings,
    completeOnboarding,
    skipOnboarding,
  } = useOnboardingStore();

  const [selectedDemoData, setSelectedDemoData] = useState<OnboardingDemo | null>(null);

  // Updated Nov 16, 2025: Fixed dependency issues with refs
  const initializedRef = useRef(false);

  // Initialize onboarding on mount (only once)
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      initialize();
    }
    // Intentionally not including initialize to avoid re-initialization
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load demo data when demo is selected
  useEffect(() => {
    if (selectedDemo) {
      const demo = getDemoById(selectedDemo);
      if (demo) {
        setSelectedDemoData(demo);
      }
    }
  }, [selectedDemo]);

  // Step labels for progress indicator
  const stepLabels = [
    'Welcome',
    'Choose Role',
    'Select Demo',
    'Run Demo',
    'See Results',
    'Quick Setup',
  ];

  // Handle role selection
  const handleRoleSelect = (role: UserRole) => {
    setSelectedRole(role);
    nextStep(); // Move to demo selection
  };

  // Handle demo selection
  const handleDemoSelect = async (demo: OnboardingDemo) => {
    setSelectedDemo(demo.id);
    setSelectedDemoData(demo);
    nextStep(); // Move to demo runner
    // Start running demo
    await runDemo(demo);
    // After demo completes, move to results
    nextStep();
  };

  // Handle viewing results again (try another demo)
  const handleTryAnother = () => {
    setCurrentStep(2); // Go back to demo selection
  };

  // Handle hire/complete (handled inline in UI)

  // Handle skip
  const handleSkip = async () => {
    await skipOnboarding();
    onComplete();
  };

  // Handle settings update and complete
  const handleQuickSetupComplete = async (newSettings: typeof settings) => {
    updateSettings(newSettings);
    await completeOnboarding();
    onComplete();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-background">
      {/* Progress indicator (shown after welcome) */}
      {currentStep > 0 && (
        <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border px-8 py-4">
          <ProgressIndicator
            currentStep={currentStep}
            totalSteps={totalSteps}
            stepLabels={stepLabels}
            onBack={currentStep > 1 && currentStep !== 3 ? previousStep : undefined}
            onSkip={currentStep < 3 || currentStep === 5 ? handleSkip : undefined}
            showBack={currentStep > 1 && currentStep !== 3}
            showSkip={currentStep < 3 || currentStep === 5}
          />
        </div>
      )}

      {/* Content area */}
      <div className="container mx-auto py-12 px-4">
        {/* Step 0: Welcome */}
        {currentStep === 0 && (
          <div className="max-w-4xl mx-auto space-y-8">
            <Card className="border-2 border-primary/20 shadow-xl">
              <CardHeader className="text-center space-y-4 pb-4">
                <div className="flex justify-center">
                  <div className="bg-gradient-to-br from-primary to-primary/70 rounded-full p-4">
                    <Sparkles className="h-12 w-12 text-primary-foreground" />
                  </div>
                </div>
                <CardTitle className="text-5xl font-bold tracking-tight">
                  Welcome to AGI Workforce!
                </CardTitle>
                <CardDescription className="text-xl">
                  Let's show you what your new AI employees can do in just{' '}
                  <span className="font-bold text-primary">5 minutes</span>
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-8">
                {/* Key benefits */}
                <div className="grid md:grid-cols-3 gap-6">
                  <div className="text-center space-y-3 p-6 rounded-lg bg-gradient-to-br from-blue-500/10 to-blue-500/5 border border-blue-500/20">
                    <div className="flex justify-center">
                      <Rocket className="h-10 w-10 text-blue-500" />
                    </div>
                    <h3 className="font-bold text-lg">Instant Value</h3>
                    <p className="text-sm text-muted-foreground">
                      See real results in minutes, not hours
                    </p>
                  </div>

                  <div className="text-center space-y-3 p-6 rounded-lg bg-gradient-to-br from-purple-500/10 to-purple-500/5 border border-purple-500/20">
                    <div className="flex justify-center">
                      <Target className="h-10 w-10 text-purple-500" />
                    </div>
                    <h3 className="font-bold text-lg">20+ AI Employees</h3>
                    <p className="text-sm text-muted-foreground">
                      Ready to automate your workflows
                    </p>
                  </div>

                  <div className="text-center space-y-3 p-6 rounded-lg bg-gradient-to-br from-green-500/10 to-green-500/5 border border-green-500/20">
                    <div className="flex justify-center">
                      <DollarSign className="h-10 w-10 text-green-500" />
                    </div>
                    <h3 className="font-bold text-lg">Clear ROI</h3>
                    <p className="text-sm text-muted-foreground">
                      Track every minute and dollar saved
                    </p>
                  </div>
                </div>

                {/* What will happen */}
                <Card className="bg-primary/5 border-primary/20">
                  <CardContent className="pt-6">
                    <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                      <Clock className="h-5 w-5 text-primary" />
                      Here's what will happen:
                    </h3>
                    <ol className="space-y-3">
                      {[
                        'Tell us about your role (15 seconds)',
                        'Pick a quick demo tailored to you (30 seconds)',
                        'Watch it run with real sample data (30-60 seconds)',
                        "See exactly how much time and money you'll save",
                        'Choose your settings and start automating!',
                      ].map((step, index) => (
                        <li key={index} className="flex items-start gap-3">
                          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                            {index + 1}
                          </div>
                          <span className="text-sm pt-1">{step}</span>
                        </li>
                      ))}
                    </ol>
                  </CardContent>
                </Card>

                {/* CTA buttons */}
                <div className="flex gap-4 pt-4">
                  <Button size="lg" className="flex-1 text-lg h-14" onClick={nextStep}>
                    <Rocket className="mr-2 h-5 w-5" />
                    Get Started
                  </Button>
                  <Button size="lg" variant="outline" className="text-lg h-14" onClick={handleSkip}>
                    Skip for Now
                  </Button>
                </div>

                {/* Social proof */}
                <div className="text-center text-sm text-muted-foreground">
                  <p>
                    Join <span className="font-semibold text-foreground">500,000+ teams</span>{' '}
                    already automating with AGI Workforce
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 1: Role Selection */}
        {currentStep === 1 && (
          <RoleSelection onSelectRole={handleRoleSelect} selectedRole={selectedRole} />
        )}

        {/* Step 2: Demo Selection */}
        {currentStep === 2 && selectedRole && (
          <DemoSelection
            role={selectedRole}
            onSelectDemo={handleDemoSelect}
            selectedDemoId={selectedDemo}
          />
        )}

        {/* Step 3: Demo Runner */}
        {currentStep === 3 && selectedDemoData && demoProgress && (
          <DemoRunner demo={selectedDemoData} progress={demoProgress} isRunning={demoRunning} />
        )}

        {/* Step 4: Demo Results */}
        {currentStep === 4 && demoResult && (
          <DemoResults
            results={demoResult}
            onHire={() => nextStep()} // Move to quick setup
            onTryAnother={handleTryAnother}
          />
        )}

        {/* Step 5: Quick Setup */}
        {currentStep === 5 && (
          <QuickSetup initialSettings={settings} onComplete={handleQuickSetupComplete} />
        )}
      </div>
    </div>
  );
};
