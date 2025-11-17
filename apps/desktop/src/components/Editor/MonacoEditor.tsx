/**
 * Monaco Editor with LSP Integration
 * Provides IDE-quality code editing with language server support
 */
import React, { useEffect, useRef, useState } from 'react';
import * as monaco from 'monaco-editor';
import { useLSP } from '../../hooks/useLSP';
import { invoke } from '@tauri-apps/api/core';

interface MonacoEditorProps {
  value: string;
  onChange?: (value: string) => void;
  language?: string;
  filePath?: string;
  rootPath?: string;
  height?: string | number;
  theme?: 'vs-dark' | 'vs-light' | 'hc-black';
  options?: monaco.editor.IStandaloneEditorConstructionOptions;
  enableLSP?: boolean;
}

export const MonacoEditor: React.FC<MonacoEditorProps> = ({
  value,
  onChange,
  language: propLanguage,
  filePath,
  rootPath = process.cwd?.() || '/',
  height = '100%',
  theme = 'vs-dark',
  options = {},
  enableLSP = true,
}) => {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [detectedLanguage, setDetectedLanguage] = useState<string>(propLanguage || 'plaintext');
  const [fileUri, setFileUri] = useState<string>('');
  const initialValueRef = useRef(value);
  const onChangeRef = useRef(onChange);

  initialValueRef.current = value;

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Detect language from file path
  useEffect(() => {
    const detectLanguage = async () => {
      if (filePath && !propLanguage) {
        try {
          const lang = await invoke<string>('lsp_detect_language', { filePath });
          setDetectedLanguage(lang);
        } catch (err) {
          console.warn('Could not detect language:', err);
          setDetectedLanguage('plaintext');
        }
      } else if (propLanguage) {
        setDetectedLanguage(propLanguage);
      }
    };

    detectLanguage();
  }, [filePath, propLanguage]);

  // Set file URI
  useEffect(() => {
    if (filePath) {
      setFileUri(`file://${filePath}`);
    } else {
      setFileUri(`inmemory://model/${Date.now()}.${detectedLanguage}`);
    }
  }, [filePath, detectedLanguage]);

  // Initialize LSP
  const lsp = useLSP({
    language: detectedLanguage,
    rootPath,
    autoStart: enableLSP && detectedLanguage !== 'plaintext',
  });

  // Register completion provider
  useEffect(() => {
    if (!enableLSP || !lsp.server || !editorRef.current) return;

    const completionProvider = monaco.languages.registerCompletionItemProvider(detectedLanguage, {
      triggerCharacters: ['.', ':', '<', '"', '/', '@'],
      provideCompletionItems: async (_model, position) => {
        // offset and textUntilPosition reserved for future use
        // const _offset = model.getOffsetAt(position);
        // const _textUntilPosition = model.getValueInRange({
        //   startLineNumber: 1,
        //   startColumn: 1,
        //   endLineNumber: position.lineNumber,
        //   endColumn: position.column,
        // });

        const items = await lsp.getCompletions(
          fileUri,
          position.lineNumber - 1,
          position.column - 1
        );

        return {
          suggestions: items.map((item) => ({
            label: item.label,
            kind: item.kind,
            detail: item.detail,
            documentation: item.documentation,
            insertText: item.insert_text || item.label,
            range: {
              startLineNumber: position.lineNumber,
              startColumn: position.column,
              endLineNumber: position.lineNumber,
              endColumn: position.column,
            },
          })),
        };
      },
    });

    return () => {
      completionProvider.dispose();
    };
  }, [enableLSP, lsp.server, detectedLanguage, fileUri, lsp]);

  // Register hover provider
  useEffect(() => {
    if (!enableLSP || !lsp.server || !editorRef.current) return;

    const hoverProvider = monaco.languages.registerHoverProvider(detectedLanguage, {
      provideHover: async (_model, position) => {
        const hover = await lsp.getHover(fileUri, position.lineNumber - 1, position.column - 1);

        if (!hover) return null;

        return {
          contents: [{ value: hover.contents }],
          range: hover.range
            ? {
                startLineNumber: hover.range.start.line + 1,
                startColumn: hover.range.start.character + 1,
                endLineNumber: hover.range.end.line + 1,
                endColumn: hover.range.end.character + 1,
              }
            : undefined,
        };
      },
    });

    return () => {
      hoverProvider.dispose();
    };
  }, [enableLSP, lsp.server, detectedLanguage, fileUri, lsp]);

  // Register definition provider
  useEffect(() => {
    if (!enableLSP || !lsp.server || !editorRef.current) return;

    const definitionProvider = monaco.languages.registerDefinitionProvider(detectedLanguage, {
      provideDefinition: async (_model, position) => {
        const locations = await lsp.getDefinition(
          fileUri,
          position.lineNumber - 1,
          position.column - 1
        );

        return locations.map((loc) => ({
          uri: monaco.Uri.parse(loc.uri),
          range: {
            startLineNumber: loc.range.start.line + 1,
            startColumn: loc.range.start.character + 1,
            endLineNumber: loc.range.end.line + 1,
            endColumn: loc.range.end.character + 1,
          },
        }));
      },
    });

    return () => {
      definitionProvider.dispose();
    };
  }, [enableLSP, lsp.server, detectedLanguage, fileUri, lsp]);

  // Register references provider
  useEffect(() => {
    if (!enableLSP || !lsp.server || !editorRef.current) return;

    const referencesProvider = monaco.languages.registerReferenceProvider(detectedLanguage, {
      provideReferences: async (_model, position, _context) => {
        const locations = await lsp.getReferences(
          fileUri,
          position.lineNumber - 1,
          position.column - 1
        );

        return locations.map((loc) => ({
          uri: monaco.Uri.parse(loc.uri),
          range: {
            startLineNumber: loc.range.start.line + 1,
            startColumn: loc.range.start.character + 1,
            endLineNumber: loc.range.end.line + 1,
            endColumn: loc.range.end.character + 1,
          },
        }));
      },
    });

    return () => {
      referencesProvider.dispose();
    };
  }, [enableLSP, lsp.server, detectedLanguage, fileUri, lsp]);

  // Register formatting provider
  useEffect(() => {
    if (!enableLSP || !lsp.server || !editorRef.current) return;

    const formattingProvider = monaco.languages.registerDocumentFormattingEditProvider(
      detectedLanguage,
      {
        provideDocumentFormattingEdits: async (_model) => {
          const edits = await lsp.format(fileUri);

          return edits.map((edit) => ({
            range: {
              startLineNumber: edit.range.start.line + 1,
              startColumn: edit.range.start.character + 1,
              endLineNumber: edit.range.end.line + 1,
              endColumn: edit.range.end.character + 1,
            },
            text: edit.new_text,
          }));
        },
      }
    );

    return () => {
      formattingProvider.dispose();
    };
  }, [enableLSP, lsp.server, detectedLanguage, fileUri, lsp]);

  // Register rename provider
  useEffect(() => {
    if (!enableLSP || !lsp.server || !editorRef.current) return;

    const renameProvider = monaco.languages.registerRenameProvider(detectedLanguage, {
      provideRenameEdits: async (_model, position, newName) => {
        const workspaceEdit = await lsp.rename(
          fileUri,
          position.lineNumber - 1,
          position.column - 1,
          newName
        );

        if (!workspaceEdit || !workspaceEdit.changes) return { edits: [] };

        const edits: monaco.languages.IWorkspaceTextEdit[] = [];

        Object.entries(workspaceEdit.changes).forEach(([uri, textEdits]) => {
          textEdits.forEach((edit) => {
            edits.push({
              resource: monaco.Uri.parse(uri),
              versionId: undefined,
              textEdit: {
                range: {
                  startLineNumber: edit.range.start.line + 1,
                  startColumn: edit.range.start.character + 1,
                  endLineNumber: edit.range.end.line + 1,
                  endColumn: edit.range.end.character + 1,
                },
                text: edit.new_text,
              },
            });
          });
        });

        return { edits };
      },
    });

    return () => {
      renameProvider.dispose();
    };
  }, [enableLSP, lsp.server, detectedLanguage, fileUri, lsp]);

  // Update diagnostics
  useEffect(() => {
    if (!enableLSP || !lsp.server || !editorRef.current) return;

    const updateDiagnostics = async () => {
      const diagnostics = await lsp.getDiagnostics(fileUri);

      const model = editorRef.current?.getModel();
      if (!model) return;

      const markers = diagnostics.map((diag) => ({
        severity:
          diag.severity === 1
            ? monaco.MarkerSeverity.Error
            : diag.severity === 2
            ? monaco.MarkerSeverity.Warning
            : diag.severity === 3
            ? monaco.MarkerSeverity.Info
            : monaco.MarkerSeverity.Hint,
        message: diag.message,
        source: diag.source,
        code: diag.code,
        startLineNumber: diag.range.start.line + 1,
        startColumn: diag.range.start.character + 1,
        endLineNumber: diag.range.end.line + 1,
        endColumn: diag.range.end.character + 1,
      }));

      monaco.editor.setModelMarkers(model, 'lsp', markers);
    };

    // Update diagnostics periodically
    const interval = setInterval(updateDiagnostics, 1000);
    updateDiagnostics();

    return () => {
      clearInterval(interval);
    };
  }, [enableLSP, lsp.server, fileUri, lsp]);

  // Initialize editor
  useEffect(() => {
    if (!containerRef.current) return;

    const editor = monaco.editor.create(containerRef.current, {
      value: initialValueRef.current,
      language: detectedLanguage,
      theme,
      automaticLayout: true,
      minimap: { enabled: true },
      fontSize: 14,
      lineNumbers: 'on',
      roundedSelection: false,
      scrollBeyondLastLine: false,
      readOnly: false,
      ...options,
    });

    editorRef.current = editor;

    // Notify LSP of document open
    if (enableLSP && lsp.server) {
      lsp.didOpen(fileUri, detectedLanguage, editor.getValue());
    }

    // Handle content changes
    editor.onDidChangeModelContent(() => {
      const newValue = editor.getValue();
      onChangeRef.current?.(newValue);

      // Notify LSP of changes
      if (enableLSP && lsp.server) {
        lsp.didChange(fileUri, newValue);
      }
    });

    // Add keyboard shortcuts
    editor.addCommand(monaco.KeyCode.F12, () => {
      // Go to definition
      const position = editor.getPosition();
      if (position) {
        editor.getAction('editor.action.revealDefinition')?.run();
      }
    });

    editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.F12, () => {
      // Find references
      const position = editor.getPosition();
      if (position) {
        editor.getAction('editor.action.goToReferences')?.run();
      }
    });

    editor.addCommand(monaco.KeyCode.F2, () => {
      // Rename symbol
      const position = editor.getPosition();
      if (position) {
        editor.getAction('editor.action.rename')?.run();
      }
    });

    return () => {
      // Notify LSP of document close
      if (enableLSP && lsp.server) {
        lsp.didClose(fileUri);
      }

      editor.dispose();
    };
  }, [detectedLanguage, theme, options, enableLSP, fileUri, lsp]);

  // Update value when prop changes
  useEffect(() => {
    if (editorRef.current && editorRef.current.getValue() !== value) {
      editorRef.current.setValue(value);
    }
  }, [value]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: typeof height === 'number' ? `${height}px` : height,
      }}
    />
  );
};

export default MonacoEditor;
