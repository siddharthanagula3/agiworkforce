import { safeGetJSON, safeSetJSON, safeRemoveItem } from './localStorage';

export interface CommandHistoryEntry {
  commandId: string;
  timestamp: number;
  executionCount: number;
}

const STORAGE_KEY = 'agiworkforce-command-history';
const MAX_RECENT_COMMANDS = 10;

export function getCommandHistory(): CommandHistoryEntry[] {
  return safeGetJSON<CommandHistoryEntry[]>(STORAGE_KEY, []);
}

export function recordCommandExecution(commandId: string): void {
  const history = getCommandHistory();
  const existing = history.find((entry) => entry.commandId === commandId);

  if (existing) {
    existing.timestamp = Date.now();
    existing.executionCount += 1;
  } else {
    history.push({
      commandId,
      timestamp: Date.now(),
      executionCount: 1,
    });
  }

  history.sort((a, b) => b.timestamp - a.timestamp);

  const trimmed = history.slice(0, MAX_RECENT_COMMANDS);

  const success = safeSetJSON(STORAGE_KEY, trimmed);
  if (!success) {
    console.warn('[CommandHistory] Failed to save command history - using in-memory only');
  }
}

export function getRecentCommandIds(): string[] {
  const history = getCommandHistory();
  return history.map((entry) => entry.commandId);
}

export function getFrequentCommandIds(): string[] {
  const history = getCommandHistory();
  return history
    .slice()
    .sort((a, b) => b.executionCount - a.executionCount)
    .map((entry) => entry.commandId);
}

export function clearCommandHistory(): void {
  const success = safeRemoveItem(STORAGE_KEY);
  if (!success) {
    console.warn('[CommandHistory] Failed to clear command history');
  }
}

export function getCommandStats(commandId: string): {
  executionCount: number;
  lastUsed: number | null;
} {
  const history = getCommandHistory();
  const entry = history.find((e) => e.commandId === commandId);

  if (entry) {
    return {
      executionCount: entry.executionCount,
      lastUsed: entry.timestamp,
    };
  }

  return {
    executionCount: 0,
    lastUsed: null,
  };
}

export function formatLastUsed(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) {
    return 'Just now';
  } else if (minutes < 60) {
    return `${minutes}m ago`;
  } else if (hours < 24) {
    return `${hours}h ago`;
  } else if (days < 7) {
    return `${days}d ago`;
  } else {
    return new Date(timestamp).toLocaleDateString();
  }
}
