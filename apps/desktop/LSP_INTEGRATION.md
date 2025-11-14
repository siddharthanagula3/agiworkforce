# LSP (Language Server Protocol) Integration

## Overview

The AGI Workforce desktop app now includes comprehensive LSP integration, providing IDE-quality code intelligence for the Monaco editor and code analysis features. This integration enables features like go-to-definition, find references, code completion, hover information, diagnostics, and more.

## Architecture

### Backend (Rust)

**Location:** `/home/user/agiworkforce-desktop-app/apps/desktop/src-tauri/src/commands/lsp.rs`

The LSP backend is implemented using a custom LSP client that communicates with language servers via JSON-RPC over stdio. Key components:

- **LSPClient**: Manages the LSP server process and handles JSON-RPC communication
- **LSPState**: Global state manager that tracks active LSP servers
- **Tauri Commands**: 17 commands exposed to the frontend for LSP operations

#### Supported Language Servers

| Language | Server | Command |
|----------|--------|---------|
| Rust | rust-analyzer | `rust-analyzer` |
| TypeScript/JavaScript | typescript-language-server | `typescript-language-server --stdio` |
| Python | pyright | `pyright-langserver --stdio` |
| Go | gopls | `gopls` |
| Java | jdtls | `jdtls` |
| C/C++ | clangd | `clangd` |
| JSON | vscode-json-language-server | `vscode-json-language-server --stdio` |
| HTML | vscode-html-language-server | `vscode-html-language-server --stdio` |
| CSS/SCSS/LESS | vscode-css-language-server | `vscode-css-language-server --stdio` |

#### LSP Features Implemented

1. **textDocument/completion** - Intelligent code completion
2. **textDocument/hover** - Hover information with documentation
3. **textDocument/definition** - Go to definition (F12)
4. **textDocument/references** - Find all references (Shift+F12)
5. **textDocument/rename** - Symbol renaming (F2)
6. **textDocument/formatting** - Document formatting
7. **textDocument/codeAction** - Quick fixes and refactorings
8. **textDocument/publishDiagnostics** - Real-time error/warning detection
9. **workspace/symbol** - Workspace-wide symbol search
10. **textDocument/didOpen** - Document open notification
11. **textDocument/didChange** - Document change notification
12. **textDocument/didClose** - Document close notification

#### Tauri Commands

```rust
// Server management
lsp_start_server(language: String, root_path: PathBuf) -> LSPServer
lsp_stop_server(language: String) -> ()
lsp_list_servers() -> Vec<String>
lsp_detect_language(file_path: String) -> String

// Document synchronization
lsp_did_open(language: String, uri: String, language_id: String, content: String) -> ()
lsp_did_change(language: String, uri: String, version: u32, content: String) -> ()
lsp_did_close(language: String, uri: String) -> ()

// Language features
lsp_completion(language: String, uri: String, line: u32, character: u32) -> Vec<CompletionItem>
lsp_hover(language: String, uri: String, line: u32, character: u32) -> Option<Hover>
lsp_definition(language: String, uri: String, line: u32, character: u32) -> Vec<Location>
lsp_references(language: String, uri: String, line: u32, character: u32) -> Vec<Location>
lsp_rename(language: String, uri: String, line: u32, character: u32, new_name: String) -> Option<WorkspaceEdit>
lsp_formatting(language: String, uri: String) -> Vec<TextEdit>
lsp_workspace_symbol(language: String, query: String) -> Vec<WorkspaceSymbol>
lsp_code_action(language: String, uri: String, range: Range, diagnostics: Vec<Diagnostic>) -> Vec<CodeAction>

// Diagnostics
lsp_get_diagnostics(language: String, uri: String) -> Vec<Diagnostic>
lsp_get_all_diagnostics(language: String) -> HashMap<String, Vec<Diagnostic>>
```

### Frontend (React/TypeScript)

**Location:** `/home/user/agiworkforce-desktop-app/apps/desktop/src/`

The frontend integration consists of:

#### 1. useLSP Hook (`hooks/useLSP.ts`)

A comprehensive React hook that manages LSP server lifecycle and provides easy-to-use methods for all LSP features.

**Usage:**

```typescript
import { useLSP } from '../../hooks/useLSP';

function MyEditor() {
  const lsp = useLSP({
    language: 'rust',
    rootPath: '/path/to/project',
    autoStart: true,
  });

  // Start/stop server
  await lsp.startServer();
  await lsp.stopServer();

  // Document lifecycle
  await lsp.didOpen(uri, 'rust', content);
  await lsp.didChange(uri, content);
  await lsp.didClose(uri);

  // Get completions
  const completions = await lsp.getCompletions(uri, line, character);

  // Go to definition
  const definitions = await lsp.getDefinition(uri, line, character);

  // Find references
  const references = await lsp.getReferences(uri, line, character);

  // Rename symbol
  const edit = await lsp.rename(uri, line, character, 'newName');

  // Format document
  const edits = await lsp.format(uri);

  // Search symbols
  const symbols = await lsp.searchWorkspaceSymbols('query');

  // Get diagnostics
  const diagnostics = await lsp.getDiagnostics(uri);
}
```

#### 2. MonacoEditor Component (`components/Editor/MonacoEditor.tsx`)

A fully-featured Monaco editor component with integrated LSP support.

**Features:**
- Automatic language detection from file extension
- Real-time code completion with LSP
- Hover tooltips with documentation
- Go-to-definition (F12)
- Find references (Shift+F12)
- Symbol renaming (F2)
- Document formatting
- Real-time diagnostics (errors, warnings, hints)
- Syntax highlighting
- Minimap
- Customizable theme and options

**Usage:**

```tsx
import MonacoEditor from './components/Editor/MonacoEditor';

function App() {
  const [code, setCode] = useState('fn main() {\n    println!("Hello, world!");\n}');

  return (
    <MonacoEditor
      value={code}
      onChange={setCode}
      filePath="/path/to/file.rs"
      rootPath="/path/to/project"
      height="600px"
      theme="vs-dark"
      enableLSP={true}
    />
  );
}
```

## Installation

### Prerequisites

Install the required language servers for the languages you want to use:

```bash
# Rust
rustup component add rust-analyzer

# TypeScript/JavaScript
npm install -g typescript typescript-language-server

# Python
npm install -g pyright

# Go
go install golang.org/x/tools/gopls@latest

# C/C++
# Install clangd from LLVM/Clang distribution

# HTML/CSS/JSON
npm install -g vscode-langservers-extracted
```

### Setup

1. **Backend**: LSP commands are already registered in `main.rs`
2. **Frontend**: Import and use the `useLSP` hook or `MonacoEditor` component

## Usage Examples

### Example 1: Rust Project with LSP

```tsx
import { useState } from 'react';
import MonacoEditor from './components/Editor/MonacoEditor';

export function RustEditor() {
  const [code, setCode] = useState(`
fn fibonacci(n: u32) -> u32 {
    match n {
        0 => 0,
        1 => 1,
        _ => fibonacci(n - 1) + fibonacci(n - 2),
    }
}

fn main() {
    println!("Fib(10) = {}", fibonacci(10));
}
  `.trim());

  return (
    <MonacoEditor
      value={code}
      onChange={setCode}
      filePath="/workspace/src/main.rs"
      rootPath="/workspace"
      height="100vh"
      theme="vs-dark"
      enableLSP={true}
    />
  );
}
```

### Example 2: TypeScript Project

```tsx
import { useState } from 'react';
import MonacoEditor from './components/Editor/MonacoEditor';

export function TypeScriptEditor() {
  const [code, setCode] = useState(`
interface User {
  id: number;
  name: string;
  email: string;
}

function greetUser(user: User): string {
  return \`Hello, \${user.name}!\`;
}

const user: User = {
  id: 1,
  name: "Alice",
  email: "alice@example.com"
};

console.log(greetUser(user));
  `.trim());

  return (
    <MonacoEditor
      value={code}
      onChange={setCode}
      filePath="/project/src/index.ts"
      rootPath="/project"
      height="100vh"
      theme="vs-dark"
      enableLSP={true}
    />
  );
}
```

### Example 3: Python Project with Pyright

```tsx
import { useState } from 'react';
import MonacoEditor from './components/Editor/MonacoEditor';

export function PythonEditor() {
  const [code, setCode] = useState(`
from typing import List

def quicksort(arr: List[int]) -> List[int]:
    if len(arr) <= 1:
        return arr

    pivot = arr[len(arr) // 2]
    left = [x for x in arr if x < pivot]
    middle = [x for x in arr if x == pivot]
    right = [x for x in arr if x > pivot]

    return quicksort(left) + middle + quicksort(right)

if __name__ == "__main__":
    numbers = [3, 6, 8, 10, 1, 2, 1]
    print(f"Sorted: {quicksort(numbers)}")
  `.trim());

  return (
    <MonacoEditor
      value={code}
      onChange={setCode}
      filePath="/project/main.py"
      rootPath="/project"
      height="100vh"
      theme="vs-dark"
      enableLSP={true}
    />
  );
}
```

### Example 4: Manual LSP Control

```tsx
import { useEffect, useState } from 'react';
import { useLSP } from '../hooks/useLSP';

export function ManualLSPExample() {
  const [symbols, setSymbols] = useState([]);

  const lsp = useLSP({
    language: 'rust',
    rootPath: '/workspace',
    autoStart: true,
  });

  const searchSymbols = async (query: string) => {
    const results = await lsp.searchWorkspaceSymbols(query);
    setSymbols(results);
  };

  useEffect(() => {
    if (lsp.server) {
      console.log('LSP server started:', lsp.server);
    }
  }, [lsp.server]);

  return (
    <div>
      <h2>Workspace Symbol Search</h2>
      <input
        type="text"
        placeholder="Search symbols..."
        onChange={(e) => searchSymbols(e.target.value)}
      />
      <ul>
        {symbols.map((symbol, i) => (
          <li key={i}>
            {symbol.name} ({symbol.kind}) - {symbol.location.uri}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

## Features in Detail

### 1. Code Completion

- Triggered automatically while typing
- Context-aware suggestions
- Includes documentation and type information
- Supports snippets

### 2. Hover Information

- Shows type information
- Displays documentation
- Works on hover over symbols

### 3. Go to Definition (F12)

- Jump to symbol definition
- Works across files
- Supports multiple definitions

### 4. Find References (Shift+F12)

- Find all references to a symbol
- Search across entire workspace
- Grouped by file

### 5. Symbol Renaming (F2)

- Rename symbols across the workspace
- Preserves code structure
- Supports undo/redo

### 6. Document Formatting

- Format entire document
- Language-specific formatting rules
- Preserves cursor position

### 7. Diagnostics

- Real-time error detection
- Warning and hint messages
- Inline error markers
- Problems panel integration

### 8. Code Actions

- Quick fixes for common issues
- Refactoring suggestions
- Import management
- Code generation

### 9. Workspace Symbols

- Search for symbols across the workspace
- Filter by name
- Jump to symbol location

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| F12 | Go to Definition |
| Shift+F12 | Find All References |
| F2 | Rename Symbol |
| Ctrl+Space | Trigger Completion |
| Ctrl+K Ctrl+F | Format Document |
| Alt+Enter | Show Code Actions |

## Configuration

### Customizing Monaco Editor

```tsx
<MonacoEditor
  value={code}
  onChange={setCode}
  filePath="/path/to/file.rs"
  rootPath="/path/to/project"
  options={{
    fontSize: 16,
    minimap: { enabled: false },
    lineNumbers: 'on',
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    formatOnPaste: true,
    formatOnType: true,
  }}
/>
```

### Disabling LSP for Specific Files

```tsx
<MonacoEditor
  value={code}
  onChange={setCode}
  language="plaintext"
  enableLSP={false}  // Disable LSP
/>
```

## Performance Considerations

1. **Server Lifecycle**: LSP servers are started automatically and cached per language
2. **Document Sync**: Changes are debounced to avoid excessive communication
3. **Diagnostics**: Updated every 1 second to balance responsiveness and performance
4. **Completion**: Triggered on specific characters to reduce overhead

## Troubleshooting

### Language Server Not Starting

1. Ensure the language server is installed and in PATH
2. Check console for error messages
3. Verify the language is supported (see table above)

### No Completions Appearing

1. Verify LSP server is running: `await lsp.listServers()`
2. Check that `enableLSP={true}` is set
3. Ensure the file has a valid language/extension

### Diagnostics Not Updating

1. Check that `didChange` is being called on content changes
2. Verify the language server supports diagnostics
3. Check console for LSP communication errors

## Future Enhancements

- [ ] Inlay hints for type annotations
- [ ] Semantic token highlighting
- [ ] Call hierarchy visualization
- [ ] Type hierarchy visualization
- [ ] Document symbols outline
- [ ] Breadcrumb navigation
- [ ] Multi-root workspace support
- [ ] LSP middleware for custom protocol extensions
- [ ] Language server configuration UI
- [ ] LSP server health monitoring
- [ ] Automatic server restart on crash
- [ ] Custom diagnostic severity configuration

## Related Files

- Backend LSP client: `apps/desktop/src-tauri/src/commands/lsp.rs`
- Frontend hook: `apps/desktop/src/hooks/useLSP.ts`
- Monaco component: `apps/desktop/src/components/Editor/MonacoEditor.tsx`
- Command registration: `apps/desktop/src-tauri/src/main.rs`
- This documentation: `apps/desktop/LSP_INTEGRATION.md`

## References

- [LSP Specification](https://microsoft.github.io/language-server-protocol/)
- [Monaco Editor API](https://microsoft.github.io/monaco-editor/api/index.html)
- [rust-analyzer](https://rust-analyzer.github.io/)
- [TypeScript Language Server](https://github.com/typescript-language-server/typescript-language-server)
- [Pyright](https://github.com/microsoft/pyright)
