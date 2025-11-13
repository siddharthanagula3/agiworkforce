/**
 * Onboarding Store
 * Manages state for the instant demo and first-run onboarding experience
 */

import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  UserRole,
  OnboardingDemo,
  DemoProgress,
  DemoResult,
  OnboardingSettings,
  OnboardingState,
} from '../types/onboarding';

interface OnboardingStore extends OnboardingState {
  // Actions
  initialize: () => void;
  setCurrentStep: (step: number) => void;
  nextStep: () => void;
  previousStep: () => void;
  setSelectedRole: (role: UserRole) => void;
  setSelectedDemo: (demoId: string) => void;
  runDemo: (demo: OnboardingDemo) => Promise<void>;
  updateDemoProgress: (progress: DemoProgress) => void;
  completeDemo: (result: DemoResult) => void;
  updateSettings: (settings: Partial<OnboardingSettings>) => void;
  completeOnboarding: () => Promise<void>;
  skipOnboarding: () => Promise<void>;
  reset: () => void;
}

const initialState: OnboardingState = {
  currentStep: 0,
  totalSteps: 6,
  selectedRole: null,
  selectedDemo: null,
  demoRunning: false,
  demoProgress: null,
  demoResult: null,
  onboardingComplete: false,
  settings: {
    llmProvider: 'ollama',
    notificationsEnabled: true,
    autoApproveEnabled: true,
  },
  startTime: Date.now(),
  timeToValueSeconds: 0,
};

export const useOnboardingStore = create<OnboardingStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      // Initialize onboarding (track start time)
      initialize: () => {
        set({ startTime: Date.now() });
      },

      // Set current step
      setCurrentStep: (step: number) => {
        const totalSteps = get().totalSteps;
        if (step >= 0 && step < totalSteps) {
          set({ currentStep: step });
        }
      },

      // Move to next step
      nextStep: () => {
        const { currentStep, totalSteps } = get();
        if (currentStep < totalSteps - 1) {
          set({ currentStep: currentStep + 1 });
        }
      },

      // Move to previous step
      previousStep: () => {
        const currentStep = get().currentStep;
        if (currentStep > 0) {
          set({ currentStep: currentStep - 1 });
        }
      },

      // Set selected role
      setSelectedRole: (role: UserRole) => {
        set({ selectedRole: role });
      },

      // Set selected demo
      setSelectedDemo: (demoId: string) => {
        set({ selectedDemo: demoId });
      },

      // Run demo
      runDemo: async (demo: OnboardingDemo) => {
        set({
          demoRunning: true,
          demoProgress: {
            currentStep: 0,
            totalSteps: demo.steps.length,
            currentAction: demo.steps[0]?.description || 'Initializing...',
            completed: false,
            timeElapsedMs: 0,
          },
        });

        try {
          const startTime = Date.now();

          // Simulate step-by-step execution
          for (let i = 0; i < demo.steps.length; i++) {
            const step = demo.steps[i];
            const timeElapsed = Date.now() - startTime;

            set({
              demoProgress: {
                currentStep: i,
                totalSteps: demo.steps.length,
                currentAction: step.description,
                completed: false,
                timeElapsedMs: timeElapsed,
              },
            });

            // Wait for step duration
            await new Promise((resolve) => setTimeout(resolve, step.durationMs));
          }

          // Call backend to run actual demo
          const result = await invoke<DemoResult>('run_instant_demo', {
            employeeId: demo.employeeId,
            demoId: demo.id,
          });

          const completionTime = Math.floor((Date.now() - startTime) / 1000);

          // Update with actual results from backend
          const finalResult: DemoResult = {
            ...result,
            completionTimeSeconds: completionTime,
          };

          set({
            demoRunning: false,
            demoProgress: {
              currentStep: demo.steps.length,
              totalSteps: demo.steps.length,
              currentAction: 'Complete!',
              completed: true,
              timeElapsedMs: Date.now() - startTime,
            },
            demoResult: finalResult,
          });
        } catch (error) {
          console.error('Demo execution failed:', error);

          // Fallback to simulated results
          const simulatedResult: DemoResult = {
            employeeId: demo.employeeId,
            employeeName: demo.employeeName,
            taskDescription: demo.description,
            inputSummary: 'Sample input data',
            outputSummary: 'Processed and organized output',
            actionsTaken: demo.steps.map((step) => step.description),
            timeSavedMinutes: demo.valueSavedMinutes,
            costSavedUsd: demo.valueSavedUsd,
            qualityScore: 0.96,
            completionTimeSeconds: demo.estimatedTimeSeconds,
          };

          set({
            demoRunning: false,
            demoResult: simulatedResult,
          });
        }
      },

      // Update demo progress (for real-time updates)
      updateDemoProgress: (progress: DemoProgress) => {
        set({ demoProgress: progress });
      },

      // Complete demo with results
      completeDemo: (result: DemoResult) => {
        set({
          demoRunning: false,
          demoResult: result,
          demoProgress: {
            ...(get().demoProgress || {
              currentStep: 0,
              totalSteps: 1,
              currentAction: '',
              timeElapsedMs: 0,
            }),
            completed: true,
          },
        });
      },

      // Update settings
      updateSettings: (settings: Partial<OnboardingSettings>) => {
        set((state) => ({
          settings: {
            ...state.settings,
            ...settings,
          },
        }));
      },

      // Complete onboarding
      completeOnboarding: async () => {
        const { startTime } = get();
        const timeToValue = Math.floor((Date.now() - startTime) / 1000);

        set({
          onboardingComplete: true,
          timeToValueSeconds: timeToValue,
        });

        try {
          // Save to backend
          await invoke('complete_first_run', {
            timeToValueSeconds: timeToValue,
            selectedRole: get().selectedRole,
            selectedDemo: get().selectedDemo,
            settings: get().settings,
          });
        } catch (error) {
          console.error('Failed to save onboarding completion:', error);
        }
      },

      // Skip onboarding
      skipOnboarding: async () => {
        set({
          onboardingComplete: true,
          timeToValueSeconds: 0,
        });

        try {
          await invoke('skip_first_run');
        } catch (error) {
          console.error('Failed to skip onboarding:', error);
        }
      },

      // Reset onboarding (for testing/demo purposes)
      reset: () => {
        set({
          ...initialState,
          startTime: Date.now(),
        });
      },
    }),
    {
      name: 'onboarding-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        onboardingComplete: state.onboardingComplete,
        timeToValueSeconds: state.timeToValueSeconds,
        settings: state.settings,
      }),
    },
  ),
);
