import { useEffect, useRef, useState } from 'react';
import Editor, { Monaco, OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { useTheme } from '../../hooks/useTheme';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import { Save, RotateCcw, Copy, Check, Download } from 'lucide-react';
import { toast } from 'sonner';

interface CodeEditorProps {
  defaultValue?: string;
  language?: string;
  path?: string;
  readOnly?: boolean;
  onChange?: (value: string | undefined) => void;
  onSave?: (value: string, context: { auto: boolean; path?: string }) => Promise<void> | void;
  className?: string;
}

export function CodeEditor({
  defaultValue = '',
  language = 'typescript',
  path,
  readOnly = false,
  onChange,
  onSave,
  className,
}: CodeEditorProps) {
  const [value, setValue] = useState(defaultValue);
  const [originalValue, setOriginalValue] = useState(defaultValue);
  const [saved, setSaved] = useState(false);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const valueRef = useRef(defaultValue);
  const originalRef = useRef(defaultValue);
  const { theme } = useTheme();

  const isDirty = value !== originalValue;

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    originalRef.current = originalValue;
  }, [originalValue]);

  const handleSave = async (options?: { auto?: boolean; content?: string }) => {
    const auto = options?.auto ?? false;
    const nextValue = options?.content ?? valueRef.current;

    const showLocalToast = !onSave;

    try {
      if (onSave) {
        await onSave(nextValue, { auto, path });
      } else if (path) {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('file_write', { path, content: nextValue });
      }

      setValue(nextValue);
      setOriginalValue(nextValue);

      if (!auto) {
        setSaved(true);
        if (showLocalToast) {
          toast.success(path ? `Saved ${path}` : 'Code saved');
        }
        setTimeout(() => setSaved(false), 2000);
      } else {
        setSaved(false);
      }
    } catch (error) {
      console.error('Failed to save file:', error);
      if (!auto && showLocalToast) {
        toast.error(`Failed to save${path ? ` ${path}` : ''}`);
      }
      throw error;
    }
  };

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    editor.updateOptions({
      fontSize: 14,
      fontFamily: "'Fira Code', 'Cascadia Code', 'Consolas', monospace",
      fontLigatures: true,
      minimap: { enabled: true },
      scrollBeyondLastLine: false,
      wordWrap: 'on',
      automaticLayout: true,
      tabSize: 2,
      insertSpaces: true,
      formatOnPaste: true,
      formatOnType: true,
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      handleSave({ auto: false }).catch(() => {
        /* handled in save */
      });
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyZ, () => {
      editor.trigger('keyboard', 'undo', {});
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyZ, () => {
      editor.trigger('keyboard', 'redo', {});
    });

    editor.onDidBlurEditorText(async () => {
      if (readOnly) {
        return;
      }
      const currentContent = editor.getValue();
      if (currentContent !== originalRef.current) {
        try {
          await handleSave({ auto: true, content: currentContent });
        } catch (error) {
          console.error('Auto-save failed', error);
        }
      }
    });
  };

  const handleChange = (newValue: string | undefined) => {
    setValue(newValue ?? '');
    onChange?.(newValue);
    setSaved(false);
  };

  const handleRevert = () => {
    setValue(originalValue);
    editorRef.current?.setValue(originalValue);
    toast.info('Changes reverted');
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success('Copied to clipboard');
    } catch (error) {
      console.error('Failed to copy:', error);
      toast.error('Failed to copy to clipboard');
    }
  };

  const handleDownload = () => {
    const blob = new Blob([value], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = path?.split('/').pop() || 'code.txt';
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success('Downloaded');
  };

  const handleFormat = () => {
    editorRef.current?.getAction('editor.action.formatDocument')?.run();
  };

  const monacoTheme = theme === 'dark' ? 'vs-dark' : 'light';

  return (
    <div className={cn('flex h-full flex-col border border-border rounded-lg bg-background', className)}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/20">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">Code Editor</span>
          {path && (
            <span className="text-sm font-mono text-muted-foreground truncate max-w-md" title={path}>
              {path}
            </span>
          )}
          {isDirty && <span className="text-xs text-amber-500 font-medium">* Modified</span>}
        </div>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={handleFormat} disabled={readOnly} title="Format code (Shift+Alt+F)">
            Format
          </Button>

          <Button variant="ghost" size="sm" onClick={handleCopy} title="Copy to clipboard">
            <Copy className="h-4 w-4" />
          </Button>

          <Button variant="ghost" size="sm" onClick={handleDownload} title="Download file">
            <Download className="h-4 w-4" />
          </Button>

          {isDirty && !readOnly && (
            <>
              <Button variant="ghost" size="sm" onClick={handleRevert} title="Revert changes">
                <RotateCcw className="h-4 w-4" />
              </Button>

              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  handleSave({ auto: false }).catch(() => {
                    /* toast handled upstream */
                  });
                }}
                disabled={saved}
                title="Save (Ctrl+S)"
              >
                {saved ? (
                  <>
                    <Check className="h-4 w-4 mr-1" />
                    Saved
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-1" />
                    Save
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 relative">
        <Editor
          height="100%"
          language={language}
          value={value}
          theme={monacoTheme}
          onChange={handleChange}
          onMount={handleEditorDidMount}
          options={{
            readOnly,
            contextmenu: true,
            quickSuggestions: true,
            suggestOnTriggerCharacters: true,
            acceptSuggestionOnEnter: 'on',
            tabCompletion: 'on',
            wordBasedSuggestions: 'matchingDocuments',
            parameterHints: { enabled: true },
            autoClosingBrackets: 'always',
            autoClosingQuotes: 'always',
            autoSurround: 'languageDefined',
            folding: true,
            foldingStrategy: 'indentation',
            showFoldingControls: 'mouseover',
            matchBrackets: 'always',
            renderWhitespace: 'selection',
            renderLineHighlight: 'all',
            scrollbar: {
              useShadows: false,
              verticalScrollbarSize: 10,
              horizontalScrollbarSize: 10,
            },
          }}
        />
      </div>

      <div className="flex items-center justify-between px-3 py-1 text-xs text-muted-foreground bg-muted/10 border-t border-border">
        <div className="flex items-center gap-3">
          <span>Language: {language}</span>
          <span>Lines: {value.split('\n').length}</span>
          <span>Characters: {value.length}</span>
        </div>
        <div className="flex items-center gap-3">
          {readOnly && <span className="text-amber-500">Read-only</span>}
          <span>UTF-8</span>
        </div>
      </div>
    </div>
  );
}
