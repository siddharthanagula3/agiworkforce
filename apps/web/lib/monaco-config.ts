import type { Monaco } from '@monaco-editor/react';

export const defaultEditorOptions = {
  fontSize: 14,
  fontFamily: "'Fira Code', 'Cascadia Code', 'Consolas', monospace",
  fontLigatures: true,
  minimap: { enabled: true },
  scrollBeyondLastLine: false,
};

export function configureMonacoTypescript(monaco: Monaco): void {
  monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.ES2020,
    strict: true,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    allowSyntheticDefaultImports: true,
    esModuleInterop: true,
  });

  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  });

  monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.ES2020,
    allowNonTsExtensions: true,
    checkJs: true,
    allowJs: true,
  });

  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  });
}

export function getMonacoTheme(theme: 'dark' | 'light' | 'system'): string {
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'vs-dark' : 'light';
  }
  return theme === 'dark' ? 'vs-dark' : 'light';
}
