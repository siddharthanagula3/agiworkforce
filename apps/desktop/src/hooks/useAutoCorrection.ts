/**
 * useAutoCorrection Hook
 *
 * Automatically detects and corrects errors in code generation.
 * Monitors output for errors and triggers retry with corrections.
 *
 * Updated Nov 16, 2025: Fixed unnecessary dependencies in callbacks
 */

import { useState, useCallback, useRef } from 'react';
import {
  detectErrors,
  generateCorrectionPrompt,
  shouldRetry,
  extractCode,
  calculateErrorSeverity,
  type DetectedError,
} from '../utils/autoCorrection';

export interface AutoCorrectionState {
  isActive: boolean;
  attemptCount: number;
  errors: DetectedError[];
  lastCorrection: string | null;
  totalErrors: number;
  fixedErrors: number;
}

export interface AutoCorrectionOptions {
  /**
   * Maximum number of retry attempts
   * @default 3
   */
  maxAttempts?: number;

  /**
   * Callback when correction is triggered
   */
  onCorrection?: (errors: DetectedError[], attempt: number) => void;

  /**
   * Callback when max attempts reached
   */
  onMaxAttemptsReached?: (errors: DetectedError[]) => void;

  /**
   * Callback when errors are fixed
   */
  onFixed?: (attemptCount: number) => void;

  /**
   * Enable auto-correction
   * @default true
   */
  enabled?: boolean;
}

export function useAutoCorrection(options: AutoCorrectionOptions = {}) {
  const { maxAttempts = 3, onCorrection, onMaxAttemptsReached, onFixed, enabled = true } = options;

  const [state, setState] = useState<AutoCorrectionState>({
    isActive: false,
    attemptCount: 0,
    errors: [],
    lastCorrection: null,
    totalErrors: 0,
    fixedErrors: 0,
  });

  const previousErrorsRef = useRef<DetectedError[]>([]);
  const stateRef = useRef(state);
  stateRef.current = state;

  /**
   * Check output for errors and determine if correction is needed
   */
  const checkForErrors = useCallback(
    (output: string): { hasErrors: boolean; shouldCorrect: boolean; errors: DetectedError[] } => {
      if (!enabled) {
        return { hasErrors: false, shouldCorrect: false, errors: [] };
      }

      const errors = detectErrors(output);
      const hasErrors = errors.length > 0;
      const shouldCorrect = hasErrors && shouldRetry(errors, stateRef.current.attemptCount);

      return { hasErrors, shouldCorrect, errors };
    },
    [enabled],
  );

  /**
   * Trigger auto-correction
   */
  const triggerCorrection = useCallback(
    (errors: DetectedError[], originalCode: string): string | null => {
      if (!enabled) {
        return null;
      }

      const currentAttemptCount = stateRef.current.attemptCount;
      if (currentAttemptCount >= maxAttempts) {
        onMaxAttemptsReached?.(errors);
        return null;
      }

      const newAttemptCount = currentAttemptCount + 1;

      setState((prev) => ({
        ...prev,
        isActive: true,
        attemptCount: newAttemptCount,
        errors,
        totalErrors: prev.totalErrors + errors.length,
      }));

      // Generate correction prompt
      const correctionPrompt = generateCorrectionPrompt(errors, originalCode);

      // Track previous errors for comparison
      previousErrorsRef.current = errors;

      onCorrection?.(errors, newAttemptCount);

      return correctionPrompt;
    },
    [enabled, maxAttempts, onCorrection, onMaxAttemptsReached],
  );

  /**
   * Process corrected output
   */
  const processCorrectedOutput = useCallback(
    (output: string): { success: boolean; errors: DetectedError[] } => {
      const code = extractCode(output);
      const newErrors = detectErrors(code);

      // Calculate how many errors were fixed
      const previousSeverity = calculateErrorSeverity(previousErrorsRef.current);
      const currentSeverity = calculateErrorSeverity(newErrors);
      const wasImproved = currentSeverity < previousSeverity;

      setState((prev) => ({
        ...prev,
        isActive: newErrors.length > 0,
        errors: newErrors,
        lastCorrection: code,
        fixedErrors: wasImproved ? prev.fixedErrors + 1 : prev.fixedErrors,
      }));

      if (newErrors.length === 0) {
        onFixed?.(stateRef.current.attemptCount);
        return { success: true, errors: [] };
      }

      return { success: false, errors: newErrors };
    },
    [onFixed],
  );

  /**
   * Reset auto-correction state
   */
  const reset = useCallback(() => {
    setState({
      isActive: false,
      attemptCount: 0,
      errors: [],
      lastCorrection: null,
      totalErrors: 0,
      fixedErrors: 0,
    });
    previousErrorsRef.current = [];
  }, []);

  /**
   * Get auto-correction statistics
   */
  const getStats = useCallback(() => {
    const successRate = state.totalErrors > 0 ? (state.fixedErrors / state.totalErrors) * 100 : 0;

    return {
      totalAttempts: state.attemptCount,
      totalErrors: state.totalErrors,
      fixedErrors: state.fixedErrors,
      successRate,
      isActive: state.isActive,
    };
  }, [state]);

  return {
    state,
    checkForErrors,
    triggerCorrection,
    processCorrectedOutput,
    reset,
    getStats,
  };
}

export default useAutoCorrection;
