import { useEffect } from 'react';
import { AppState } from 'react-native';
import { unloadLocalModels } from '@agiworkforce/local-llm';

export async function releaseLocalModelMemory(): Promise<boolean> {
  try {
    await unloadLocalModels();
    return true;
  } catch {
    // A generation still holds the model; it is released on the next signal.
    return false;
  }
}

export function useLocalModelMemoryRelease(): void {
  useEffect(() => {
    const memoryWarning = AppState.addEventListener('memoryWarning', () => {
      void releaseLocalModelMemory();
    });
    const change = AppState.addEventListener('change', (state) => {
      if (state === 'background') void releaseLocalModelMemory();
    });
    return () => {
      memoryWarning.remove();
      change.remove();
    };
  }, []);
}
