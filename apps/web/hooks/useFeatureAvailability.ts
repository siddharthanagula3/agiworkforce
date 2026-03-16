'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Hook to track feature availability with graceful degradation
 * Provides fallback values when features are unavailable
 */
export interface FeatureFlags {
  voice: boolean;
  darkMode: boolean;
  modelSelection: boolean;
  streaming: boolean;
  webSearch: boolean;
  imageGeneration: boolean;
}

export interface UseFeatureAvailabilityOptions {
  onFeatureUnavailable?: (feature: keyof FeatureFlags) => void;
}

export function useFeatureAvailability(options: UseFeatureAvailabilityOptions = {}) {
  const { onFeatureUnavailable } = options;
  const [features, setFeatures] = useState<FeatureFlags>({
    voice: true,
    darkMode: true,
    modelSelection: true,
    streaming: true,
    webSearch: true,
    imageGeneration: true,
  });

  // Check browser capabilities
  useEffect(() => {
    const checkCapabilities = () => {
      const updated = { ...features };

      // Check if speech recognition is available
      if (!window.speechRecognition && !('webkitSpeechRecognition' in window)) {
        updated.voice = false;
        onFeatureUnavailable?.('voice');
      }

      // Check if dark mode preference can be detected
      if (!window.matchMedia) {
        updated.darkMode = false;
        onFeatureUnavailable?.('darkMode');
      }

      // Check if localStorage is available
      try {
        const test = '__feature_check__';
        localStorage.setItem(test, test);
        localStorage.removeItem(test);
      } catch {
        // If localStorage fails, assume features dependent on it are unavailable
        updated.modelSelection = false;
        onFeatureUnavailable?.('modelSelection');
      }

      // Check for WebSocket support (for streaming)
      if (!('WebSocket' in window)) {
        updated.streaming = false;
        onFeatureUnavailable?.('streaming');
      }

      setFeatures(updated);
    };

    checkCapabilities();
  }, [onFeatureUnavailable]);

  const isAvailable = useCallback(
    (feature: keyof FeatureFlags) => {
      return features[feature];
    },
    [features],
  );

  const getFallback = useCallback(
    (feature: keyof FeatureFlags, value: any) => {
      if (features[feature]) {
        return value;
      }
      // Return appropriate fallback
      switch (feature) {
        case 'darkMode':
          return 'light';
        case 'voice':
          return false;
        case 'modelSelection':
          return null;
        case 'streaming':
          return false;
        default:
          return null;
      }
    },
    [features],
  );

  return {
    features,
    isAvailable,
    getFallback,
  };
}
