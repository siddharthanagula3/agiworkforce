import type { Monaco } from '@monaco-editor/react';

/**
 * Default Monaco Editor options for consistent styling across the app
 */
export const defaultEditorOptions = {
  fontSize: 14,
  fontFamily: "'Fira Code', 'Cascadia Code', 'Consolas', monospace",
  fontLigatures: true,
  minimap: { enabled: true },
  scrollBeyondLastLine: false,
};

/**
 * Configure Monaco TypeScript compiler options for better IntelliSense
 * Call this in beforeMount handler before the editor loads
 */
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

  // Also configure JavaScript defaults for consistency
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

/**
 * Convert app theme (including named themes) to a Monaco theme name.
 * Named themes use the DOM class to determine dark/light variant.
 */
export function getMonacoTheme(theme: string): string {
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'vs-dark' : 'light';
  }
  if (theme === 'dark') return 'vs-dark';
  if (theme === 'light') return 'light';
  // Named theme: read variant from the class applied to <html>
  const isDark = document.documentElement.classList.contains('dark');
  return isDark ? 'vs-dark' : 'light';
}
