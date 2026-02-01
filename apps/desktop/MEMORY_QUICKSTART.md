# Memory Integration Quick Start

Get the memory system working in 5 minutes.

## TL;DR

The long-term memory system is fully implemented. To use it:

1. **Import the API**: `import * as memory from '@/api/memory'`
2. **Load on project open**: `await memory.loadProjectMemories()`
3. **Detect decisions**: `await memory.detectAndSaveDecision(userMessage)`
4. **Inject into LLM**: Include `systemPromptEnhancement` in system prompt
5. **Show dashboard**: `await memory.getMemoryDashboard()`

## 3-Step Integration

### Step 1: Hook Up Project Loading (30 seconds)

```typescript
import { useEffect } from 'react';
import * as memory from '@/api/memory';

export function MyProjectComponent({ projectPath }: { projectPath: string }) {
  useEffect(() => {
    if (!projectPath) return;

    const load = async () => {
      const result = await memory.loadProjectMemories();
      console.log(`✅ Loaded ${result.memories_loaded} memories`);
      // Use result.system_prompt_enhancement in your LLM calls
    };

    load();
  }, [projectPath]);

  return <div>Project: {projectPath}</div>;
}
```

### Step 2: Detect Decisions in Chat (30 seconds)

```typescript
import * as memory from '@/api/memory';

async function sendChatMessage(userMessage: string) {
  // Auto-detect decision
  const decision = await memory.detectAndSaveDecision(userMessage);

  if (decision) {
    console.log(`✅ Decision saved: ${decision.topic}`);
    showNotification(`Decision saved to memory`);
  }

  // Then send to LLM...
}
```

### Step 3: Use Memory in System Prompt (30 seconds)

```typescript
import * as memory from '@/api/memory';

async function buildSystemPrompt() {
  const result = await memory.loadProjectMemories();

  return `You are an AI assistant for development.

${result.system_prompt_enhancement}

Follow all stored preferences and decisions when helping the user.`;
}
```

Done! You now have:

- ✅ Auto-loaded project memories
- ✅ Auto-detected architectural decisions
- ✅ Memory-enhanced LLM prompts

## What Each Component Does

### `loadProjectMemories()`

**When**: Project folder is selected
**What it returns**: Memories formatted for LLM, stats, enhancement text
**Time**: <100ms

### `detectAndSaveDecision(message)`

**When**: After user sends a message
**What it does**: Checks if message contains decision, auto-saves if found
**Returns**: Decision details or null
**Time**: <5ms

### `getMemoryDashboard()`

**When**: User wants to see memory stats
**What it returns**: Total memories, distribution, compaction rate, trends
**Time**: <50ms

### `searchMemories(query)`

**When**: User searches for a specific memory
**What it returns**: Matching memories with importance scores
**Time**: <100ms

## Common Use Cases

### Use Case 1: Load Memories on Project Open

```typescript
const handleSelectProject = async (path: string) => {
  const result = await memory.loadProjectMemories();
  setSystemPrompt(buildSystemPrompt(result.system_prompt_enhancement));
};
```

### Use Case 2: Show Decision Saved Notification

```typescript
const decision = await memory.detectAndSaveDecision(msg);
if (decision) {
  toast.success(`Decision saved: ${decision.topic} (${decision.importance}/10)`);
}
```

### Use Case 3: Display Memory Dashboard

```typescript
const dashboard = await memory.getMemoryDashboard();
return (
  <div>
    <p>Total: {dashboard.stats.total_count}</p>
    <p>Avg Importance: {dashboard.stats.avg_importance.toFixed(1)}</p>
  </div>
);
```

### Use Case 4: Search for Related Memories

```typescript
const memories = await memory.searchMemories('database design', 5);
memories.forEach((m) => {
  console.log(`${m.topic}: ${m.content}`);
});
```

### Use Case 5: Log Milestone

```typescript
await memory.logMilestone('Completed implementation of auth system', {
  component: 'auth',
  status: 'done',
});
```

## Decision Detection Patterns

These messages will auto-save:

✅ "We decided to use TypeScript"
✅ "Architecture: Microservices with Rust"
✅ "Let's implement Redux for state"
✅ "I prefer functional programming"
✅ "Tech stack: React + Node.js"
❌ "What should we use?" (Question, not decision)
❌ "Can you help?" (General request)

## Importance Levels

```
🔴 Critical (9-10)  → Architectural decisions
🟡 High (7-8)       → Detected decisions, patterns
🟢 Medium (5-6)     → Preferences, facts
⚪ Low (1-4)        → Context, notes
```

## API Quick Reference

```typescript
// Load & Format
loadProjectMemories()                    // Load for project
prefetchSessionMemories()                // Load for session
searchMemories(query, limit?)            // Search by text

// Detect & Save
detectAndSaveDecision(message)           // Auto-detect
saveDecision(message)                    // Manual save

// Dashboard
getMemoryDashboard()                     // Stats
suggestMemoriesForReview()               // Important ones
getUsageTrends()                         // Trends

// Log
logMilestone(description, metadata?)     // Significant event
logAction(action, metadata?)             // Action taken

// Access
recallMemory(category, topic, boost?)   // Get specific
searchMemories(query, limit?)            // Search

// Configuration
configureMemoryInjection(enabled, max, minImportance)

// Core Memory API (existing)
remember(category, topic, content, importance, source)
recall(category, topic)
forget(memoryId)
```

## Type Definitions

```typescript
interface MemoryEntry {
  id: number;
  category: 'preference' | 'fact' | 'decision' | 'context';
  topic: string;
  content: string;
  importance: number;
  source?: string;
  created_at: string;
  updated_at: string;
}

interface LoadProjectMemoriesResponse {
  injection_result: {
    memories_loaded: number;
    context: string;
    has_relevant_memories: boolean;
  };
  system_prompt_enhancement: string;
  message: string;
}

interface SaveDecisionResponse {
  memory_id: number;
  topic: string;
  importance: number;
  message: string;
}
```

## Troubleshooting

### Memories not loading?

- Check project path is set
- Verify memories exist for this project
- Check console for errors

### Decisions not auto-saving?

- Check message contains decision keywords
- Try manual `saveDecision()` instead
- Message might not match patterns

### Dashboard not showing?

- Ensure memories exist (total_count > 0)
- Check if enabled in settings
- Refresh with `getMemoryDashboard()`

### Performance issues?

- Reduce `max_memories` in config
- Disable semantic search
- Archive old logs

## Example: Complete Chat Component

```typescript
import { useState } from 'react';
import * as memory from '@/api/memory';

export function ChatComponent({ projectPath }: { projectPath: string }) {
  const [messages, setMessages] = useState<any[]>([]);
  const [systemPrompt, setSystemPrompt] = useState('');

  // Load memories on mount
  useState(() => {
    const load = async () => {
      const result = await memory.loadProjectMemories();
      setSystemPrompt(buildSystemPrompt(result.system_prompt_enhancement));
    };
    load();
  }, [projectPath]);

  // Send message
  const handleSend = async (msg: string) => {
    // Check for decision
    const decision = await memory.detectAndSaveDecision(msg);
    if (decision) {
      console.log(`✅ ${decision.topic}`);
    }

    // Send to LLM with enhanced prompt
    const response = await callLLM(msg, systemPrompt);
    setMessages([...messages, { role: 'user', content: msg },
                              { role: 'assistant', content: response }]);
  };

  return (
    <div>
      {messages.map((m, i) => <p key={i}>{m.role}: {m.content}</p>)}
      <input onKeyPress={(e) => e.key === 'Enter' && handleSend(e.target.value)} />
    </div>
  );
}

function buildSystemPrompt(enhancement: string) {
  return `You are an AI assistant.

${enhancement}

Follow all stored architectural decisions and preferences.`;
}
```

## Next: Read Full Docs

- **Quick Overview**: This file (you are here) ✅
- **Full Integration Guide**: `MEMORY_INTEGRATION_GUIDE.md`
- **Complete Examples**: `MEMORY_INTEGRATION_EXAMPLES.md`
- **All Details**: `IMPLEMENTATION_NOTES.md`

## Key Files

| File                                                | Purpose               |
| --------------------------------------------------- | --------------------- |
| `src/api/memory.ts`                                 | TypeScript API client |
| `src-tauri/src/core/llm/memory_integration.rs`      | Rust backend          |
| `src-tauri/src/sys/commands/chat/memory_handler.rs` | Chat handler          |
| `MEMORY_INTEGRATION_GUIDE.md`                       | Full documentation    |
| `MEMORY_INTEGRATION_EXAMPLES.md`                    | Code examples         |

## 30-Second Test

```typescript
import * as memory from '@/api/memory';

// Test if it works
const result = await memory.loadProjectMemories();
console.log(`Loaded ${result.memories_loaded} memories`);
console.log(result.system_prompt_enhancement);
```

## Success Indicators

✅ Project opens → "Memories loaded: X items"
✅ Send decision → "Decision saved: topic"
✅ LLM call → Memory context included
✅ Dashboard → Shows stats correctly
✅ Search → Finds memories

## Getting Help

1. Check `MEMORY_INTEGRATION_GUIDE.md` for details
2. See `MEMORY_INTEGRATION_EXAMPLES.md` for complete examples
3. Review `IMPLEMENTATION_NOTES.md` for architecture
4. Search TypeScript types in `src/api/memory.ts`

---

**Ready to start?** Import `src/api/memory.ts` and call `loadProjectMemories()`!
