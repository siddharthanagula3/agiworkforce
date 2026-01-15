/**
 * Ollama Health Service
 *
 * Provides automatic health monitoring for local Ollama instance with:
 * - Startup health check
 * - Periodic health monitoring (with backoff when unavailable)
 * - Graceful degradation messaging
 * - Auto-recovery detection when Ollama starts
 *
 * This service runs in the background and updates the modelStore state,
 * allowing the UI to gracefully degrade when Ollama is not available.
 */

import { ollamaCheckStatus, ollamaListModels, type OllamaModel } from '../api/ollama';
import { useModelStore } from '../stores/modelStore';

// Configuration
const HEALTH_CHECK_INTERVAL_MS = 30_000; // 30 seconds when healthy
const HEALTH_CHECK_BACKOFF_MS = 60_000; // 60 seconds when unhealthy
const STARTUP_DELAY_MS = 2_000; // Wait 2 seconds after app start before first check
const MAX_CONSECUTIVE_FAILURES = 3; // Stop logging after this many failures

interface HealthState {
  isRunning: boolean;
  lastCheck: number;
  consecutiveFailures: number;
  modelsCount: number;
}

let healthCheckInterval: ReturnType<typeof setInterval> | null = null;
let isInitialized = false;
let healthState: HealthState = {
  isRunning: false,
  lastCheck: 0,
  consecutiveFailures: 0,
  modelsCount: 0,
};

/**
 * Perform a health check on the Ollama service.
 * Updates the modelStore with availability status.
 */
async function performHealthCheck(): Promise<boolean> {
  try {
    const available = await ollamaCheckStatus();

    if (available) {
      // Only log status changes
      if (!healthState.isRunning) {
        console.log('[OllamaHealth] Ollama is now available');
      }

      healthState.isRunning = true;
      healthState.consecutiveFailures = 0;
      healthState.lastCheck = Date.now();

      // Update store
      useModelStore.setState({
        ollamaAvailable: true,
        ollamaError: null,
      });

      // Fetch models in background (don't block health check)
      fetchModelsAsync();

      return true;
    } else {
      handleUnavailable('Ollama is not responding');
      return false;
    }
  } catch (error) {
    handleUnavailable(String(error));
    return false;
  }
}

/**
 * Handle Ollama being unavailable
 */
function handleUnavailable(reason: string): void {
  const wasRunning = healthState.isRunning;
  healthState.isRunning = false;
  healthState.lastCheck = Date.now();
  healthState.consecutiveFailures++;

  // Only log the first few failures to avoid log spam
  if (healthState.consecutiveFailures <= MAX_CONSECUTIVE_FAILURES) {
    if (wasRunning) {
      console.warn('[OllamaHealth] Ollama became unavailable:', reason);
    } else if (healthState.consecutiveFailures === 1) {
      console.log('[OllamaHealth] Ollama is not running. Local models will be unavailable.');
    }
  }

  // Update store with graceful error message
  useModelStore.setState({
    ollamaAvailable: false,
    ollamaError: getGracefulErrorMessage(),
    ollamaModels: [],
  });

  // Adjust check interval (backoff when unavailable)
  adjustCheckInterval();
}

/**
 * Get a user-friendly error message with actionable instructions
 */
function getGracefulErrorMessage(): string {
  return (
    'Ollama is not running. ' +
    'To use local AI models, start Ollama by running "ollama serve" in your terminal. ' +
    'Cloud models will continue to work normally.'
  );
}

/**
 * Fetch Ollama models asynchronously (doesn't block health check)
 */
async function fetchModelsAsync(): Promise<void> {
  try {
    const models: OllamaModel[] = await ollamaListModels();

    const previousCount = healthState.modelsCount;
    healthState.modelsCount = models.length;

    // Only log if model count changed
    if (models.length !== previousCount) {
      console.log(`[OllamaHealth] Found ${models.length} local model(s)`);
    }

    useModelStore.setState({
      ollamaModels: models,
      ollamaLoading: false,
    });
  } catch (error) {
    console.warn('[OllamaHealth] Failed to fetch models:', error);
  }
}

/**
 * Adjust the health check interval based on current state
 */
function adjustCheckInterval(): void {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
  }

  // Use backoff interval when unavailable
  const interval = healthState.isRunning ? HEALTH_CHECK_INTERVAL_MS : HEALTH_CHECK_BACKOFF_MS;

  healthCheckInterval = setInterval(() => {
    void performHealthCheck();
  }, interval);
}

/**
 * Initialize the Ollama health service.
 * Should be called once at app startup.
 *
 * @returns Cleanup function to stop monitoring
 */
export function initializeOllamaHealthService(): () => void {
  if (isInitialized) {
    console.warn('[OllamaHealth] Service already initialized');
    return stopOllamaHealthService;
  }

  isInitialized = true;
  console.log('[OllamaHealth] Initializing health service...');

  // Delay initial check to let the app fully load
  setTimeout(() => {
    void performHealthCheck().then(() => {
      // Start periodic monitoring
      adjustCheckInterval();
    });
  }, STARTUP_DELAY_MS);

  return stopOllamaHealthService;
}

/**
 * Stop the health monitoring service
 */
export function stopOllamaHealthService(): void {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
  isInitialized = false;
  healthState = {
    isRunning: false,
    lastCheck: 0,
    consecutiveFailures: 0,
    modelsCount: 0,
  };
}

/**
 * Force an immediate health check (useful when user clicks "refresh")
 */
export async function forceHealthCheck(): Promise<boolean> {
  // Reset consecutive failures to allow logging again
  healthState.consecutiveFailures = 0;
  return performHealthCheck();
}

/**
 * Get the current health state (for debugging/testing)
 */
export function getHealthState(): Readonly<HealthState> {
  return { ...healthState };
}

/**
 * Check if Ollama is currently available
 */
export function isOllamaAvailable(): boolean {
  return healthState.isRunning;
}
