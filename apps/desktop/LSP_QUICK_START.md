# LSP Quick Start Guide

## Installation (5 minutes)

### 1. Install Language Servers

Choose the languages you need:

**Rust:**
```bash
rustup component add rust-analyzer
```

**TypeScript/JavaScript:**
```bash
npm install -g typescript typescript-language-server
```

**Python:**
```bash
npm install -g pyright
```

**Go:**
```bash
go install golang.org/x/tools/gopls@latest
```

**HTML/CSS/JSON:**
```bash
npm install -g vscode-langservers-extracted
```

**C/C++:**
- Install LLVM/Clang (includes clangd)

### 2. Verify Installation

```bash
# Check if language servers are in PATH
which rust-analyzer        # Should show path
which typescript-language-server  # Should show path
which pyright-langserver   # Should show path
```

---

## Usage (3 examples)

### Example 1: Simple Monaco Editor with LSP

```tsx
import React, { useState } from 'react';
import MonacoEditor from './components/Editor/MonacoEditor';

export function SimpleEditor() {
  const [code, setCode] = useState('fn main() {\n    println!("Hello!");\n}');

  return (
    <MonacoEditor
      value={code}
      onChange={setCode}
      filePath="/workspace/src/main.rs"
      rootPath="/workspace"
      height="600px"
      enableLSP={true}
    />
  );
}
```

### Example 2: Custom LSP Hook Usage

```tsx
import React, { useEffect } from 'react';
import { useLSP } from '../hooks/useLSP';

export function LSPStatus() {
  const lsp = useLSP({
    language: 'rust',
    rootPath: '/workspace',
    autoStart: true,
  });

  useEffect(() => {
    if (lsp.server) {
      console.log('LSP server ready:', lsp.server);
    }
  }, [lsp.server]);

  if (lsp.isStarting) return <div>Starting LSP...</div>;
  if (lsp.error) return <div>Error: {lsp.error}</div>;
  if (!lsp.server) return <div>No server</div>;

  return <div>✅ LSP Ready: {lsp.server.language}</div>;
}
```

### Example 3: Workspace Symbol Search

```tsx
import React, { useState } from 'react';
import { useLSP } from '../hooks/useLSP';

export function SymbolSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const lsp = useLSP({ language: 'rust', rootPath: '/workspace' });

  const search = async (searchQuery: string) => {
    const symbols = await lsp.searchWorkspaceSymbols(searchQuery);
    setResults(symbols);
  };

  return (
    <div>
      <input
        placeholder="Search symbols..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          search(e.target.value);
        }}
      />
      <ul>
        {results.map((symbol, i) => (
          <li key={i}>
            {symbol.name} - {symbol.location.uri}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| **F12** | Go to Definition |
| **Shift + F12** | Find All References |
| **F2** | Rename Symbol |
| **Ctrl + Space** | Trigger Completion |
| **Ctrl + K, Ctrl + F** | Format Document |

---

## API Reference

### useLSP Hook

```typescript
const {
  server,                    // LSPServer | null
  isStarting,               // boolean
  error,                    // string | null
  diagnostics,              // Record<string, LSPDiagnostic[]>
  startServer,              // () => Promise<void>
  stopServer,               // () => Promise<void>
  didOpen,                  // (uri, languageId, content) => Promise<void>
  didChange,                // (uri, content) => Promise<void>
  didClose,                 // (uri) => Promise<void>
  getCompletions,           // (uri, line, char) => Promise<CompletionItem[]>
  getHover,                 // (uri, line, char) => Promise<Hover | null>
  getDefinition,            // (uri, line, char) => Promise<Location[]>
  getReferences,            // (uri, line, char) => Promise<Location[]>
  rename,                   // (uri, line, char, name) => Promise<WorkspaceEdit | null>
  format,                   // (uri) => Promise<TextEdit[]>
  searchWorkspaceSymbols,   // (query) => Promise<WorkspaceSymbol[]>
  getCodeActions,           // (uri, range, diags) => Promise<CodeAction[]>
  getDiagnostics,           // (uri) => Promise<Diagnostic[]>
  getAllDiagnostics,        // () => Promise<Record<string, Diagnostic[]>>
} = useLSP({ language, rootPath, autoStart });
```

### MonacoEditor Props

```typescript
interface MonacoEditorProps {
  value: string;
  onChange?: (value: string) => void;
  language?: string;           // Optional, auto-detected from filePath
  filePath?: string;           // File path for language detection
  rootPath?: string;           // Project root for LSP server
  height?: string | number;    // Default: '100%'
  theme?: 'vs-dark' | 'vs-light' | 'hc-black';  // Default: 'vs-dark'
  options?: monaco.editor.IStandaloneEditorConstructionOptions;
  enableLSP?: boolean;         // Default: true
}
```

---

## Troubleshooting

### LSP Server Not Starting

**Problem:** Server doesn't start, no completions

**Solutions:**
1. Check if language server is installed: `which rust-analyzer`
2. Check console for errors
3. Verify language is supported (see LSP_INTEGRATION.md)
4. Try manual start: `lsp.startServer()`

### Completions Not Appearing

**Problem:** No code completion suggestions

**Solutions:**
1. Ensure `enableLSP={true}` is set
2. Verify LSP server started: check `lsp.server`
3. Wait a few seconds after opening file (server initialization)
4. Check if file has correct extension (.rs, .ts, .py)

### Diagnostics Not Showing

**Problem:** Errors/warnings not appearing

**Solutions:**
1. Diagnostics update every 1 second, wait briefly
2. Check `lsp.getDiagnostics(uri)` manually
3. Verify language server supports diagnostics
4. Look for errors in browser console

### Go to Definition Not Working

**Problem:** F12 doesn't jump to definition

**Solutions:**
1. Ensure cursor is on a symbol
2. Wait for LSP server to index workspace
3. Check if language server supports definitions
4. Try manually: `lsp.getDefinition(uri, line, char)`

---

## Performance Tips

1. **One Server Per Language:** LSP servers are cached, so starting multiple editors for the same language reuses the same server

2. **Debounce didChange:** Changes are automatically sent to LSP, but you can reduce frequency if needed

3. **Disable LSP for Large Files:** For files >10,000 lines, consider disabling LSP:
   ```tsx
   <MonacoEditor enableLSP={false} ... />
   ```

4. **Close Unused Servers:** Stop servers when not needed:
   ```tsx
   useEffect(() => {
     return () => lsp.stopServer();
   }, []);
   ```

---

## Common Patterns

### Pattern 1: Multi-File Editor

```tsx
function MultiFileEditor({ files }: { files: File[] }) {
  const [activeFile, setActiveFile] = useState(files[0]);

  return (
    <>
      <FileSelector files={files} onSelect={setActiveFile} />
      <MonacoEditor
        key={activeFile.path}  // Important: new instance per file
        value={activeFile.content}
        onChange={(content) => updateFile(activeFile.path, content)}
        filePath={activeFile.path}
        rootPath="/workspace"
        enableLSP={true}
      />
    </>
  );
}
```

### Pattern 2: Read-Only Viewer

```tsx
<MonacoEditor
  value={code}
  filePath="/path/to/file.rs"
  rootPath="/workspace"
  options={{
    readOnly: true,
    minimap: { enabled: false },
  }}
  enableLSP={true}  // Still get syntax highlighting and navigation
/>
```

### Pattern 3: Dark/Light Theme Toggle

```tsx
function ThemedEditor() {
  const [theme, setTheme] = useState<'vs-dark' | 'vs-light'>('vs-dark');

  return (
    <>
      <button onClick={() => setTheme(theme === 'vs-dark' ? 'vs-light' : 'vs-dark')}>
        Toggle Theme
      </button>
      <MonacoEditor
        value={code}
        theme={theme}
        enableLSP={true}
      />
    </>
  );
}
```

---

## File Paths

### Backend (Rust):
- LSP Client: `apps/desktop/src-tauri/src/commands/lsp.rs`
- Main Registration: `apps/desktop/src-tauri/src/main.rs` (lines 818-835)

### Frontend (TypeScript):
- useLSP Hook: `apps/desktop/src/hooks/useLSP.ts`
- Monaco Component: `apps/desktop/src/components/Editor/MonacoEditor.tsx`

### Documentation:
- Full Guide: `apps/desktop/LSP_INTEGRATION.md`
- This Quick Start: `apps/desktop/LSP_QUICK_START.md`
- Implementation Report: `LSP_IMPLEMENTATION_REPORT.md`

---

## Next Steps

1. ✅ Install language servers (see Installation section)
2. ✅ Try Example 1 (Simple Editor)
3. ✅ Test keyboard shortcuts (F12, Shift+F12, F2)
4. ✅ Read full documentation: `LSP_INTEGRATION.md`
5. ✅ Customize for your use case

---

**Need Help?** Check the full documentation in `LSP_INTEGRATION.md` or the implementation report in `LSP_IMPLEMENTATION_REPORT.md`
