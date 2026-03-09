/**
 * useFileTerminalEvents
 *
 * Listens to file system and terminal events:
 * - agi:file_operation
 * - agi:terminal_command
 *
 * Extracted from useAgenticEvents.ts.
 */
import { listen, UnlistenFn } from '../lib/tauri-mock';
import { useEffect, useRef } from 'react';
import type { FileOperation, TerminalCommand } from '../stores/unifiedChatStore';

// =============================================================================
// Event payload types
// =============================================================================

export interface FileOperationEvent {
  operation: FileOperation;
  messageId?: string;
}

export interface TerminalCommandEvent {
  command: TerminalCommand;
  messageId?: string;
}

// =============================================================================
// Shared utility types (passed in by the parent hook)
// =============================================================================

export interface FileTerminalEventDeps {
  isMountedRef: React.MutableRefObject<boolean>;
  focusSidecar: (eventType: string) => void;
  handlersRef: React.MutableRefObject<{
    addFileOperation: (operation: FileOperation) => void;
    addTerminalCommand: (command: TerminalCommand) => void;
  }>;
}

// =============================================================================
// Hook
// =============================================================================

export function useFileTerminalEvents(deps: FileTerminalEventDeps): void {
  const unlistenFns = useRef<UnlistenFn[]>([]);
  const { isMountedRef, focusSidecar, handlersRef } = deps;

  useEffect(() => {
    const push = (fn: UnlistenFn) => unlistenFns.current.push(fn);

    const setup = async () => {
      if (!isMountedRef.current) return;

      // agi:file_operation
      const unlistenFileOp = await listen<FileOperationEvent>('agi:file_operation', (event) => {
        if (!isMountedRef.current) return;
        handlersRef.current.addFileOperation(event.payload.operation);
        focusSidecar(`file_${event.payload.operation.type ?? 'file'}`);
      });
      push(unlistenFileOp);

      // agi:terminal_command
      const unlistenTerminal = await listen<TerminalCommandEvent>(
        'agi:terminal_command',
        (event) => {
          if (!isMountedRef.current) return;
          handlersRef.current.addTerminalCommand(event.payload.command);
          focusSidecar('terminal_execute');
        },
      );
      push(unlistenTerminal);
    };

    setup().catch((error) => {
      console.error('[useFileTerminalEvents] Failed to setup listeners:', error);
    });

    return () => {
      unlistenFns.current.forEach((fn) => fn());
      unlistenFns.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export default useFileTerminalEvents;
