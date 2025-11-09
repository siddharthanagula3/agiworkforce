/**
 * Command History Management
 *
 * Tracks command execution history for recent commands and usage frequency.
 * Similar to VS Code/Cursor command palette behavior.
 */

export interface CommandHistoryEntry {
  commandId: string;
  timestamp: number;
  executionCount: number;
}

const STORAGE_KEY = 'agiworkforce-command-history';
const MAX_RECENT_COMMANDS = 10;

/**
 * Get all command history entries
 */
export function getCommandHistory(): CommandHistoryEntry[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return [];
    }
    return JSON.parse(stored) as CommandHistoryEntry[];
  } catch (error) {
    console.error('Failed to load command history:', error);
    return [];
  }
}

/**
 * Record a command execution
 */
export function recordCommandExecution(commandId: string): void {
  try {
    const history = getCommandHistory();
    const existing = history.find((entry) => entry.commandId === commandId);

    if (existing) {
      // Update existing entry
      existing.timestamp = Date.now();
      existing.executionCount += 1;
    } else {
      // Add new entry
      history.push({
        commandId,
        timestamp: Date.now(),
        executionCount: 1,
      });
    }

    // Sort by most recent first
    history.sort((a, b) => b.timestamp - a.timestamp);

    // Keep only MAX_RECENT_COMMANDS
    const trimmed = history.slice(0, MAX_RECENT_COMMANDS);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch (error) {
    console.error('Failed to record command execution:', error);
  }
}

/**
 * Get recent command IDs ordered by recency
 */
export function getRecentCommandIds(): string[] {
  const history = getCommandHistory();
  return history.map((entry) => entry.commandId);
}

/**
 * Get most frequently used command IDs
 */
export function getFrequentCommandIds(): string[] {
  const history = getCommandHistory();
  return history
    .slice()
    .sort((a, b) => b.executionCount - a.executionCount)
    .map((entry) => entry.commandId);
}

/**
 * Clear all command history
 */
export function clearCommandHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear command history:', error);
  }
}

/**
 * Get usage statistics for a command
 */
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

/**
 * Format relative time for "last used" display
 */
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
