# Memory System Usage Guide

This guide explains how to use the long-term memory UI components in AGI Workforce.

## Overview

The memory system allows AGI Workforce to remember important details across sessions:

- **Preferences**: User coding styles, preferences, and conventions
- **Facts**: Important information about the user or project
- **Decisions**: Architectural decisions and their rationale
- **Context**: General contextual information for better understanding

## Components

### MemoryManager

Full-featured memory management interface with search, filtering, and sorting.

```tsx
import { MemoryManager } from '@/components/Memory';

export function MyComponent() {
  return (
    <MemoryManager
      projectId="project-123" // Optional: filter by project
      showCreateButton={true} // Show add memory button
      showImportExport={false} // Show import/export buttons
      maxHeight="calc(100vh - 250px)" // Scroll area height
    />
  );
}
```

**Features:**

- Browse all memories with pagination
- Search memories by topic, content, category
- Filter by memory type (preference, fact, decision, context)
- Sort by importance, date, or topic
- Edit memory importance inline
- Delete memories with confirmation
- Export memories as JSON

### MemoryViewer

Similar to MemoryManager but designed for read-only viewing.

```tsx
import { MemoryViewer } from '@/components/Memory';

export function ViewMemoriesComponent() {
  return <MemoryViewer initialTab="decision" initialSort="importance-desc" maxHeight="400px" />;
}
```

### CreateMemoryDialog

Dialog for creating new memories with category selection and importance slider.

```tsx
import { CreateMemoryDialog } from '@/components/Memory';

export function MyComponent() {
  return (
    <CreateMemoryDialog
      trigger={<button>Add Memory</button>}
      onCreated={(id) => console.log('Memory created:', id)}
    />
  );
}
```

### MemorySidebar

Compact sidebar widget showing important memories during chat.

```tsx
import { MemorySidebar } from '@/components/Memory';

export function ChatInterface() {
  return (
    <div className="flex gap-4">
      <div className="flex-1">{/* Chat area */}</div>
      <MemorySidebar
        maxMemories={5} // Show top 5 important memories
        importanceThreshold={6} // Only show importance >= 6
        onMemoryClick={(memory) => {
          // Handle memory click
        }}
      />
    </div>
  );
}
```

### MemoryBrowserModal

Full-screen modal for comprehensive memory management.

```tsx
import { MemoryBrowserModal, useMemoryBrowserModal } from '@/components/Memory';

export function MyComponent() {
  const { open, setOpen, openMemoryBrowser } = useMemoryBrowserModal();

  return (
    <>
      <button onClick={openMemoryBrowser}>Open Memory Browser</button>
      <MemoryBrowserModal open={open} onOpenChange={setOpen} projectId="project-123" />
    </>
  );
}
```

### MemoryImportanceIndicator

Visual indicator showing memory importance, decay timeline, and access history.

```tsx
import { MemoryImportanceIndicator } from '@/components/Memory';

export function MyComponent() {
  return (
    <MemoryImportanceIndicator
      importance={8}
      createdAt={new Date().toISOString()}
      lastAccessedAt={new Date().toISOString()}
      size="md" // 'sm', 'md', or 'lg'
      showDecayWarning={true} // Show if memory is decaying
      showTrend={true} // Show trending icon
      compact={false} // Inline compact version
    />
  );
}
```

### MemorySearch

Search input with debounce and local/API filtering.

```tsx
import { MemorySearch } from '@/components/Memory';

export function MyComponent() {
  return (
    <MemorySearch
      onSearch={(query) => console.log('Search query:', query)}
      onResults={(results) => console.log('Results:', results)}
      placeholder="Search memories..."
      debounceMs={300}
      useApiSearch={false} // Use local filtering
    />
  );
}
```

## Hooks

### useMemoryIntegration

Complete integration hook for memory functionality in components.

```tsx
import { useMemoryIntegration } from '@/hooks/useMemoryIntegration';

export function MyComponent() {
  const {
    memories,
    isLoading,
    isInitialized,
    saveChatMemory,
    saveArchitecturalDecision,
    saveCodingPreference,
    saveContextFact,
    deleteMemory,
    getRelevantMemories,
    getContextMemories,
    formatMemoriesForPrompt,
  } = useMemoryIntegration({
    autoLoad: true,           // Load memories on mount
    projectId: 'project-123', // Filter by project
    importanceThreshold: 6,   // Min importance for recall
  });

  // Save architectural decision
  async function handleArchitecturalDecision() {
    await saveArchitecturalDecision(
      'Use TypeScript strict mode',
      'Enforce TypeScript strict mode across the project',
      'Catches type errors early and improves code quality'
    );
  }

  // Save coding preference
  async function handleCodingPreference() {
    await saveCodingPreference(
      'Functional components with hooks',
      'Always use functional components and React hooks. Avoid class components.'
    );
  }

  // Get relevant memories for a topic
  async function searchMemories() {
    const results = await getRelevantMemories('database schema');
    console.log('Found memories:', results);
  }

  // Get all important memories for context
  async function injectMemoriesIntoPrompt() {
    const contextMemories = await getContextMemories();
    const formatted = formatMemoriesForPrompt(contextMemories);
    // Use formatted string in LLM prompt
  }

  return (
    // Component JSX
  );
}
```

### useMemorySearch

Hook for managing memory search state.

```tsx
import { useMemorySearch } from '@/components/Memory';

export function SearchComponent() {
  const { query, results, isSearching, handleSearch, clearSearch } = useMemorySearch();

  return (
    // Component JSX
  );
}
```

### useMemoryBrowserModal

Hook for managing memory browser modal state.

```tsx
import { useMemoryBrowserModal } from '@/components/Memory';

export function MyComponent() {
  const { open, setOpen, openMemoryBrowser, closeMemoryBrowser } = useMemoryBrowserModal();

  return (
    // Component JSX
  );
}
```

## Integration Examples

### Example 1: Save Decision from Chat

```tsx
async function saveDecisionFromChat(topic: string, decision: string, reasoning: string) {
  await useMemoryIntegration({}).saveArchitecturalDecision(topic, decision, reasoning);
}
```

### Example 2: Display Memories in Sidebar

```tsx
export function ChatSidebar() {
  return (
    <MemorySidebar
      maxMemories={5}
      importanceThreshold={6}
      onMemoryClick={(memory) => {
        // User clicked on a memory
        // Could open details, inject into chat, etc.
        console.log('Clicked:', memory.topic);
      }}
    />
  );
}
```

### Example 3: Memory Tab in Settings

The ProjectSettingsDialog now includes a Memory tab that shows:

- All project memories with MemoryManager
- Toggle for auto-saving architectural decisions
- Import/export functionality
- Info about memory importance and decay

See `src/components/UnifiedAgenticChat/ProjectSettingsDialog.tsx` for the implementation.

### Example 4: Inject Memories into LLM Prompt

```tsx
async function generateResponse(userQuery: string): Promise<string> {
  const { getContextMemories, formatMemoriesForPrompt } = useMemoryIntegration();

  // Get all important memories
  const memories = await getContextMemories();
  const memoryContext = formatMemoriesForPrompt(memories);

  // Build prompt with memory context
  const prompt = `
You are an AI assistant helping with a project.

${memoryContext}

User: ${userQuery}
  `;

  // Call LLM with enhanced prompt
  return callLLM(prompt);
}
```

## Memory Categories

### Preference

User or project preferences, coding standards, and style guides.

- **Importance**: Typically 6-8
- **Source**: User configuration, coding standards discussions
- **Example**: "Use functional components with React hooks"

### Fact

Factual information about the project, codebase, or user.

- **Importance**: Typically 5-8
- **Source**: Project documentation, user input
- **Example**: "Database uses PostgreSQL with Supabase"

### Decision

Architectural decisions and their rationale.

- **Importance**: Typically 7-10
- **Source**: Architecture discussions, design meetings
- **Example**: "Chose Next.js for server-side rendering capabilities"

### Context

General contextual information for better understanding.

- **Importance**: Typically 3-6
- **Source**: Conversation context, observations
- **Example**: "User prefers verbose error messages"

## Memory Decay

Memories decay over time if not accessed:

- Memories not accessed for 30+ days show decay warning
- Use `MemoryImportanceIndicator` to show decay status
- Access memories to refresh their importance
- Important memories (7-10) decay slower than others

## Best Practices

1. **Save important decisions** with high importance (8-10)

   ```tsx
   await saveChatMemory({
     category: 'decision',
     topic: 'Architecture Decision',
     content: 'Full decision details...',
     importance: 9, // High importance
   });
   ```

2. **Use appropriate categories** for memory organization
   - Preferences for coding style
   - Decisions for architecture choices
   - Facts for project information
   - Context for general details

3. **Keep topics concise** but descriptive
   - Good: "React Hooks Usage Pattern"
   - Bad: "This is about something important"

4. **Provide detailed content** in the memory
   - Include rationale and context
   - Link related decisions
   - Note any constraints or requirements

5. **Review and update memories** periodically
   - Remove outdated decisions
   - Update importance levels
   - Add new context as project evolves

## Keyboard Shortcuts

- `Ctrl+Shift+M` - Open Memory Browser (when implemented)
- `Escape` - Close search/dialogs
- `Enter` - Create new memory from search

## Troubleshooting

**Memories not loading?**

- Check browser console for errors
- Verify database connection
- Try refreshing memories

**Memory decay warnings?**

- Access memories to refresh them
- Review and update importance if needed
- Delete outdated memories

**Export not working?**

- Check browser storage permissions
- Ensure memories are not empty
- Try a smaller subset first

## API Reference

See `src/stores/memoryStore.ts` for the complete Zustand store API:

- `remember()` - Save a memory
- `recall()` - Retrieve specific memory
- `search()` - Search memories
- `forget()` - Delete memory
- `getByCategory()` - Filter by category
- `getImportant()` - Get important memories
- `getSessionContext()` - Get context for session
- `loadAll()` - Load all memories
