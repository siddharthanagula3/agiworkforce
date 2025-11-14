/**
 * LSP Integration Hook
 * Manages Language Server Protocol connections for code intelligence
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

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
  severity: number; // 1=Error, 2=Warning, 3=Info, 4=Hint
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

  // Start LSP server
  const startServer = useCallback(async () => {
    if (isStarting || server) return;

    setIsStarting(true);
    setError(null);

    try {
      const serverInfo = await invoke<LSPServer>('lsp_start_server', {
        language,
        rootPath,
      });
      setServer(serverInfo);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      console.error('Failed to start LSP server:', errorMsg);
    } finally {
      setIsStarting(false);
    }
  }, [language, rootPath, isStarting, server]);

  // Stop LSP server
  const stopServer = useCallback(async () => {
    if (!server) return;

    try {
      await invoke('lsp_stop_server', { language });
      setServer(null);
      setDiagnostics({});
      documentVersionRef.current = {};
    } catch (err) {
      console.error('Failed to stop LSP server:', err);
    }
  }, [language, server]);

  // Notify LSP of document open
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
        console.error('Failed to notify LSP of document open:', err);
      }
    },
    [language, server]
  );

  // Notify LSP of document change
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
        console.error('Failed to notify LSP of document change:', err);
      }
    },
    [language, server]
  );

  // Notify LSP of document close
  const didClose = useCallback(
    async (uri: string) => {
      if (!server) return;

      try {
        await invoke('lsp_did_close', { language, uri });
        delete documentVersionRef.current[uri];
      } catch (err) {
        console.error('Failed to notify LSP of document close:', err);
      }
    },
    [language, server]
  );

  // Get completions
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
        console.error('Failed to get completions:', err);
        return [];
      }
    },
    [language, server]
  );

  // Get hover information
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
        console.error('Failed to get hover:', err);
        return null;
      }
    },
    [language, server]
  );

  // Go to definition
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
        console.error('Failed to get definition:', err);
        return [];
      }
    },
    [language, server]
  );

  // Find references
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
        console.error('Failed to get references:', err);
        return [];
      }
    },
    [language, server]
  );

  // Rename symbol
  const rename = useCallback(
    async (
      uri: string,
      line: number,
      character: number,
      newName: string
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
        console.error('Failed to rename:', err);
        return null;
      }
    },
    [language, server]
  );

  // Format document
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
        console.error('Failed to format document:', err);
        return [];
      }
    },
    [language, server]
  );

  // Search workspace symbols
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
        console.error('Failed to search workspace symbols:', err);
        return [];
      }
    },
    [language, server]
  );

  // Get code actions
  const getCodeActions = useCallback(
    async (uri: string, range: LSPRange, diagnostics: LSPDiagnostic[]): Promise<LSPCodeAction[]> => {
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
        console.error('Failed to get code actions:', err);
        return [];
      }
    },
    [language, server]
  );

  // Get diagnostics for a document
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
        console.error('Failed to get diagnostics:', err);
        return [];
      }
    },
    [language, server]
  );

  // Get all diagnostics
  const getAllDiagnostics = useCallback(async (): Promise<Record<string, LSPDiagnostic[]>> => {
    if (!server) return {};

    try {
      const allDiags = await invoke<Record<string, LSPDiagnostic[]>>('lsp_get_all_diagnostics', {
        language,
      });
      setDiagnostics(allDiags);
      return allDiags;
    } catch (err) {
      console.error('Failed to get all diagnostics:', err);
      return {};
    }
  }, [language, server]);

  // Auto-start server on mount
  useEffect(() => {
    if (autoStart && !server && !isStarting) {
      startServer();
    }

    return () => {
      if (server) {
        stopServer();
      }
    };
  }, [autoStart, server, isStarting, startServer, stopServer]);

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
