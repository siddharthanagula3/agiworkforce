# Memory System

AGI Workforce's long-term memory system enables the AI to remember important details across sessions. This directory contains all UI components and hooks for memory management.

## Directory Structure

```
Memory/
├── MemoryManager.tsx           # Full memory management interface
├── MemoryViewer.tsx            # Read-only memory browser
├── MemoryCard.tsx              # Individual memory display card
├── MemorySearch.tsx            # Search input with debounce
├── MemoryImportanceIndicator.tsx # Visual importance display
├── CreateMemoryDialog.tsx       # Dialog for creating memories
├── MemorySidebar.tsx           # Compact sidebar widget
├── MemoryBrowserModal.tsx      # Full-screen browser modal
├── index.ts                    # Component exports
├── README.md                   # This file
└── MEMORY_USAGE_GUIDE.md       # Detailed usage examples
└── __tests__/
    └── MemoryManager.test.ts   # Component tests
```

## Quick Start

### Display Memory Management UI

```tsx
import { MemoryManager } from '@/components/Memory';

export function SettingsPanel() {
  return (
    <MemoryManager projectId="current-project" showCreateButton={true} showImportExport={true} />
  );
}
```

### Show Memories in Chat Sidebar

```tsx
import { MemorySidebar } from '@/components/Memory';

export function ChatInterface() {
  return (
    <div className="flex gap-4">
      <ChatArea />
      <MemorySidebar maxMemories={5} importanceThreshold={6} />
    </div>
  );
}
```

### Open Memory Browser Modal

```tsx
import { MemoryBrowserModal, useMemoryBrowserModal } from '@/components/Memory';

export function AppHeader() {
  const { open, setOpen, openMemoryBrowser } = useMemoryBrowserModal();

  return (
    <>
      <button onClick={openMemoryBrowser}>Browse Memories</button>
      <MemoryBrowserModal open={open} onOpenChange={setOpen} />
    </>
  );
}
```

### Save Memory from Chat

```tsx
import { useMemoryIntegration } from '@/hooks/useMemoryIntegration';

export function ChatComponent() {
  const { saveArchitecturalDecision, saveCodingPreference } = useMemoryIntegration();

  async function handleDecision() {
    await saveArchitecturalDecision(
      'Use TypeScript for type safety',
      'Enabled strict mode',
      'Catches type errors at compile time',
    );
  }

  return <button onClick={handleDecision}>Save Decision</button>;
}
```

## Components

### MemoryManager

**Full-featured memory management interface**

Features:

- Browse all memories with tabs for each category
- Advanced search with debounce
- Sort by importance, date, or alphabetically
- Edit memory importance inline
- Delete with confirmation dialog
- Export memories as JSON

Props:

- `projectId?: string` - Filter memories by project
- `showCreateButton?: boolean` - Show add memory button (default: true)
- `showImportExport?: boolean` - Show export functionality (default: false)
- `maxHeight?: string` - Scroll area height (default: calc(100vh - 250px))
- `className?: string` - Additional CSS classes

### MemoryViewer

**Similar to MemoryManager but optimized for viewing**

Props:

- `initialTab?: TabValue` - Starting tab (default: 'all')
- `initialSort?: SortOption` - Starting sort (default: 'importance-desc')
- `maxHeight?: string` - Scroll area height
- `className?: string` - Additional CSS classes

### MemorySidebar

**Compact widget showing important memories during chat**

Features:

- Shows top important memories
- Configurable importance threshold
- Memory preview with truncated content
- Quick add memory button
- Expandable/collapsible

Props:

- `maxMemories?: number` - Max memories to show (default: 5)
- `importanceThreshold?: number` - Min importance filter (default: 6)
- `className?: string` - Additional CSS classes
- `onMemoryClick?: (memory) => void` - Click handler

### MemoryBrowserModal

**Full-screen modal for comprehensive memory management**

Props:

- `open: boolean` - Whether modal is open
- `onOpenChange: (open) => void` - Open state callback
- `projectId?: string` - Project filter

Hook:

```tsx
const { open, setOpen, openMemoryBrowser, closeMemoryBrowser } = useMemoryBrowserModal();
```

### CreateMemoryDialog

**Dialog for creating new memories**

Props:

- `trigger?: ReactNode` - Custom trigger element
- `onCreated?: (id) => void` - Creation callback
- `className?: string` - Additional CSS classes

Features:

- Category selection (preference, fact, decision, context)
- Topic and content input
- Importance slider (1-10)
- Optional source field

### MemoryCard

**Individual memory display with actions**

Props:

- `memory: MemoryEntry` - Memory to display
- `highlightText?: string` - Text to highlight in search
- `onImportanceChange?: (memory, newImportance) => void` - Importance update callback

Features:

- Category badge with color coding
- Content preview with expand/collapse
- Importance stars (interactive)
- Delete with confirmation
- Shows creation date and source

### MemoryImportanceIndicator

**Visual importance level and decay timeline**

Props:

- `importance: number` - Importance level (1-10)
- `createdAt: string` - Creation date ISO string
- `lastAccessedAt?: string` - Last access date
- `size?: 'sm' | 'md' | 'lg'` - Indicator size
- `showDecayWarning?: boolean` - Show decay alert (default: true)
- `decayThresholdDays?: number` - Days before decay (default: 30)
- `showTrend?: boolean` - Show trending arrow (default: false)
- `compact?: boolean` - Compact inline version (default: false)

Features:

- 10-star importance visualization
- Days since last access
- Decay warning for old memories
- Trending indicator (up/down)
- Color coded by importance level

### MemorySearch

**Search input with debounce and filtering**

Props:

- `onSearch?: (query) => void` - Query change callback (debounced)
- `onResults?: (results) => void` - Results callback
- `placeholder?: string` - Input placeholder
- `debounceMs?: number` - Debounce delay (default: 300)
- `useApiSearch?: boolean` - Use API or local filter (default: false)
- `className?: string` - Additional CSS classes

## Hooks

### useMemoryIntegration

**Primary integration hook for memory functionality**

```tsx
const {
  memories, // All loaded memories
  isLoading, // Loading state
  error, // Error message
  isInitialized, // Hydration state
  loadAll, // Load all memories
  saveChatMemory, // Save general memory
  saveArchitecturalDecision, // Save decision
  saveCodingPreference, // Save preference
  saveContextFact, // Save fact
  deleteMemory, // Delete memory
  getRelevantMemories, // Search memories
  getContextMemories, // Get important memories
  getByCategory, // Filter by category
  formatMemoriesForPrompt, // Format for LLM
} = useMemoryIntegration(options);
```

Options:

- `autoLoad?: boolean` - Load on mount (default: true)
- `projectId?: string` - Project filter
- `importanceThreshold?: number` - Min importance (default: 6)

### useMemorySearch

**Hook for search state management**

```tsx
const {
  query, // Current search query
  results, // Search results
  isSearching, // Search in progress
  handleSearch, // Update query
  handleResults, // Update results
  clearSearch, // Clear query and results
  hasResults, // Boolean check
  resultCount, // Number of results
} = useMemorySearch(initialQuery);
```

### useMemoryBrowserModal

**Hook for memory browser modal state**

```tsx
const {
  open, // Modal open state
  setOpen, // Set open state
  openMemoryBrowser, // Open modal
  closeMemoryBrowser, // Close modal
} = useMemoryBrowserModal();
```

## Styling

All components use consistent dark mode styling:

- Background: `bg-zinc-800` to `bg-zinc-900`
- Text: `text-white` to `text-zinc-300`
- Borders: `border-zinc-700`
- Primary: `bg-blue-600` with `hover:bg-blue-700`
- Destructive: `text-destructive` or `hover:text-red-400`

Category colors:

- Preference: `text-blue-300`
- Fact: `text-green-300`
- Decision: `text-purple-300`
- Context: `text-gray-300`

## Memory Categories

**Preference**: User or project preferences

- Examples: Coding style, naming conventions, tool preferences
- Typical importance: 6-8

**Fact**: Factual information about project/user

- Examples: Database choice, framework version, team size
- Typical importance: 5-8

**Decision**: Architectural and technical decisions

- Examples: Use microservices, implement caching, switch to TypeScript
- Typical importance: 7-10

**Context**: General contextual information

- Examples: Project status, ongoing challenges, user preferences
- Typical importance: 3-6

## Integration Points

### ProjectSettingsDialog

Memory tab shows:

- MemoryManager component
- Auto-save toggle for architectural decisions
- Memory search within project context

See: `src/components/UnifiedAgenticChat/ProjectSettingsDialog.tsx`

### Chat Interface

- MemorySidebar widget on right side
- MemoryLoadedIndicator in chat header
- Ability to add memories from messages

### LLM Prompts

- Format memories with `formatMemoriesForPrompt()`
- Inject into system/user prompts
- Use for context injection and RAG

## Best Practices

### 1. Create Structured Memories

```tsx
// Good
await saveArchitecturalDecision(
  'Database Schema Design',
  'Use normalized schema with proper indexes',
  'Improves query performance and data integrity',
);

// Avoid
await saveChatMemory({
  category: 'decision',
  topic: 'stuff',
  content: 'important thing',
});
```

### 2. Use Appropriate Categories

- Technical decisions → `decision`
- Code standards → `preference`
- Project facts → `fact`
- Context notes → `context`

### 3. Keep Topics Concise

- Topic should be a short title (2-5 words)
- Full details go in content field

### 4. Set Realistic Importance

- Critical decisions: 8-10
- Important standards: 6-8
- Reference info: 4-6
- Notes/context: 2-4

### 5. Review Regularly

- Delete outdated memories
- Update importance levels
- Archive old decisions
- Keep most recent decisions easily accessible

## Testing

Run memory component tests:

```bash
cd apps/desktop
pnpm test -- Memory.test.ts
```

Test coverage includes:

- Memory filtering by category
- Sorting by importance/date
- Search functionality
- Export formatting
- Category counts

## Accessibility

Components follow WCAG 2.1 AA standards:

- Keyboard navigation supported
- ARIA labels on interactive elements
- Color contrast ratios met
- Focus indicators visible
- Screen reader friendly

## Performance

Optimizations:

- Memoized components prevent re-renders
- Debounced search reduces API calls
- Virtual scrolling for large lists (MemoryViewer)
- Efficient memory filtering and sorting
- LocalStorage caching with Zustand persist

## Keyboard Shortcuts

- `Escape` - Close search/dialogs
- `Ctrl+/` - Focus search input
- `Enter` - Submit create memory form
- Arrow keys - Navigate lists in modal

## Troubleshooting

### Memories not showing

1. Check `useMemoryStore().memories` is populated
2. Verify `loadAll()` was called
3. Check browser console for errors
4. Inspect `isLoading` state

### Search not working

1. Verify `memories` array has data
2. Check `debounceMs` is reasonable (300-500ms)
3. Try API search: `useApiSearch={true}`
4. Check browser console for errors

### Memory decay warnings

1. Access/update important memories regularly
2. Review and adjust importance levels
3. Delete outdated memories
4. Adjust `decayThresholdDays` if needed

### Export failing

1. Verify memories array is not empty
2. Check browser storage permissions
3. Try smaller subset of memories
4. Check browser console for errors

## Future Enhancements

- [ ] Memory tagging system
- [ ] Memory relationships (links between memories)
- [ ] Automatic memory creation from AGI learnings
- [ ] Memory backup and sync
- [ ] Custom importance weighting
- [ ] Memory analytics dashboard
- [ ] Collaborative memory sharing
- [ ] Memory versioning/history

## File Size Reference

Typical memory entry sizes:

- Empty metadata: ~200 bytes
- Small memory (100 chars): ~400 bytes
- Medium memory (500 chars): ~1 KB
- Large memory (2000 chars): ~3 KB

Storage limits:

- Max entries: 100 (configurable)
- Max total size: 1 MB (configurable)
- Auto-prunes oldest entries when limits exceeded

See `src/stores/memoryStore.ts` for limits and configuration.
