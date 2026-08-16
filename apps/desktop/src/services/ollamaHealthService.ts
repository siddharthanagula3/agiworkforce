
import { ollamaCheckStatus, ollamaListModels, type OllamaModel } from '../api/ollama';
import { useModelStore } from '../stores/modelStore';
import { notifyLocalModelCatalogChanged } from '../lib/localModelCatalog';

const HEALTH_CHECK_INTERVAL_MS = 30_000;
const HEALTH_CHECK_BACKOFF_MS = 60_000;
const STARTUP_DELAY_MS = 2_000;
const MAX_CONSECUTIVE_FAILURES = 3;

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

async function performHealthCheck(): Promise<boolean> {
  try {
    const available = await ollamaCheckStatus();

    if (available) {
      if (!healthState.isRunning) {
        console.debug('[OllamaHealth] Ollama is now available');
      }

      healthState.isRunning = true;
      healthState.consecutiveFailures = 0;
      healthState.lastCheck = Date.now();

      useModelStore.setState({
        ollamaAvailable: true,
        ollamaError: null,
      });

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

function handleUnavailable(reason: string): void {
  const wasRunning = healthState.isRunning;
  const hadModels = healthState.modelsCount > 0;
  healthState.isRunning = false;
  healthState.lastCheck = Date.now();
  healthState.consecutiveFailures++;
  healthState.modelsCount = 0;

  if (healthState.consecutiveFailures <= MAX_CONSECUTIVE_FAILURES) {
    if (wasRunning) {
      console.warn('[OllamaHealth] Ollama became unavailable:', reason);
    } else if (healthState.consecutiveFailures === 1) {
      console.debug('[OllamaHealth] Ollama is not running. Local models will be unavailable.');
    }
  }

  useModelStore.setState({
    ollamaAvailable: false,
    ollamaError: getGracefulErrorMessage(),
    ollamaModels: [],
  });
  if (wasRunning || hadModels) {
    notifyLocalModelCatalogChanged('background-health');
  }

  adjustCheckInterval();
}

function getGracefulErrorMessage(): string {
  return (
    'Ollama is not running. ' +
    'To use local AI models, start Ollama by running "ollama serve" in your terminal. ' +
    'Cloud models will continue to work normally.'
  );
}

async function fetchModelsAsync(): Promise<void> {
  try {
    const models: OllamaModel[] = await ollamaListModels();

    const previousCount = healthState.modelsCount;
    healthState.modelsCount = models.length;

    if (models.length !== previousCount) {
      console.debug(`[OllamaHealth] Found ${models.length} local model(s)`);
    }

    useModelStore.setState({
      ollamaModels: models,
      ollamaLoading: false,
    });
    if (models.length !== previousCount) {
      notifyLocalModelCatalogChanged('background-health');
    }
  } catch (error) {
    console.warn('[OllamaHealth] Failed to fetch models:', error);
  }
}

function adjustCheckInterval(): void {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
  }

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
  console.debug('[OllamaHealth] Initializing health service...');

  setTimeout(() => {
    void performHealthCheck().then(() => {
      adjustCheckInterval();
    });
  }, STARTUP_DELAY_MS);

  return stopOllamaHealthService;
}

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

export async function forceHealthCheck(): Promise<boolean> {
  healthState.consecutiveFailures = 0;
  return performHealthCheck();
}

export function getHealthState(): Readonly<HealthState> {
  return { ...healthState };
}

export function isOllamaAvailable(): boolean {
  return healthState.isRunning;
}
