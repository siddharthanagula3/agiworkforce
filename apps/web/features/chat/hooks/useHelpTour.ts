
import { useEffect, useState, useCallback } from 'react';

interface TourStep {
  id: string;
  title: string;
  description: string;
  targetElementId: string;
  position?: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
}

interface TourDefinition {
  id: string;
  steps: TourStep[];
}

const HELP_TOURS: Record<string, TourDefinition> = {
  'chat-basics': {
    id: 'chat-basics',
    steps: [
      {
        id: 'composer',
        title: 'Write Your Message',
        description:
          'Type your message here and press Enter or click the send button to start chatting with the AI.',
        targetElementId: 'chat-composer',
      },
      {
        id: 'model-selector',
        title: 'Choose Your AI Model',
        description:
          'Select which AI model to use for your response. Different models have different capabilities.',
        targetElementId: 'model-selector',
      },
      {
        id: 'sidebar',
        title: 'Your Conversation History',
        description:
          'Access your previous conversations here. Click any conversation to continue the discussion.',
        targetElementId: 'chat-sidebar',
      },
      {
        id: 'tools',
        title: 'Available Tools',
        description:
          'These tools help the AI perform various tasks like searching the web or analyzing code.',
        targetElementId: 'tools-panel',
      },
      {
        id: 'settings',
        title: 'Customize Your Experience',
        description:
          'Adjust settings like theme, language, and default models in the settings menu.',
        targetElementId: 'settings-button',
      },
    ],
  },
};

interface HelpTourState {
  currentStep: number;
  isActive: boolean;
  currentTourId: string | null;

  totalSteps: number;
  completedTours: Record<string, boolean>;

  startTour: (tourId: string) => void;
  nextStep: () => void;
  previousStep: () => void;
  skipTour: () => void;
  finishTour: () => void;
  resetTour: () => void;
  clearAllTours: () => void;

  getCurrentStep: () => TourStep | null;
  hasNextStep: () => boolean;
  hasPreviousStep: () => boolean;
  isTourCompleted: (tourId: string) => boolean;
}

const STORAGE_KEY = 'help-tour-completed';

export function useHelpTour(): HelpTourState {
  const [currentStep, setCurrentStep] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [currentTourId, setCurrentTourId] = useState<string | null>(null);
  const [completedTours, setCompletedTours] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setCompletedTours(JSON.parse(stored));
      } catch (error) {
        console.error('Failed to parse help tour data:', error);
      }
    }
  }, []);

  useEffect(() => {
    if (Object.keys(completedTours).length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(completedTours));
    }
  }, [completedTours]);

  const getCurrentTourSteps = useCallback((): TourStep[] => {
    if (!currentTourId || !HELP_TOURS[currentTourId]) {
      return [];
    }
    return HELP_TOURS[currentTourId].steps;
  }, [currentTourId]);

  const getTotalSteps = useCallback((): number => {
    return getCurrentTourSteps().length;
  }, [getCurrentTourSteps]);

  const startTour = useCallback((tourId: string) => {
    if (!HELP_TOURS[tourId]) {
      console.warn(`Tour "${tourId}" not found`);
      return;
    }

    setCurrentTourId(tourId);
    setCurrentStep(0);
    setIsActive(true);
  }, []);

  const nextStep = useCallback(() => {
    const totalSteps = getTotalSteps();
    setCurrentStep((prev) => (prev < totalSteps - 1 ? prev + 1 : prev));
  }, [getTotalSteps]);

  const previousStep = useCallback(() => {
    setCurrentStep((prev) => prev - 1);
  }, []);

  const markTourComplete = useCallback((tourId: string) => {
    setCompletedTours((prev) => ({
      ...prev,
      [tourId]: true,
    }));
  }, []);

  const skipTour = useCallback(() => {
    if (currentTourId) {
      markTourComplete(currentTourId);
    }
    setIsActive(false);
    setCurrentStep(0);
    setCurrentTourId(null);
  }, [currentTourId, markTourComplete]);

  const finishTour = useCallback(() => {
    if (currentTourId) {
      markTourComplete(currentTourId);
    }
    setIsActive(false);
    setCurrentStep(0);
    setCurrentTourId(null);
  }, [currentTourId, markTourComplete]);

  const resetTour = useCallback(() => {
    setCurrentStep(0);
    setCurrentTourId(null);
    setIsActive(false);
  }, []);

  const clearAllTours = useCallback(() => {
    setCompletedTours({});
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const getCurrentStep = useCallback((): TourStep | null => {
    const steps = getCurrentTourSteps();
    if (!steps[currentStep]) {
      return null;
    }
    return steps[currentStep];
  }, [currentStep, getCurrentTourSteps]);

  const hasNextStep = useCallback((): boolean => {
    const totalSteps = getTotalSteps();
    return currentStep < totalSteps - 1;
  }, [currentStep, getTotalSteps]);

  const hasPreviousStep = useCallback((): boolean => {
    return currentStep > 0;
  }, [currentStep]);

  const isTourCompleted = useCallback(
    (tourId: string): boolean => {
      return completedTours[tourId] === true;
    },
    [completedTours],
  );

  return {
    currentStep,
    isActive,
    currentTourId,
    totalSteps: getTotalSteps(),
    completedTours,

    startTour,
    nextStep,
    previousStep,
    skipTour,
    finishTour,
    resetTour,
    clearAllTours,

    getCurrentStep,
    hasNextStep,
    hasPreviousStep,
    isTourCompleted,
  };
}
