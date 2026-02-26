import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@/lib/tauri-mock';

export interface LSPPosition {
  line: number;
  character: number;
}

export interface LSPRange {
  start: LSPPosition;
  end: LSPPosition;
}

export interface LSPLocation {
  uri: string;
  range: LSPRange;
}

export interface LSPCompletionItem {
  label: string;
  kind: number;
  detail?: string;
  documentation?: string;
  insert_text?: string;
}

export interface LSPHover {
  contents: string;
  range?: LSPRange;
}

export interface LSPDiagnostic {
  range: LSPRange;
  severity: number;
  message: string;
  source?: string;
  code?: string;
}

export interface LSPWorkspaceSymbol {
  name: string;
  kind: number;
  location: LSPLocation;
  container_name?: string;
}

export interface LSPTextEdit {
  range: LSPRange;
  new_text: string;
}

export interface LSPWorkspaceEdit {
  changes?: Record<string, LSPTextEdit[]>;
}

export interface LSPCodeAction {
  title: string;
  kind?: string;
  diagnostics?: LSPDiagnostic[];
  edit?: LSPWorkspaceEdit;
}

export interface LSPServer {
  language: string;
  command: string;
  args: string[];
  root_uri: string;
  initialized: boolean;
}

interface UseLSPOptions {
  language: string;
  rootPath: string;
  autoStart?: boolean;
}

export function useLSP({ language, rootPath, autoStart = true }: UseLSPOptions) {
  const [server, setServer] = useState<LSPServer | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<Record<string, LSPDiagnostic[]>>({});
  const documentVersionRef = useRef<Record<string, number>>({});

  const serverRef = useRef(server);
  const isStartingRef = useRef(isStarting);
  // HKS-003 fix: Track mount state to prevent state updates after unmount
  const isMountedRef = useRef(true);
  serverRef.current = server;
  isStartingRef.current = isStarting;

  const startServer = useCallback(async () => {
    if (isStartingRef.current || serverRef.current) return;

    setIsStarting(true);
    setError(null);

    try {
      const serverInfo = await invoke<LSPServer>('lsp_start_server', {
        language,
        rootPath,
      });
      // HKS-003 fix: Check if component is still mounted before updating state
      if (isMountedRef.current) {
        setServer(serverInfo);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      // HKS-003 fix: Check if component is still mounted before updating state
      if (isMountedRef.current) {
        setError(errorMsg);
      }
      console.error('Failed to start LSP server:', errorMsg);
    } finally {
      // HKS-003 fix: Check if component is still mounted before updating state
      if (isMountedRef.current) {
        setIsStarting(false);
      }
    }
  }, [language, rootPath]);

  const stopServer = useCallback(async () => {
    if (!serverRef.current) return;

    try {
      await invoke('lsp_stop_server', { language });
      // HKS-003 fix: Check if component is still mounted before updating state
      if (isMountedRef.current) {
        setServer(null);
        setDiagnostics({});
        documentVersionRef.current = {};
      }
    } catch (err) {
      // AUDIT-P3-ERROR: Log but don't fail - server may already be stopped
      console.debug('[LSP] Failed to stop server (may already be stopped):', err);
    }
  }, [language]);

  const didOpen = useCallback(
    async (uri: string, languageId: string, content: string) => {
      if (!server) return;

      try {
        await invoke('lsp_did_open', {
          language,
          uri,
          languageId,
          content,
        });
        documentVersionRef.current[uri] = 1;
      } catch (err) {
        // AUDIT-P3-ERROR: Log but continue - LSP features will be degraded
        console.debug('[LSP] Failed to notify document open (features may be limited):', err);
      }
    },
    [language, server],
  );

  const didChange = useCallback(
    async (uri: string, content: string) => {
      if (!server) return;

      const version = (documentVersionRef.current[uri] || 0) + 1;
      documentVersionRef.current[uri] = version;

      try {
        await invoke('lsp_did_change', {
          language,
          uri,
          version,
          content,
        });
      } catch (err) {
        // AUDIT-P3-ERROR: Log but continue - diagnostics may be stale
        console.debug('[LSP] Failed to notify document change (diagnostics may be stale):', err);
      }
    },
    [language, server],
  );

  const didClose = useCallback(
    async (uri: string) => {
      if (!server) return;

      try {
        await invoke('lsp_did_close', { language, uri });
        delete documentVersionRef.current[uri];
      } catch (err) {
        // AUDIT-P3-ERROR: Log but continue - cleanup is best-effort
        console.debug('[LSP] Failed to notify document close:', err);
      }
    },
    [language, server],
  );

  const getCompletions = useCallback(
    async (uri: string, line: number, character: number): Promise<LSPCompletionItem[]> => {
      if (!server) return [];

      try {
        const items = await invoke<LSPCompletionItem[]>('lsp_completion', {
          language,
          uri,
          line,
          character,
        });
        return items;
      } catch (err) {
        // AUDIT-P3-ERROR: Log at debug level - completions are optional UX enhancement
        console.debug('[LSP] Failed to get completions:', err);
        return [];
      }
    },
    [language, server],
  );

  const getHover = useCallback(
    async (uri: string, line: number, character: number): Promise<LSPHover | null> => {
      if (!server) return null;

      try {
        const hover = await invoke<LSPHover | null>('lsp_hover', {
          language,
          uri,
          line,
          character,
        });
        return hover;
      } catch (err) {
        // AUDIT-P3-ERROR: Log at debug level - hover is optional UX enhancement
        console.debug('[LSP] Failed to get hover:', err);
        return null;
      }
    },
    [language, server],
  );

  const getDefinition = useCallback(
    async (uri: string, line: number, character: number): Promise<LSPLocation[]> => {
      if (!server) return [];

      try {
        const locations = await invoke<LSPLocation[]>('lsp_definition', {
          language,
          uri,
          line,
          character,
        });
        return locations;
      } catch (err) {
        // AUDIT-P3-ERROR: Log at debug level - go-to-definition is optional
        console.debug('[LSP] Failed to get definition:', err);
        return [];
      }
    },
    [language, server],
  );

  const getReferences = useCallback(
    async (uri: string, line: number, character: number): Promise<LSPLocation[]> => {
      if (!server) return [];

      try {
        const locations = await invoke<LSPLocation[]>('lsp_references', {
          language,
          uri,
          line,
          character,
        });
        return locations;
      } catch (err) {
        // AUDIT-P3-ERROR: Log at debug level - find-references is optional
        console.debug('[LSP] Failed to get references:', err);
        return [];
      }
    },
    [language, server],
  );

  const rename = useCallback(
    async (
      uri: string,
      line: number,
      character: number,
      newName: string,
    ): Promise<LSPWorkspaceEdit | null> => {
      if (!server) return null;

      try {
        const edit = await invoke<LSPWorkspaceEdit | null>('lsp_rename', {
          language,
          uri,
          line,
          character,
          newName,
        });
        return edit;
      } catch (err) {
        // AUDIT-P3-ERROR: Rename failure is more impactful - keep at error level
        console.error('[LSP] Failed to rename symbol:', err);
        return null;
      }
    },
    [language, server],
  );

  const format = useCallback(
    async (uri: string): Promise<LSPTextEdit[]> => {
      if (!server) return [];

      try {
        const edits = await invoke<LSPTextEdit[]>('lsp_formatting', {
          language,
          uri,
        });
        return edits;
      } catch (err) {
        // AUDIT-P3-ERROR: Format failure is user-initiated - keep at error level
        console.error('[LSP] Failed to format document:', err);
        return [];
      }
    },
    [language, server],
  );

  const searchWorkspaceSymbols = useCallback(
    async (query: string): Promise<LSPWorkspaceSymbol[]> => {
      if (!server) return [];

      try {
        const symbols = await invoke<LSPWorkspaceSymbol[]>('lsp_workspace_symbol', {
          language,
          query,
        });
        return symbols;
      } catch (err) {
        // AUDIT-P3-ERROR: Symbol search is user-initiated but non-critical
        console.debug('[LSP] Failed to search workspace symbols:', err);
        return [];
      }
    },
    [language, server],
  );

  const getCodeActions = useCallback(
    async (
      uri: string,
      range: LSPRange,
      diagnostics: LSPDiagnostic[],
    ): Promise<LSPCodeAction[]> => {
      if (!server) return [];

      try {
        const actions = await invoke<LSPCodeAction[]>('lsp_code_action', {
          language,
          uri,
          range,
          diagnostics,
        });
        return actions;
      } catch (err) {
        // AUDIT-P3-ERROR: Code actions are optional quick-fix suggestions
        console.debug('[LSP] Failed to get code actions:', err);
        return [];
      }
    },
    [language, server],
  );

  const getDiagnostics = useCallback(
    async (uri: string): Promise<LSPDiagnostic[]> => {
      if (!server) return [];

      try {
        const diags = await invoke<LSPDiagnostic[]>('lsp_get_diagnostics', {
          language,
          uri,
        });
        return diags;
      } catch (err) {
        // AUDIT-P3-ERROR: Diagnostics are important but graceful degradation is acceptable
        console.debug('[LSP] Failed to get diagnostics:', err);
        return [];
      }
    },
    [language, server],
  );

  const getAllDiagnostics = useCallback(async (): Promise<Record<string, LSPDiagnostic[]>> => {
    if (!server) return {};

    try {
      const allDiags = await invoke<Record<string, LSPDiagnostic[]>>('lsp_get_all_diagnostics', {
        language,
      });
      // HKS-003 fix: Check if component is still mounted before updating state
      if (isMountedRef.current) {
        setDiagnostics(allDiags);
      }
      return allDiags;
    } catch (err) {
      // AUDIT-P3-ERROR: Diagnostics are important but graceful degradation is acceptable
      console.debug('[LSP] Failed to get all diagnostics:', err);
      return {};
    }
  }, [language, server]);

  useEffect(() => {
    // HKS-003 fix: Reset mount state on effect setup
    isMountedRef.current = true;

    if (autoStart) {
      startServer();
    }

    return () => {
      // HKS-003 fix: Mark as unmounted to prevent state updates in async callbacks
      isMountedRef.current = false;

      if (serverRef.current) {
        void invoke('lsp_stop_server', { language }).catch((err) => {
          // AUDIT-P3-ERROR: Cleanup failure - server may already be stopped
          console.debug('[LSP] Failed to stop server on cleanup (may already be stopped):', err);
        });
      }
    };
  }, [autoStart, language, startServer]);

  return {
    server,
    isStarting,
    error,
    diagnostics,
    startServer,
    stopServer,
    didOpen,
    didChange,
    didClose,
    getCompletions,
    getHover,
    getDefinition,
    getReferences,
    rename,
    format,
    searchWorkspaceSymbols,
    getCodeActions,
    getDiagnostics,
    getAllDiagnostics,
  };
}
