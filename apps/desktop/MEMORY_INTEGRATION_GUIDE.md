# Memory Integration System Guide

## Overview

The memory integration system automatically loads and saves contextual memories during chat interactions and AGI planning. This enables the system to:

1. **Auto-load memories** when a project is opened
2. **Auto-save architectural decisions** from chat
3. **Inject memories** into LLM system prompts
4. **Create memory dashboards** showing memory statistics
5. **Enable memory-aware planning** for AGI

## Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Chat Interface                            │
└────────────────┬────────────────────────────────────────────┘
                 │
    ┌────────────┴─────────────────────────────────────────┐
    │                                                        │
┌───▼──────────────────────┐                   ┌───────────▼──────────┐
│  Chat Memory Handler     │                   │  Memory Injector     │
│  (Detection & Saving)    │                   │  (Context Injection) │
└───┬──────────────────────┘                   └───────────┬──────────┘
    │                                                       │
    │  ┌──────────────────────────────────────────────────┘
    │  │
    └──┴─► Memory Manager (SQLite Backend)
         ├─ Long-term memory (user_memory table)
         ├─ Daily logs (daily_logs table)
         ├─ Decay system (importance tracking)
         └─ Semantic search (TF-IDF index)
```

### Module Files

```
src-tauri/src/
├── core/
│   ├── llm/
│   │   └── memory_integration.rs        # Memory injection into LLM context
│   └── agi/
│       └── planner_memory_integration.rs # Memory-aware planning
└── sys/commands/
    ├── chat/
    │   └── memory_handler.rs            # Chat-specific memory operations
    ├── chat_memory_integration.rs       # Tauri commands for integration
    └── memory.rs                        # Enhanced with dashboard commands
```

## Features

### 1. Auto-Load Project Memories

When a project folder is opened, memories are automatically loaded and prepared for context injection.

**Tauri Command:**

```rust
chat_load_project_memories() -> LoadProjectMemoriesResponse
```

**Response:**

```json
{
  "injection_result": {
    "memories_loaded": 5,
    "context": "## Relevant Project Memories\n...",
    "has_relevant_memories": true,
    "summary": {
      "decisions": 2,
      "preferences": 1,
      "facts": 2,
      "context_entries": 0,
      "total_importance_weight": 18
    }
  },
  "system_prompt_enhancement": "Remember the following architectural decisions...",
  "message": "Loaded 5 memories for project context"
}
```

### 2. Auto-Save Architectural Decisions

Detects decision statements in chat and automatically saves them to memory with high importance.

**Tauri Command:**

```rust
chat_detect_and_save_decision(message: String) -> Option<SaveDecisionResponse>
```

**Detection Patterns:**

- "We decided to..." → Importance: 8
- "Architecture:" or "Design:" → Importance: 9
- "Use X for Y" → Importance: 8
- "Prefer X over Y" → Importance: 7

**Response (if decision detected):**

```json
{
  "memory_id": 123,
  "topic": "backend_architecture",
  "importance": 9,
  "message": "Decision saved: Architecture: Microservices with Rust backend"
}
```

### 3. Memory Context Injection

Memories are automatically formatted and injected into LLM system prompts.

**Process:**

1. Load high-importance memories (importance >= 5)
2. Search for project-specific memories
3. Format by category (Decision, Preference, Fact, Context)
4. Inject into system prompt before LLM call

**Example System Prompt Enhancement:**

```
## Relevant Project Memories

### Decision

- **backend_lang** 🔴 Critical: Use Rust for type safety
- **database_choice** 🟡 High: PostgreSQL for ACID compliance

### Preference

- **code_style** 🟢 Medium: Prefer functional paradigms

### Fact

- **team_size** 🟢 Medium: Team of 3 backend engineers
```

### 4. Memory Dashboard

Shows comprehensive memory statistics and insights.

**Tauri Command:**

```rust
chat_get_memory_dashboard() -> serde_json::Value
```

**Response:**

```json
{
  "stats": {
    "total_count": 42,
    "avg_importance": 6.8,
    "high_importance_count": 15,
    "low_importance_count": 8
  },
  "compaction": {
    "total_logs": 250,
    "compacted_logs": 120,
    "uncompacted_logs": 130,
    "unique_dates": 30,
    "compaction_rate": 48.0
  },
  "trending_count": 8,
  "timestamp": "2025-01-20T10:30:00Z"
}
```

### 5. Memory-Aware Planning

The AGI planner uses memories to make consistent decisions aligned with previous choices.

**Features:**

- Finds previous solutions for similar problems
- References architectural decisions
- Applies stored coding style preferences
- Maintains pattern consistency

**Planner Memory Integration:**

```rust
PlannerMemoryIntegration::analyze_goal_memories(goal: &str)
    -> MemoryPlanContext
```

## Usage

### Frontend (React)

```typescript
import { invoke } from '@tauri-apps/api/core';

// Load project memories
const result = await invoke('chat_load_project_memories');
console.log(`Loaded ${result.memories_loaded} memories`);

// Detect and save decision
const decision = await invoke('chat_detect_and_save_decision', {
  message: 'We decided to use TypeScript for type safety',
});
if (decision) {
  console.log(`Decision saved: ${decision.topic}`);
}

// Get memory dashboard
const dashboard = await invoke('chat_get_memory_dashboard');
console.log(`Memory stats:`, dashboard.stats);

// Search memories
const memories = await invoke('chat_search_memories', {
  query: 'database',
  limit: 10,
});
```

### Automatic Integration

The memory system is automatically integrated into chat workflows:

1. **Project Open** → Auto-load project memories
2. **User Message** → Detect decision statements
3. **LLM Call** → Inject relevant memories into prompt
4. **Execution** → Save successful solutions
5. **Session End** → Decay unused memories

## Configuration

### Memory Injection Configuration

```rust
#[tauri::command]
pub async fn chat_configure_memory_injection(
    enabled: bool,              // Enable/disable memory injection
    max_memories: usize,        // Max memories to include (default: 10)
    min_importance: i32,        // Min importance threshold (default: 5)
)
```

### Example Configuration

```typescript
// Enable memory injection with high threshold
await invoke('chat_configure_memory_injection', {
  enabled: true,
  maxMemories: 15,
  minImportance: 7,
});
```

## Memory Importance Levels

| Level | Meaning  | Examples                               |
| ----- | -------- | -------------------------------------- |
| 9-10  | Critical | Architectural decisions, critical bugs |
| 7-8   | High     | Detected decisions, important patterns |
| 5-6   | Medium   | Facts, preferences, solutions          |
| 1-4   | Low      | Context, notes (subject to decay)      |

## Decision Detection Patterns

The system automatically detects decisions using regex patterns:

```rust
// Decision keywords
"decided|decided to|we'll|let's|use|implement|adopt|switch to|migrate to|prefer|choose"

// Architectural keywords
"architecture|tech stack|technology stack|style guide|coding standard|convention|pattern"
```

## Memory Lifecycle

```
1. CREATION
   ├─ Auto-detected from chat → Importance 7-9
   ├─ Manually saved → Importance user-defined
   └─ Extracted from logs → Importance algorithm-based

2. ACTIVE USE
   ├─ Accessed in chat → Boost importance +1 (max 10)
   ├─ Referenced in planning → Boost importance +1
   └─ Used in execution → Considered important

3. DECAY (if not used)
   ├─ Check: days_since_last_access >= decay_period
   ├─ Apply: importance *= (1 - decay_rate)
   └─ Stop: importance >= min_importance threshold

4. ARCHIVAL
   ├─ Compacted: Old daily logs → Extracted memories
   ├─ Pruned: Low-importance memories with decay
   └─ Exported: Backup/restore functionality
```

## API Reference

### Chat Memory Integration Commands

#### `chat_load_project_memories()`

Load memories for current project and prepare context injection.

**Returns:** `LoadProjectMemoriesResponse`

#### `chat_detect_and_save_decision(message: String)`

Detect if message contains a decision and auto-save it.

**Returns:** `Option<SaveDecisionResponse>`

#### `chat_save_decision(message: String)`

Manually save a decision to memory.

**Returns:** `SaveDecisionResponse`

#### `chat_get_memory_dashboard()`

Get comprehensive memory statistics and dashboard data.

**Returns:** `serde_json::Value`

#### `chat_suggest_memories_for_review()`

Get critical memories suggested for user review.

**Returns:** `{ critical_memories: [], high_importance: [] }`

#### `chat_prefetch_session_memories()`

Prefetch all memories for new chat session.

**Returns:** `String` (formatted context)

#### `chat_log_milestone(description: String, metadata?: JSON)`

Log a significant milestone to memory logs.

**Returns:** `i64` (log entry ID)

#### `chat_log_action(action: String, metadata?: JSON)`

Log an action taken during chat.

**Returns:** `i64` (log entry ID)

#### `chat_recall_memory(category: String, topic: String, boost?: bool)`

Recall a specific memory and optionally boost importance.

**Returns:** `Option<MemoryEntry>`

#### `chat_search_memories(query: String, limit?: usize)`

Search memories by query text.

**Returns:** `Vec<MemoryEntry>`

### Memory Dashboard Commands

#### `memory_get_dashboard_stats()`

Get memory statistics for dashboard.

**Returns:** `{ memory_stats, compaction_stats }`

#### `memory_get_project_memories(project_name?: String, limit?: usize)`

Get project-specific memories for context injection.

**Returns:** `Vec<MemoryEntry>`

#### `memory_get_usage_trends()`

Get memory usage trends over time.

**Returns:** `{ total_memories, average_importance, trend }`

#### `memory_suggest_important()`

Get important memories suggested for review.

**Returns:** `Vec<MemoryEntry>`

## Integration Examples

### Example 1: Auto-load on Project Open

```typescript
// In ProjectContextState update handler
const onProjectOpen = async (projectPath: string) => {
  // Load memories
  const result = await invoke('chat_load_project_memories');

  // Update chat UI with memory status
  if (result.has_relevant_memories) {
    showNotification(`Memories loaded: ${result.memories_loaded} items`);
  }

  // Store system prompt enhancement
  chatSystem.setMemoryContext(result.system_prompt_enhancement);
};
```

### Example 2: Auto-save Decisions in Chat

```typescript
// In chat message handler
const onUserMessage = async (message: string) => {
  // Send to backend
  const response = await invoke('chat_send_message', {
    content: message,
  });

  // Check for decision
  const decision = await invoke('chat_detect_and_save_decision', {
    message,
  });

  if (decision) {
    showDecisionSaved(decision.topic, decision.importance);
  }

  return response;
};
```

### Example 3: Memory Dashboard

```typescript
// In memory viewer component
const loadDashboard = async () => {
  const dashboard = await invoke('chat_get_memory_dashboard');

  return {
    total: dashboard.stats.total_count,
    avgImportance: dashboard.stats.avg_importance,
    highImportance: dashboard.stats.high_importance_count,
    compactionRate: dashboard.compaction.compaction_rate,
  };
};
```

### Example 4: Memory-Aware Planning

```typescript
// In AGI planner
const planWithMemory = async (goal: string) => {
  // Load goal-specific memories
  const memories = await invoke('chat_search_memories', {
    query: goal,
    limit: 10,
  });

  // Build enhanced system prompt
  const prompt = buildPlannerPrompt(goal, memories);

  // Create plan with memory context
  return await llm.createPlan(prompt);
};
```

## Best Practices

1. **Importance Weighting**: Use importance levels strategically
   - Critical architectural decisions: 9-10
   - Preferences and patterns: 7-8
   - Facts and solutions: 5-6
   - Context: 1-4

2. **Memory Decay**: Enable decay for automatic housekeeping
   - Default: 10% per week
   - Adjust based on domain (coding: slower decay)

3. **Context Injection**: Balance memory load
   - Include top 10 memories
   - Filter by importance >= 5
   - Prioritize decisions over facts

4. **Decision Naming**: Use clear, searchable topics
   - Good: "backend_language_choice"
   - Bad: "thing_we_decided"

5. **Regular Review**: Use dashboard to suggest review
   - Review critical memories monthly
   - Prune low-importance decayed memories
   - Archive old logs quarterly

## Troubleshooting

### Memories Not Loading

- Check project path is valid
- Verify memories exist for project
- Check min_importance threshold

### Decisions Not Detected

- Check detection patterns match
- Ensure decision has strong keywords
- Manually save if auto-detect fails

### Memory Growth Issues

- Enable memory decay
- Set lower min_importance
- Archive old logs regularly

### Performance Issues

- Reduce max_memories limit
- Disable semantic search if slow
- Use keyword search only

## Future Enhancements

1. **Cross-project memories**: Share decisions across projects
2. **Memory tagging**: User-defined memory tags for filtering
3. **ML-based importance**: Predict importance from usage
4. **Memory collaboration**: Share team decisions
5. **Advanced analytics**: Memory usage patterns and trends

## See Also

- `/src-tauri/src/core/llm/memory_integration.rs` - Memory injection logic
- `/src-tauri/src/core/agi/planner_memory_integration.rs` - Planning integration
- `/src-tauri/src/sys/commands/chat/memory_handler.rs` - Chat handlers
- `/src-tauri/src/core/agi/memory_manager.rs` - Memory storage
