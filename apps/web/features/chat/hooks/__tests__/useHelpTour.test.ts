/**
 * useHelpTour Hook Tests
 *
 * Tests for the Help Tour hook including:
 * - Tour initialization and step progression
 * - Next/Previous/Skip/Finish actions
 * - localStorage persistence
 * - Tour state management
 * - Target element tracking
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useHelpTour } from '../useHelpTour';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('useHelpTour Hook', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('Initialization', () => {
    it('should initialize with first step when tour not started', () => {
      const { result } = renderHook(() => useHelpTour());

      expect(result.current.currentStep).toBe(0);
      expect(result.current.isActive).toBe(false);
      expect(result.current.currentTourId).toBeNull();
    });

    it('should initialize from localStorage if tour was completed', () => {
      localStorage.setItem('help-tour-completed', JSON.stringify({ 'chat-basics': true }));

      const { result } = renderHook(() => useHelpTour());

      expect(result.current.completedTours).toEqual({ 'chat-basics': true });
    });

    it('should provide total tour steps count after starting a tour', () => {
      const { result } = renderHook(() => useHelpTour());

      act(() => {
        result.current.startTour('chat-basics');
      });

      expect(result.current.totalSteps).toBeGreaterThan(0);
    });
  });

  describe('Tour Navigation', () => {
    it('should start a specific tour', () => {
      const { result } = renderHook(() => useHelpTour());

      act(() => {
        result.current.startTour('chat-basics');
      });

      expect(result.current.currentTourId).toBe('chat-basics');
      expect(result.current.currentStep).toBe(0);
      expect(result.current.isActive).toBe(true);
    });

    it('should advance to next step', () => {
      const { result } = renderHook(() => useHelpTour());

      act(() => {
        result.current.startTour('chat-basics');
      });

      const initialStep = result.current.currentStep;

      act(() => {
        result.current.nextStep();
      });

      expect(result.current.currentStep).toBe(initialStep + 1);
    });

    it('should not exceed max steps when calling nextStep', () => {
      const { result } = renderHook(() => useHelpTour());

      act(() => {
        result.current.startTour('chat-basics');
      });

      const maxStep = result.current.totalSteps - 1;

      // Advance to last step
      for (let i = 0; i < result.current.totalSteps; i++) {
        act(() => {
          result.current.nextStep();
        });
      }

      expect(result.current.currentStep).toBeLessThanOrEqual(maxStep);
    });

    it('should go to previous step', () => {
      const { result } = renderHook(() => useHelpTour());

      act(() => {
        result.current.startTour('chat-basics');
        result.current.nextStep();
        result.current.nextStep();
      });

      const stepBeforePrevious = result.current.currentStep;

      act(() => {
        result.current.previousStep();
      });

      expect(result.current.currentStep).toBe(stepBeforePrevious - 1);
    });

    it('should not go below step 0 when calling previousStep', () => {
      const { result } = renderHook(() => useHelpTour());

      act(() => {
        result.current.startTour('chat-basics');
      });

      act(() => {
        result.current.previousStep();
      });

      expect(result.current.currentStep).toBe(0);
    });

    it('should skip tour and mark as complete', () => {
      const { result } = renderHook(() => useHelpTour());

      act(() => {
        result.current.startTour('chat-basics');
      });

      act(() => {
        result.current.skipTour();
      });

      expect(result.current.isActive).toBe(false);
      expect(result.current.completedTours['chat-basics']).toBe(true);
    });

    it('should finish tour and mark as complete', () => {
      const { result } = renderHook(() => useHelpTour());

      act(() => {
        result.current.startTour('chat-basics');
      });

      // Advance to last step
      for (let i = 0; i < result.current.totalSteps - 1; i++) {
        act(() => {
          result.current.nextStep();
        });
      }

      act(() => {
        result.current.finishTour();
      });

      expect(result.current.isActive).toBe(false);
      expect(result.current.completedTours['chat-basics']).toBe(true);
    });
  });

  describe('Step Information', () => {
    it('should return current step information', () => {
      const { result } = renderHook(() => useHelpTour());

      act(() => {
        result.current.startTour('chat-basics');
      });

      const currentStepInfo = result.current.getCurrentStep();

      expect(currentStepInfo).toBeDefined();
      expect(currentStepInfo?.id).toBeDefined();
      expect(currentStepInfo?.title).toBeDefined();
      expect(currentStepInfo?.description).toBeDefined();
      expect(currentStepInfo?.targetElementId).toBeDefined();
    });

    it('should indicate if tour has next step', () => {
      const { result } = renderHook(() => useHelpTour());

      act(() => {
        result.current.startTour('chat-basics');
      });

      expect(result.current.hasNextStep()).toBe(true);

      // Advance to last step
      for (let i = 0; i < result.current.totalSteps - 1; i++) {
        act(() => {
          result.current.nextStep();
        });
      }

      expect(result.current.hasNextStep()).toBe(false);
    });

    it('should indicate if tour has previous step', () => {
      const { result } = renderHook(() => useHelpTour());

      act(() => {
        result.current.startTour('chat-basics');
      });

      expect(result.current.hasPreviousStep()).toBe(false);

      act(() => {
        result.current.nextStep();
      });

      expect(result.current.hasPreviousStep()).toBe(true);
    });
  });

  describe('Persistence', () => {
    it('should persist completed tours to localStorage', () => {
      const { result } = renderHook(() => useHelpTour());

      act(() => {
        result.current.startTour('chat-basics');
      });

      act(() => {
        result.current.finishTour();
      });

      const stored = localStorage.getItem('help-tour-completed');
      expect(stored).toBeTruthy();

      const parsed = JSON.parse(stored!);
      expect(parsed['chat-basics']).toBe(true);
    });

    it('should restore completed tours from localStorage on mount', () => {
      localStorage.setItem(
        'help-tour-completed',
        JSON.stringify({
          'chat-basics': true,
          'model-selector': false,
        }),
      );

      const { result } = renderHook(() => useHelpTour());

      expect(result.current.completedTours['chat-basics']).toBe(true);
      expect(result.current.completedTours['model-selector']).toBe(false);
    });

    it('should return true when checking if tour is completed', () => {
      const { result } = renderHook(() => useHelpTour());

      act(() => {
        result.current.startTour('chat-basics');
      });

      // Finish the tour
      act(() => {
        result.current.finishTour();
      });

      expect(result.current.isTourCompleted('chat-basics')).toBe(true);
      expect(result.current.isTourCompleted('model-selector')).toBe(false);
    });
  });

  describe('Tour Reset', () => {
    it('should reset tour progress', () => {
      const { result } = renderHook(() => useHelpTour());

      act(() => {
        result.current.startTour('chat-basics');
        result.current.nextStep();
        result.current.nextStep();
      });

      act(() => {
        result.current.resetTour();
      });

      expect(result.current.currentStep).toBe(0);
      expect(result.current.currentTourId).toBeNull();
      expect(result.current.isActive).toBe(false);
    });

    it('should clear all completed tours', () => {
      const { result } = renderHook(() => useHelpTour());

      localStorage.setItem(
        'help-tour-completed',
        JSON.stringify({
          'chat-basics': true,
          'model-selector': true,
        }),
      );

      act(() => {
        result.current.clearAllTours();
      });

      expect(result.current.completedTours).toEqual({});
      expect(localStorage.getItem('help-tour-completed')).toBeNull();
    });
  });
});
