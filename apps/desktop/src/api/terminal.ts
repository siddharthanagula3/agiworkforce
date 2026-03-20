/**
 * Terminal API
 *
 * Standalone API wrappers for all terminal Rust commands.
 * The terminalStore.ts uses these commands inline; this module provides
 * importable functions for use outside the store (components, hooks, other APIs).
 *
 * Rust commands (terminal.rs):
 *   execute_terminal_command, terminal_execute, terminal_detect_shells,
 *   terminal_create_session, terminal_send_input, terminal_resize,
 *   terminal_kill, terminal_list_sessions, terminal_get_history,
 *   terminal_ai_suggest_command, terminal_ai_explain_error,
 *   terminal_smart_commit, terminal_ai_suggest_improvements,
 *   terminal_set_env, terminal_get_env, terminal_list_env,
 *   terminal_unset_env, terminal_clear_history
 */

import { invoke } from '../lib/tauri-mock';

// ============================================================================
// Interfaces
// ============================================================================

export interface ExecuteResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  streamId: string | null;
}

export interface TerminalExecuteResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ShellInfo {
  name: string;
  path: string;
  available: boolean;
  shell_type: string;
}

export interface ExecuteCommandOptions {
  cwd?: string;
  shell?: string;
  streamId?: string;
  emitEvents?: boolean;
  timeoutMs?: number;
}

// ============================================================================
// One-Shot Execution Commands
// ============================================================================

/** Execute a terminal command with full options (shell, cwd, streaming, timeout) */
export const executeTerminalCommand = async (
  command: string,
  options?: ExecuteCommandOptions,
): Promise<ExecuteResult> => {
  try {
    return await invoke<ExecuteResult>('execute_terminal_command', {
      command,
      cwd: options?.cwd ?? null,
      shell: options?.shell ?? null,
      streamId: options?.streamId ?? null,
      emitEvents: options?.emitEvents ?? null,
      timeoutMs: options?.timeoutMs ?? null,
    });
  } catch (error) {
    console.error('Failed to execute terminal command:', error);
    throw error;
  }
};

/** Simplified terminal execution (command + optional working dir) */
export const terminalExecute = async (
  command: string,
  workingDir?: string,
): Promise<TerminalExecuteResult> => {
  try {
    return await invoke<TerminalExecuteResult>('terminal_execute', {
      command,
      workingDir: workingDir ?? null,
    });
  } catch (error) {
    console.error('Failed to execute simple terminal command:', error);
    throw error;
  }
};

// ============================================================================
// Shell Detection
// ============================================================================

/** Detect all available shells on the system */
export const terminalDetectShells = async (): Promise<ShellInfo[]> => {
  try {
    return await invoke<ShellInfo[]>('terminal_detect_shells');
  } catch (error) {
    console.error('Failed to detect shells:', error);
    throw error;
  }
};

// ============================================================================
// Session Management
// ============================================================================

/** Create a new terminal session with specified shell type */
export const terminalCreateSession = async (
  shellType: string,
  cwd?: string,
): Promise<string> => {
  try {
    return await invoke<string>('terminal_create_session', {
      shellType,
      cwd: cwd ?? null,
    });
  } catch (error) {
    console.error('Failed to create terminal session:', error);
    throw error;
  }
};

/** Send input data to a terminal session */
export const terminalSendInput = async (
  sessionId: string,
  data: string,
): Promise<void> => {
  try {
    await invoke<void>('terminal_send_input', { sessionId, data });
  } catch (error) {
    console.error('Failed to send terminal input:', error);
    throw error;
  }
};

/** Resize a terminal session */
export const terminalResize = async (
  sessionId: string,
  cols: number,
  rows: number,
): Promise<void> => {
  try {
    await invoke<void>('terminal_resize', { sessionId, cols, rows });
  } catch (error) {
    console.error('Failed to resize terminal:', error);
    throw error;
  }
};

/** Kill a terminal session */
export const terminalKill = async (sessionId: string): Promise<void> => {
  try {
    await invoke<void>('terminal_kill', { sessionId });
  } catch (error) {
    console.error('Failed to kill terminal session:', error);
    throw error;
  }
};

/** List all active terminal session IDs */
export const terminalListSessions = async (): Promise<string[]> => {
  try {
    return await invoke<string[]>('terminal_list_sessions');
  } catch (error) {
    console.error('Failed to list terminal sessions:', error);
    throw error;
  }
};

/** Get command history for a session */
export const terminalGetHistory = async (
  sessionId: string,
  limit?: number,
): Promise<string[]> => {
  try {
    return await invoke<string[]>('terminal_get_history', {
      sessionId,
      limit: limit ?? null,
    });
  } catch (error) {
    console.error('Failed to get terminal history:', error);
    throw error;
  }
};

/** Clear command history for a session */
export const terminalClearHistory = async (sessionId: string): Promise<void> => {
  try {
    await invoke<void>('terminal_clear_history', { sessionId });
  } catch (error) {
    console.error('Failed to clear terminal history:', error);
    throw error;
  }
};

// ============================================================================
// Environment Variables
// ============================================================================

/** Set an environment variable in a terminal session */
export const terminalSetEnv = async (
  sessionId: string,
  key: string,
  value: string,
): Promise<void> => {
  try {
    await invoke<void>('terminal_set_env', { sessionId, key, value });
  } catch (error) {
    console.error('Failed to set environment variable:', error);
    throw error;
  }
};

/** Get an environment variable from a terminal session */
export const terminalGetEnv = async (
  sessionId: string,
  key: string,
): Promise<string | null> => {
  try {
    return await invoke<string | null>('terminal_get_env', { sessionId, key });
  } catch (error) {
    console.error('Failed to get environment variable:', error);
    throw error;
  }
};

/** List all environment variables in a terminal session */
export const terminalListEnv = async (
  sessionId: string,
): Promise<[string, string][]> => {
  try {
    return await invoke<[string, string][]>('terminal_list_env', { sessionId });
  } catch (error) {
    console.error('Failed to list environment variables:', error);
    throw error;
  }
};

/** Unset an environment variable in a terminal session */
export const terminalUnsetEnv = async (
  sessionId: string,
  key: string,
): Promise<void> => {
  try {
    await invoke<void>('terminal_unset_env', { sessionId, key });
  } catch (error) {
    console.error('Failed to unset environment variable:', error);
    throw error;
  }
};

// ============================================================================
// AI Commands
// ============================================================================

/** AI-powered command suggestion from natural language intent */
export const terminalAiSuggestCommand = async (
  intent: string,
  shellType: string,
  cwd?: string,
): Promise<string> => {
  try {
    return await invoke<string>('terminal_ai_suggest_command', {
      intent,
      shellType,
      cwd: cwd ?? null,
    });
  } catch (error) {
    console.error('Failed to get AI command suggestion:', error);
    throw error;
  }
};

/** AI-powered error explanation */
export const terminalAiExplainError = async (
  errorOutput: string,
  command?: string,
  shellType?: string,
): Promise<string> => {
  try {
    return await invoke<string>('terminal_ai_explain_error', {
      errorOutput,
      command: command ?? null,
      shellType: shellType ?? 'zsh',
    });
  } catch (error) {
    console.error('Failed to get AI error explanation:', error);
    throw error;
  }
};

/** AI-powered smart commit for a terminal session */
export const terminalSmartCommit = async (sessionId: string): Promise<string> => {
  try {
    return await invoke<string>('terminal_smart_commit', { sessionId });
  } catch (error) {
    console.error('Failed to perform smart commit:', error);
    throw error;
  }
};

/** AI-powered command improvement suggestions */
export const terminalAiSuggestImprovements = async (
  command: string,
  shellType: string,
): Promise<string | null> => {
  try {
    return await invoke<string | null>('terminal_ai_suggest_improvements', {
      command,
      shellType,
    });
  } catch (error) {
    console.error('Failed to get AI command improvements:', error);
    throw error;
  }
};
