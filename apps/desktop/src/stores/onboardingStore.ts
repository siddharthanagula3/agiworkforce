import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { invoke } from '../lib/tauri-mock';
import type {
  DemoProgress,
  DemoResult,
  OnboardingDemo,
  OnboardingSettings,
  OnboardingState,
  UserRole,
} from '../types/onboarding';

interface OnboardingStore extends OnboardingState {
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

      initialize: () => {
        set({ startTime: Date.now() });
      },

      setCurrentStep: (step: number) => {
        const totalSteps = get().totalSteps;
        if (step >= 0 && step < totalSteps) {
          set({ currentStep: step });
        }
      },

      nextStep: () => {
        const { currentStep, totalSteps } = get();
        if (currentStep < totalSteps - 1) {
          set({ currentStep: currentStep + 1 });
        }
      },

      previousStep: () => {
        const currentStep = get().currentStep;
        if (currentStep > 0) {
          set({ currentStep: currentStep - 1 });
        }
      },

      setSelectedRole: (role: UserRole) => {
        set({ selectedRole: role });
      },

      setSelectedDemo: (demoId: string) => {
        set({ selectedDemo: demoId });
      },

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

          for (let i = 0; i < demo.steps.length; i++) {
            const step = demo.steps[i];
            const timeElapsed = Date.now() - startTime;

            set({
              demoProgress: {
                currentStep: i,
                totalSteps: demo.steps.length,
                currentAction: step?.description ?? 'Processing...',
                completed: false,
                timeElapsedMs: timeElapsed,
              },
            });

            await new Promise((resolve) => setTimeout(resolve, step?.durationMs ?? 1000));
          }

          const completionTime = Math.floor((Date.now() - startTime) / 1000);

          const finalResult: DemoResult = {
            demoId: demo.demoId,
            demoName: demo.demoName,
            taskDescription: demo.description,
            inputSummary: 'Sample input data processed successfully',
            outputSummary: 'Generated 3 artifacts and 1 report',
            actionsTaken: demo.steps.map((step) => step.description),
            timeSavedMinutes: demo.valueSavedMinutes,
            costSavedUsd: demo.valueSavedUsd,
            qualityScore: 0.98,
            completionTimeSeconds: completionTime,
          };

          try {
          } catch (e) {
            console.warn('Failed to persist demo results', e);
          }

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

          const simulatedResult: DemoResult = {
            demoId: demo.demoId,
            demoName: demo.demoName,
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

      updateDemoProgress: (progress: DemoProgress) => {
        set({ demoProgress: progress });
      },

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

      updateSettings: (settings: Partial<OnboardingSettings>) => {
        set((state) => ({
          settings: {
            ...state.settings,
            ...settings,
          },
        }));
      },

      completeOnboarding: async () => {
        const { startTime } = get();
        const timeToValue = Math.floor((Date.now() - startTime) / 1000);

        set({
          onboardingComplete: true,
          timeToValueSeconds: timeToValue,
        });

        try {
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
