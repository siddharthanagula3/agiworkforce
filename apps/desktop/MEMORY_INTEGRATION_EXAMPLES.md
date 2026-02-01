# Memory Integration Examples

Complete examples showing how to integrate the memory system into your React components.

## Example 1: Auto-Load Memories on Project Open

```typescript
// src/hooks/useProjectMemories.ts

import { useEffect, useState } from 'react';
import * as memory from '@/api/memory';
import type { LoadProjectMemoriesResponse } from '@/api/memory';

export function useProjectMemories(projectPath: string | null) {
  const [memoriesLoaded, setMemoriesLoaded] = useState(0);
  const [systemPromptEnhancement, setSystemPromptEnhancement] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectPath) {
      setMemoriesLoaded(0);
      setSystemPromptEnhancement('');
      return;
    }

    const loadMemories = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await memory.loadProjectMemories();

        setMemoriesLoaded(result.memories_loaded);
        setSystemPromptEnhancement(result.system_prompt_enhancement);

        // Show notification
        console.log(`${result.message}`);
      } catch (err) {
        setError(`Failed to load project memories: ${err}`);
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    loadMemories();
  }, [projectPath]);

  return {
    memoriesLoaded,
    systemPromptEnhancement,
    isLoading,
    error,
  };
}
```

Usage in your project context component:

```typescript
// src/components/ProjectFolder/ProjectFolderSelector.tsx

import { useProjectMemories } from '@/hooks/useProjectMemories';

export function ProjectFolderSelector() {
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const { memoriesLoaded, systemPromptEnhancement, error } = useProjectMemories(projectPath);

  const handleSelectFolder = async (path: string) => {
    setProjectPath(path);
  };

  return (
    <div className="project-selector">
      {/* Folder selection UI */}

      {memoriesLoaded > 0 && (
        <div className="memory-indicator">
          ✅ Memories loaded: {memoriesLoaded} items
        </div>
      )}

      {error && (
        <div className="error-message">
          ⚠️ {error}
        </div>
      )}
    </div>
  );
}
```

## Example 2: Auto-Detect and Save Decisions

```typescript
// src/hooks/useDecisionDetection.ts

import { useEffect, useState } from 'react';
import * as memory from '@/api/memory';
import type { SaveDecisionResponse } from '@/api/memory';

export function useDecisionDetection() {
  const [lastDecision, setLastDecision] = useState<SaveDecisionResponse | null>(null);
  const [showNotification, setShowNotification] = useState(false);

  const detectAndSave = async (message: string) => {
    try {
      const decision = await memory.detectAndSaveDecision(message);

      if (decision) {
        setLastDecision(decision);
        setShowNotification(true);

        // Auto-hide notification after 3 seconds
        setTimeout(() => setShowNotification(false), 3000);

        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to detect decision:', err);
      return false;
    }
  };

  return {
    detectAndSave,
    lastDecision,
    showNotification,
  };
}
```

Usage in chat component:

```typescript
// src/components/Chat/ChatInput.tsx

import { useDecisionDetection } from '@/hooks/useDecisionDetection';

export function ChatInput({ onSendMessage }: { onSendMessage: (msg: string) => Promise<void> }) {
  const [message, setMessage] = useState('');
  const { detectAndSave, lastDecision, showNotification } = useDecisionDetection();

  const handleSend = async () => {
    if (!message.trim()) return;

    // Check for decision in the message
    await detectAndSave(message);

    // Send message to LLM
    await onSendMessage(message);

    setMessage('');
  };

  return (
    <div className="chat-input">
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Tell the AI what you want..."
      />

      <button onClick={handleSend}>
        Send
      </button>

      {showNotification && lastDecision && (
        <div className="decision-saved-notification">
          ✅ Decision saved: <strong>{lastDecision.topic}</strong>
          <span className="importance">
            Importance: {lastDecision.importance}/10
          </span>
        </div>
      )}
    </div>
  );
}
```

## Example 3: Memory Dashboard Component

```typescript
// src/components/Memory/MemoryDashboard.tsx

import { useEffect, useState } from 'react';
import * as memory from '@/api/memory';
import type { MemoryDashboard } from '@/api/memory';

export function MemoryDashboard() {
  const [dashboard, setDashboard] = useState<MemoryDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      setIsLoading(true);
      const data = await memory.getMemoryDashboard();
      setDashboard(data);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <div>Loading memory dashboard...</div>;
  }

  if (!dashboard) {
    return <div>No memory data available</div>;
  }

  return (
    <div className="memory-dashboard">
      <h2>Memory Dashboard</h2>

      {/* Statistics Cards */}
      <div className="stats-grid">
        <StatCard
          title="Total Memories"
          value={dashboard.stats.total_count}
          icon="📚"
        />
        <StatCard
          title="Avg. Importance"
          value={dashboard.stats.avg_importance.toFixed(1)}
          icon="⭐"
        />
        <StatCard
          title="High Importance"
          value={dashboard.stats.high_importance_count}
          icon="🔴"
        />
        <StatCard
          title="Compaction Rate"
          value={`${dashboard.compaction.compaction_rate.toFixed(0)}%`}
          icon="🗜️"
        />
      </div>

      {/* Memory Distribution */}
      <div className="memory-distribution">
        <h3>Memory Distribution</h3>
        <DistributionChart stats={dashboard.stats} />
      </div>

      {/* Compaction Status */}
      <div className="compaction-status">
        <h3>Compaction Status</h3>
        <p>
          {dashboard.compaction.compacted_logs} of{' '}
          {dashboard.compaction.total_logs} logs compacted
        </p>
        <ProgressBar
          value={dashboard.compaction.compaction_rate}
          max={100}
        />
      </div>

      <button onClick={loadDashboard} className="refresh-button">
        🔄 Refresh
      </button>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string | number;
  icon: string;
}

function StatCard({ title, value, icon }: StatCardProps) {
  return (
    <div className="stat-card">
      <span className="icon">{icon}</span>
      <div className="content">
        <p className="title">{title}</p>
        <p className="value">{value}</p>
      </div>
    </div>
  );
}

function DistributionChart({ stats }: { stats: any }) {
  const total = stats.total_count || 1;
  const highPct = (stats.high_importance_count / total) * 100;
  const lowPct = (stats.low_importance_count / total) * 100;

  return (
    <div className="chart">
      <div className="bar">
        <div className="segment high" style={{ width: `${highPct}%` }} title="High">
          High
        </div>
        <div className="segment medium" style={{ width: `${100 - highPct - lowPct}%` }} title="Medium">
          Medium
        </div>
        <div className="segment low" style={{ width: `${lowPct}%` }} title="Low">
          Low
        </div>
      </div>
    </div>
  );
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const percentage = (value / max) * 100;
  return (
    <div className="progress-bar">
      <div className="progress" style={{ width: `${percentage}%` }} />
      <span className="percentage">{percentage.toFixed(0)}%</span>
    </div>
  );
}
```

## Example 4: System Prompt Enhancement in LLM Call

```typescript
// src/services/chatService.ts

import * as memory from '@/api/memory';
import type { LoadProjectMemoriesResponse } from '@/api/memory';

export class ChatService {
  private systemPromptEnhancement: string = '';

  async initializeWithProject(projectPath: string | null) {
    if (!projectPath) {
      this.systemPromptEnhancement = '';
      return;
    }

    try {
      const result = await memory.loadProjectMemories();
      this.systemPromptEnhancement = result.system_prompt_enhancement;
    } catch (err) {
      console.warn('Failed to load project memories:', err);
      this.systemPromptEnhancement = '';
    }
  }

  async sendMessage(userMessage: string) {
    // Check for decisions
    await memory.detectAndSaveDecision(userMessage);

    // Build system prompt with memory enhancement
    const systemPrompt = this.buildSystemPrompt();

    // Call LLM
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: userMessage,
          },
        ],
      }),
    });

    return response.json();
  }

  private buildSystemPrompt(): string {
    const basePrompt = `You are an AI assistant helping with software development. \
Follow the user's instructions and be helpful, harmless, and honest.`;

    if (this.systemPromptEnhancement) {
      return `${basePrompt}\n\n${this.systemPromptEnhancement}`;
    }

    return basePrompt;
  }
}
```

## Example 5: Memory Suggestion Component

```typescript
// src/components/Memory/MemorySuggestions.tsx

import { useEffect, useState } from 'react';
import * as memory from '@/api/memory';
import type { MemoryEntry } from '@/api/memory';

export function MemorySuggestions() {
  const [criticalMemories, setCriticalMemories] = useState<MemoryEntry[]>([]);
  const [highImportanceMemories, setHighImportanceMemories] = useState<MemoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadSuggestions();
  }, []);

  const loadSuggestions = async () => {
    try {
      setIsLoading(true);
      const suggestions = await memory.suggestMemoriesForReview();
      setCriticalMemories(suggestions.critical_memories);
      setHighImportanceMemories(suggestions.high_importance);
    } catch (err) {
      console.error('Failed to load suggestions:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <div>Loading memory suggestions...</div>;
  }

  return (
    <div className="memory-suggestions">
      <h2>Memory Review Suggestions</h2>

      {criticalMemories.length > 0 && (
        <section>
          <h3>🔴 Critical Memories</h3>
          <MemoryList memories={criticalMemories} />
        </section>
      )}

      {highImportanceMemories.length > 0 && (
        <section>
          <h3>🟡 High Importance Memories</h3>
          <MemoryList memories={highImportanceMemories} />
        </section>
      )}

      {criticalMemories.length === 0 && highImportanceMemories.length === 0 && (
        <p>No memories to review at this time.</p>
      )}

      <button onClick={loadSuggestions}>🔄 Refresh Suggestions</button>
    </div>
  );
}

function MemoryList({ memories }: { memories: MemoryEntry[] }) {
  return (
    <ul className="memory-list">
      {memories.map((mem) => (
        <li key={mem.id} className="memory-item">
          <div className="header">
            <strong>{mem.topic}</strong>
            <span className="category">{mem.category}</span>
            <span className="importance">{mem.importance}/10</span>
          </div>
          <p className="content">{mem.content}</p>
          <small className="metadata">
            Created: {new Date(mem.created_at).toLocaleDateString()}
          </small>
        </li>
      ))}
    </ul>
  );
}
```

## Example 6: Search and Review Memories

```typescript
// src/components/Memory/MemorySearch.tsx

import { useState } from 'react';
import * as memory from '@/api/memory';
import type { MemoryEntry } from '@/api/memory';

export function MemorySearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MemoryEntry[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    try {
      setIsSearching(true);
      setHasSearched(true);
      const searchResults = await memory.searchMemories(query, 20);
      setResults(searchResults);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleBoostImportance = async (category: string, topic: string) => {
    try {
      const updated = await memory.recallMemory(category, topic, true);
      if (updated) {
        console.log(`Importance boosted to ${updated.importance}/10`);
      }
    } catch (err) {
      console.error('Failed to boost importance:', err);
    }
  };

  return (
    <div className="memory-search">
      <form onSubmit={handleSearch}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search memories (e.g., 'database', 'rust', 'design pattern')"
        />
        <button type="submit" disabled={isSearching}>
          {isSearching ? 'Searching...' : 'Search'}
        </button>
      </form>

      {hasSearched && (
        <div className="search-results">
          <p>Found {results.length} memories</p>

          {results.length > 0 ? (
            <ul className="results-list">
              {results.map((mem) => (
                <li key={mem.id} className="result-item">
                  <div className="header">
                    <strong>{mem.topic}</strong>
                    <span className={`category ${mem.category}`}>
                      {mem.category}
                    </span>
                    <span className={`importance importance-${Math.ceil(mem.importance / 3)}`}>
                      {memory.getImportanceLabel(mem.importance)}
                    </span>
                  </div>

                  <p className="content">{mem.content}</p>

                  <div className="actions">
                    <button
                      onClick={() => handleBoostImportance(mem.category, mem.topic)}
                      className="boost-btn"
                    >
                      ⬆️ Boost Importance
                    </button>
                    <button
                      onClick={() =>
                        memory.forgetTopic(mem.category, mem.topic)
                      }
                      className="delete-btn"
                    >
                      🗑️ Delete
                    </button>
                  </div>

                  {mem.last_accessed && (
                    <small className="metadata">
                      Last accessed: {new Date(mem.last_accessed).toLocaleDateString()}
                    </small>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p>No memories found. Try a different search term.</p>
          )}
        </div>
      )}
    </div>
  );
}
```

## Example 7: Complete Chat Integration

```typescript
// src/components/Chat/ChatWithMemory.tsx

import { useEffect, useState } from 'react';
import { useProjectMemories } from '@/hooks/useProjectMemories';
import { useDecisionDetection } from '@/hooks/useDecisionDetection';
import * as memory from '@/api/memory';

export function ChatWithMemory({ projectPath }: { projectPath: string | null }) {
  const [messages, setMessages] = useState<any[]>([]);
  const [isSending, setIsSending] = useState(false);

  // Memory hooks
  const { memoriesLoaded, systemPromptEnhancement } = useProjectMemories(projectPath);
  const { detectAndSave, lastDecision, showNotification } = useDecisionDetection();

  // Log milestone on mount
  useEffect(() => {
    memory.logMilestone(`Chat session started`, {
      projectPath,
      timestamp: new Date().toISOString(),
    });
  }, [projectPath]);

  const handleSendMessage = async (userMessage: string) => {
    setIsSending(true);

    try {
      // 1. Detect and save any decisions
      await detectAndSave(userMessage);

      // 2. Log action to memory
      await memory.logAction(`User message sent: "${userMessage.substring(0, 50)}..."`);

      // 3. Build LLM request with memory enhancement
      const systemPrompt = buildSystemPrompt();

      // 4. Call LLM (pseudo-code)
      const response = await callLLM(userMessage, systemPrompt);

      // 5. Add to message history
      setMessages((prev) => [
        ...prev,
        { role: 'user', content: userMessage },
        { role: 'assistant', content: response },
      ]);

      // 6. Check if response contains success indicators
      if (isSuccessfulExecution(response)) {
        await memory.logMilestone(`Task completed: ${response.substring(0, 50)}...`);
      }
    } catch (err) {
      console.error('Chat failed:', err);
    } finally {
      setIsSending(false);
    }
  };

  const buildSystemPrompt = (): string => {
    const base = 'You are an AI assistant helping users with development tasks.';
    if (systemPromptEnhancement) {
      return `${base}\n\n${systemPromptEnhancement}`;
    }
    return base;
  };

  return (
    <div className="chat-with-memory">
      {/* Memory Status */}
      {memoriesLoaded > 0 && (
        <div className="memory-status">
          ✅ {memoriesLoaded} memories loaded for context
        </div>
      )}

      {/* Chat Messages */}
      <div className="messages">
        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            {msg.content}
          </div>
        ))}
      </div>

      {/* Decision Notification */}
      {showNotification && lastDecision && (
        <div className="notification decision-saved">
          ✅ Decision saved: <strong>{lastDecision.topic}</strong>
          <span className="importance">({lastDecision.importance}/10)</span>
        </div>
      )}

      {/* Input Area */}
      <ChatInput onSendMessage={handleSendMessage} disabled={isSending} />
    </div>
  );
}

function CallLLM(message: string, systemPrompt: string): Promise<string> {
  // Call to backend LLM with memory-enhanced system prompt
  return fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ],
    }),
  })
    .then((r) => r.json())
    .then((data) => data.content || '');
}

function isSuccessfulExecution(response: string): boolean {
  return response.toLowerCase().includes('completed') ||
    response.toLowerCase().includes('success') ||
    response.toLowerCase().includes('done');
}
```

## CSS Styling Examples

```css
/* Memory Dashboard Styles */
.memory-dashboard {
  padding: 20px;
  background: #f5f5f5;
  border-radius: 8px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
  margin: 20px 0;
}

.stat-card {
  background: white;
  padding: 15px;
  border-radius: 6px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  display: flex;
  align-items: center;
  gap: 10px;
}

.stat-card .icon {
  font-size: 24px;
}

.stat-card .value {
  font-size: 20px;
  font-weight: bold;
}

/* Decision Notification */
.decision-saved-notification {
  background: #d4edda;
  color: #155724;
  padding: 12px 16px;
  border-radius: 4px;
  border-left: 4px solid #28a745;
  margin: 10px 0;
}

.decision-saved-notification .importance {
  float: right;
  font-size: 12px;
  opacity: 0.7;
}

/* Memory Item */
.memory-item {
  background: white;
  padding: 12px;
  border-left: 3px solid #007bff;
  margin: 8px 0;
  border-radius: 4px;
}

.memory-item .category {
  background: #e7f3ff;
  color: #0066cc;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 12px;
  margin-left: 8px;
}

.memory-item .importance {
  float: right;
  font-weight: bold;
}
```

## Usage Checklist

1. ✅ Import `memory.ts` in your components
2. ✅ Call `loadProjectMemories()` on project open
3. ✅ Call `detectAndSaveDecision()` after messages
4. ✅ Use `systemPromptEnhancement` in LLM calls
5. ✅ Show `getMemoryDashboard()` stats
6. ✅ Display decision notifications
7. ✅ Log milestones for important events
8. ✅ Search memories for context

## Questions?

See the full integration guide at `/MEMORY_INTEGRATION_GUIDE.md`
