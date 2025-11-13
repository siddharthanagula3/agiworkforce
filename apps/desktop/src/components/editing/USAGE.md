# Visual Editor - Usage Guide

This guide explains how to use the Visual Editor components for reviewing and applying code changes.

## Overview

The Visual Editor provides a Cursor Composer-style interface for reviewing code changes with:
- Side-by-side diff viewing
- Per-hunk accept/reject controls
- Live preview for supported file types
- Change statistics and summaries
- Conflict resolution
- Undo/redo support

## Quick Start

```tsx
import { VisualEditor } from '@/components/editing';

function MyApp() {
  return (
    <VisualEditor rootPath="/path/to/your/project" />
  );
}
```

## Working with the Editing Store

The editing store manages all pending changes and provides actions for manipulating them.

```tsx
import { useEditingStore } from '@/stores/editingStore';

function MyComponent() {
  const {
    addPendingChange,
    generateDiff,
    acceptChange,
    rejectChange,
    acceptHunk,
    rejectHunk,
    undo,
    redo,
  } = useEditingStore();

  // Generate and add a diff
  const handleGenerateDiff = async () => {
    const diff = await generateDiff(
      '/path/to/file.ts',
      originalContent,
      modifiedContent
    );
    addPendingChange(diff);
  };

  // Accept all changes in a file
  const handleAcceptFile = async () => {
    await acceptChange('/path/to/file.ts');
  };

  // Accept a specific hunk
  const handleAcceptHunk = () => {
    acceptHunk('/path/to/file.ts', 0); // Accept first hunk
  };

  // Undo last change
  const handleUndo = () => {
    if (canUndo()) {
      undo();
    }
  };
}
```

## Components

### VisualEditor

Main wrapper component that provides the complete editing interface.

```tsx
<VisualEditor
  rootPath="/path/to/project"
  className="h-screen"
/>
```

**Features:**
- File tree with change indicators
- Diff viewer with Monaco Editor
- Live preview for supported formats
- Change summary panel
- Conflict resolver
- Keyboard shortcuts (Cmd+S, Cmd+Z, Cmd+Shift+Z)

### EnhancedDiffViewer

Monaco-based diff viewer with granular control over changes.

```tsx
<EnhancedDiffViewer
  filePath="/path/to/file.ts"
  className="h-full"
/>
```

**Features:**
- Side-by-side and inline diff modes
- Per-hunk accept/reject buttons
- Expandable hunks with change details
- Syntax highlighting
- Line-by-line change indicators

### FileTreeWithChanges

File tree that shows change indicators next to modified files.

```tsx
<FileTreeWithChanges
  rootPath="/path/to/project"
  onFileSelect={(path) => console.log('Selected:', path)}
  selectedFile="/path/to/current/file.ts"
/>
```

**Change Indicators:**
- `M` (Modified) - Orange badge
- `+` (Added) - Green badge
- `-` (Deleted) - Red badge

### ChangeSummary

Statistics panel showing overview of pending changes.

```tsx
<ChangeSummary className="w-80" />
```

**Displays:**
- Total files changed
- Additions/deletions count
- Risk level (Low/Medium/High)
- AI-generated description
- Accept/Reject all buttons

### LivePreview

Preview panel for supported file types.

```tsx
<LivePreview
  filePath="/path/to/file.md"
  className="h-full"
/>
```

**Supported Formats:**
- Markdown (.md) - Rendered with GitHub-flavored markdown
- HTML (.html) - Rendered in sandboxed iframe
- JSON (.json) - Formatted and syntax highlighted
- React Components (.jsx, .tsx) - Component preview (placeholder)

### ConflictResolver

UI for resolving merge conflicts.

```tsx
<ConflictResolver
  filePath="/path/to/conflicted/file.ts"
  className="w-80"
/>
```

**Options:**
- Accept Ours - Keep our changes
- Accept Theirs - Keep their changes
- Accept Both - Merge both (ours first, then theirs)

## Keyboard Shortcuts

When using the VisualEditor, the following shortcuts are available:

- `Cmd+S` / `Ctrl+S` - Accept changes
- `Cmd+Z` / `Ctrl+Z` - Undo
- `Cmd+Shift+Z` / `Ctrl+Shift+Z` - Redo

## Tauri Backend Commands

The following Tauri commands are available for diff generation and file operations:

```typescript
import { invoke } from '@tauri-apps/api/core';

// Generate detailed diff with hunks
const diff = await invoke('get_file_diff', {
  filePath: '/path/to/file.ts',
  original: originalContent,
  modified: modifiedContent,
});

// Apply multiple file changes
const result = await invoke('apply_changes', {
  changes: [
    {
      path: '/path/to/file1.ts',
      original_content: '...',
      modified_content: '...',
    },
    {
      path: '/path/to/file2.ts',
      original_content: '...',
      modified_content: '...',
    },
  ],
});

// Revert changes
await invoke('revert_changes', {
  filePaths: ['/path/to/file1.ts', '/path/to/file2.ts'],
});
```

## Integration Example

Here's a complete example integrating the Visual Editor into your app:

```tsx
import { useState } from 'react';
import { VisualEditor } from '@/components/editing';
import { useEditingStore } from '@/stores/editingStore';
import { invoke } from '@tauri-apps/api/core';

function CodeReviewPanel() {
  const [rootPath, setRootPath] = useState('/path/to/project');
  const { addPendingChange, generateDiff } = useEditingStore();

  // Example: Generate edit from AI code generation
  const handleAICodeEdit = async () => {
    try {
      // Get AI-generated edit from backend
      const edit = await invoke('code_generate_edit', {
        filePath: `${rootPath}/src/components/Button.tsx`,
        selection: 'export function Button() { ... }',
        instruction: 'Add a loading state prop',
      });

      // Convert to our diff format
      const diff = await generateDiff(
        edit.file_path,
        edit.original_content,
        edit.modified_content
      );

      // Add to pending changes
      addPendingChange(diff);
    } catch (error) {
      console.error('Failed to generate edit:', error);
    }
  };

  return (
    <div className="h-screen flex flex-col">
      <div className="p-4 border-b">
        <button onClick={handleAICodeEdit}>
          Generate AI Edit
        </button>
      </div>
      <div className="flex-1">
        <VisualEditor rootPath={rootPath} />
      </div>
    </div>
  );
}
```

## TypeScript Types

```typescript
import type {
  FileDiff,
  DiffHunk,
  LineChange,
  DiffStats,
  FileChange,
  ConflictMarker,
} from '@/stores/editingStore';

// FileDiff represents a complete file diff
interface FileDiff {
  filePath: string;
  originalContent: string;
  modifiedContent: string;
  hunks: DiffHunk[];
  stats: DiffStats;
  language: string;
  status: 'pending' | 'accepted' | 'rejected' | 'partial';
}

// DiffHunk represents a section of changes
interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  changes: LineChange[];
  accepted?: boolean;
  rejected?: boolean;
}

// LineChange represents a single line change
interface LineChange {
  type: 'add' | 'delete' | 'context';
  oldLineNumber?: number;
  newLineNumber?: number;
  content: string;
}
```

## Best Practices

1. **Always generate diffs through the store** - Use `generateDiff()` instead of creating FileDiff objects manually
2. **Handle errors gracefully** - Wrap accept/reject operations in try-catch blocks
3. **Use the VisualEditor wrapper** - It provides the complete experience out of the box
4. **Leverage keyboard shortcuts** - They significantly improve the review workflow
5. **Review hunks individually** - For large changes, accept/reject hunks rather than entire files
6. **Check for conflicts** - Always resolve conflicts before accepting changes
7. **Use undo/redo** - Don't be afraid to experiment - you can always undo

## Troubleshooting

### Diff not showing

Ensure you've added the change to the store:

```tsx
const diff = await generateDiff(path, original, modified);
addPendingChange(diff);
```

### Changes not applying

Check the Tauri backend logs for errors. The file may be read-only or the path may be invalid.

### Preview not working

Verify the file type is supported. Currently supported:
- `.md`, `.markdown` - Markdown
- `.html` - HTML
- `.json` - JSON
- `.jsx`, `.tsx` - React components (placeholder)

### Keyboard shortcuts not working

Make sure the VisualEditor component is focused and has captured keyboard events.
