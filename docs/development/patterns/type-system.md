# AGI Workforce Type System Architecture

> Comprehensive guide to the TypeScript type system used across the AGI Workforce monorepo.

## Table of Contents

- [Overview](#overview)
- [Type Organization](#type-organization)
- [Shared Types Package](#shared-types-package)
- [Tauri Command Type Signatures](#tauri-command-type-signatures)
- [Zustand Store Type Patterns](#zustand-store-type-patterns)
- [Advanced Type Utilities](#advanced-type-utilities)
- [Type Safety Best Practices](#type-safety-best-practices)
- [Common Patterns](#common-patterns)

## Overview

The AGI Workforce project maintains 100% type coverage with strict TypeScript configuration. The type system is organized into three layers:

1. **Shared Types** (`packages/types`) - Core types shared across desktop, web, and services
2. **Application Types** (`apps/*/src/types`) - App-specific type definitions
3. **Rust-TypeScript Bridge** - Type definitions matching Rust structs for Tauri commands

## Type Organization

### Directory Structure

```
agiworkforce/
├── packages/types/               # Shared types (published as @agiworkforce/types)
│   └── src/
│       ├── index.ts              # Main export barrel
│       ├── signaling.ts          # WebSocket signaling types
│       ├── context.ts            # Context item types
│       └── prompt-enhancement.ts # Prompt enhancement types
├── apps/desktop/src/types/       # Desktop-specific types
│   ├── chat.ts                   # Chat message and conversation types
│   ├── provider.ts               # LLM provider types
│   ├── mcp.ts                    # Model Context Protocol types
│   ├── automation.ts             # Workflow automation types
│   └── ...                       # Additional domain types
├── apps/web/                     # Web app types
│   └── types/                    # Next.js app types
└── services/                     # Service types
    └── types/                    # API and signaling types
```

## Shared Types Package

The `@agiworkforce/types` package provides core types used across the monorepo.

### Installation

```bash
# Already included via workspace
pnpm install
```

### Usage

```typescript
// Import from the shared package
import type { SignalingEvent, ContextItem, FileContextItem } from '@agiworkforce/types';
```

### Key Type Families

#### 1. Signaling Types

WebSocket-based peer-to-peer connection coordination:

```typescript
import type { SignalingEvent, SignalingRole } from '@agiworkforce/types';

// Discriminated union with exhaustive pattern matching
function handleEvent(event: SignalingEvent) {
  switch (event.type) {
    case 'open':
      console.log('Connection opened');
      break;
    case 'registered':
      console.log(`Expires: ${new Date(event.expiresAt)}`);
      break;
    case 'signal':
      // TypeScript knows event has 'from', 'kind', 'payload'
      handleSignal(event.from, event.kind, event.payload);
      break;
    case 'error':
      console.error(event.error);
      break;
  }
}
```

#### 2. Context Item Types

Type-safe context items for enriching AI prompts:

```typescript
import type { ContextItem, FileContextItem } from '@agiworkforce/types';

// Type narrowing with discriminated unions
function renderContext(item: ContextItem) {
  switch (item.type) {
    case 'file':
      // TypeScript knows item is FileContextItem
      return <FileIcon path={item.path} language={item.language} />;
    case 'image':
      // TypeScript knows item is ImageContextItem
      return <ImagePreview src={item.dataUrl} width={item.width} />;
    case 'web':
      // TypeScript knows item is WebContextItem
      return <WebResults query={item.query} results={item.results} />;
  }
}
```

#### 3. Prompt Enhancement Types

Types for AI-powered prompt optimization:

```typescript
import type { EnhancedPrompt, UseCase, APIProvider } from '@agiworkforce/types';

const enhanced: EnhancedPrompt = {
  original: 'create a button',
  enhanced: 'Create a reusable React button component...',
  useCase: UseCase.Coding,
  confidence: 0.92,
  suggestedProvider: APIProvider.Claude,
  context: {
    language: 'typescript',
    framework: 'react',
    complexity: 'Moderate',
  },
};
```

## Tauri Command Type Signatures

Tauri commands bridge Rust backend and TypeScript frontend. Types must match exactly between Rust structs and TypeScript interfaces.

### Request/Response Pattern

#### Rust Side (Backend)

```rust
// apps/desktop/src-tauri/src/sys/commands/llm.rs

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LLMSendMessageRequest {
    pub messages: Vec<ChatMessage>,
    pub model: Option<String>,
    pub provider: Option<String>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
    #[serde(default)]
    pub prefer_cloud_credits: bool,
}

#[tauri::command]
pub async fn llm_send_message(
    request: LLMSendMessageRequest,
    state: State<'_, LLMState>,
) -> Result<LLMResponse, String> {
    // Implementation
}
```

#### TypeScript Side (Frontend)

```typescript
// apps/desktop/src/types/llm.ts

export interface LLMSendMessageRequest {
  messages: ChatMessage[];
  model?: string;
  provider?: string;
  temperature?: number;
  maxTokens?: number;
  preferCloudCredits?: boolean; // Note: camelCase in TS
}

// Invoke from TypeScript
import { invoke } from '@tauri-apps/api/core';

const response = await invoke<LLMResponse>('llm_send_message', {
  request: {
    messages: [{ role: 'user', content: 'Hello' }],
    preferCloudCredits: true,
  },
});
```

### Field Naming Conventions

Rust uses `snake_case`, TypeScript uses `camelCase`. Serde handles conversion:

```rust
// Rust side - use serde aliases
#[derive(Serialize, Deserialize)]
pub struct ChatRequest {
    #[serde(alias = "conversationId")] // Accept camelCase from TS
    pub conversation_id: Option<i64>,

    #[serde(rename = "userId")] // Always expect camelCase
    pub user_id: String,
}
```

```typescript
// TypeScript side - use camelCase
interface ChatRequest {
  conversationId?: number;
  userId: string;
}
```

### Type Validation

Implement validation on the Rust side for security:

```rust
pub trait Validate {
    fn validate(&self) -> Result<(), ValidationError>;
}

impl Validate for ChatRequest {
    fn validate(&self) -> Result<(), ValidationError> {
        if self.content.len() > MAX_CONTENT_LENGTH {
            return Err(ValidationError {
                field: "content".to_string(),
                message: "Content too long".to_string(),
            });
        }
        Ok(())
    }
}
```

TypeScript types reflect these constraints in JSDoc:

```typescript
/**
 * Request to send a chat message.
 *
 * @property content - Message content (max 1MB)
 * @property userId - User ID (max 256 characters)
 */
export interface ChatRequest {
  /** Message content (max 1,048,576 bytes) */
  content: string;
  /** User identifier (max 256 characters) */
  userId: string;
}
```

## Zustand Store Type Patterns

Zustand v5 stores use a specific pattern for type-safe state management.

### Basic Store Pattern

```typescript
import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector } from 'zustand/middleware';

// 1. Define the state interface
interface CounterState {
  // State properties
  count: number;
  history: number[];

  // Actions
  increment: () => void;
  decrement: () => void;
  reset: () => void;

  // Async actions
  loadFromServer: () => Promise<void>;

  // Hydration tracking (for persist middleware)
  _hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;
}

// 2. Create the store with middleware composition
export const useCounterStore = create<CounterState>()(
  devtools(
    persist(
      subscribeWithSelector((set, get) => ({
        // Initial state
        count: 0,
        history: [],
        _hasHydrated: false,

        // Sync actions
        increment: () =>
          set((state) => ({
            count: state.count + 1,
            history: [...state.history, state.count + 1],
          })),

        decrement: () =>
          set((state) => ({
            count: state.count - 1,
          })),

        reset: () => set({ count: 0, history: [] }),

        // Async action
        loadFromServer: async () => {
          try {
            const data = await fetchCount();
            set({ count: data.count });
          } catch (error) {
            console.error('Failed to load:', error);
          }
        },

        // Hydration
        setHasHydrated: (state: boolean) => {
          set({ _hasHydrated: state });
        },
      })),
      {
        name: 'counter-storage',
        version: 1,
        partialize: (state) => ({
          count: state.count,
          history: state.history,
        }),
        onRehydrateStorage: () => (state) => {
          state?.setHasHydrated(true);
        },
      },
    ),
    { name: 'CounterStore', enabled: import.meta.env.DEV },
  ),
);
```

### Advanced Store Patterns

#### 1. Selectors for Optimized Subscriptions

```typescript
// Export selectors for granular subscriptions
export const selectCount = (state: CounterState) => state.count;
export const selectIsPositive = (state: CounterState) => state.count > 0;

// Usage in components - only re-renders when count changes
const count = useCounterStore(selectCount);
const isPositive = useCounterStore(selectIsPositive);
```

#### 2. Immer Middleware for Complex Updates

```typescript
import { immer } from 'zustand/middleware/immer';

interface TodoState {
  todos: Map<string, Todo>;
  addTodo: (todo: Todo) => void;
  toggleTodo: (id: string) => void;
}

export const useTodoStore = create<TodoState>()(
  devtools(
    persist(
      subscribeWithSelector(
        immer((set, get) => ({
          todos: new Map(),

          addTodo: (todo) =>
            set((draft) => {
              // Immer allows direct mutation
              draft.todos.set(todo.id, todo);
            }),

          toggleTodo: (id) =>
            set((draft) => {
              const todo = draft.todos.get(id);
              if (todo) {
                todo.completed = !todo.completed;
              }
            }),
        })),
      ),
      {
        name: 'todo-storage',
        // Custom storage for Map serialization
        storage: {
          getItem: (name) => {
            const str = localStorage.getItem(name);
            if (!str) return null;
            const { state } = JSON.parse(str);
            return {
              state: {
                ...state,
                todos: new Map(state.todos),
              },
            };
          },
          setItem: (name, value) => {
            const str = JSON.stringify({
              state: {
                ...value.state,
                todos: Array.from(value.state.todos.entries()),
              },
            });
            localStorage.setItem(name, str);
          },
          removeItem: (name) => localStorage.removeItem(name),
        },
      },
    ),
    { name: 'TodoStore' },
  ),
);
```

#### 3. Store Composition

```typescript
// Compose multiple stores together
interface AppState {
  user: UserState;
  settings: SettingsState;
  chat: ChatState;
}

// Access other stores from within actions
const useChatStore = create<ChatState>()((set, get) => ({
  messages: [],

  sendMessage: async (content: string) => {
    // Access user store
    const userId = useUserStore.getState().user?.id;
    if (!userId) throw new Error('Not authenticated');

    // Access settings
    const { defaultProvider } = useSettingsStore.getState();

    // Send message with context from other stores
    await invoke('chat_send_message', {
      userId,
      content,
      provider: defaultProvider,
    });
  },
}));
```

#### 4. Async State Management

```typescript
interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

interface UserState extends AsyncState<User> {
  fetchUser: (id: string) => Promise<void>;
  clearError: () => void;
}

export const useUserStore = create<UserState>()((set) => ({
  data: null,
  loading: false,
  error: null,

  fetchUser: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const user = await fetchUserById(id);
      set({ data: user, loading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Unknown error',
        loading: false,
      });
    }
  },

  clearError: () => set({ error: null }),
}));
```

## Advanced Type Utilities

### 1. Discriminated Unions

Type-safe pattern matching:

```typescript
// Define variants with a discriminant field
type ToolStatus =
  | { status: 'idle' }
  | { status: 'running'; progress: number }
  | { status: 'completed'; result: string }
  | { status: 'failed'; error: string };

function renderStatus(tool: ToolStatus) {
  switch (tool.status) {
    case 'idle':
      return 'Ready';
    case 'running':
      return `Progress: ${tool.progress}%`; // TypeScript knows 'progress' exists
    case 'completed':
      return `Result: ${tool.result}`; // TypeScript knows 'result' exists
    case 'failed':
      return `Error: ${tool.error}`; // TypeScript knows 'error' exists
  }
}
```

### 2. Branded Types

Create nominal types for domain modeling:

```typescript
// Branded type prevents mixing different ID types
type UserId = string & { readonly __brand: 'UserId' };
type MessageId = string & { readonly __brand: 'MessageId' };

// Factory functions enforce branding
function createUserId(id: string): UserId {
  return id as UserId;
}

function createMessageId(id: string): MessageId {
  return id as MessageId;
}

// Type-safe functions
function fetchUser(userId: UserId) {
  /* ... */
}
function deleteMessage(messageId: MessageId) {
  /* ... */
}

// Usage
const userId = createUserId('user-123');
const messageId = createMessageId('msg-456');

fetchUser(userId); // ✅ OK
fetchUser(messageId); // ❌ Type error: MessageId is not assignable to UserId
```

### 3. Conditional Types

Create flexible, context-aware types:

```typescript
// Return type depends on input
type LoadingState<T, IsLoading extends boolean> = IsLoading extends true
  ? { data: null; loading: true }
  : { data: T; loading: false };

// Usage
function useData<T, L extends boolean>(loading: L): LoadingState<T, L> {
  if (loading) {
    return { data: null, loading: true } as LoadingState<T, L>;
  }
  return { data: fetchData(), loading: false } as LoadingState<T, L>;
}
```

### 4. Mapped Types

Transform existing types:

```typescript
// Make all properties optional
type Partial<T> = {
  [P in keyof T]?: T[P];
};

// Make all properties required
type Required<T> = {
  [P in keyof T]-?: T[P];
};

// Make all properties readonly
type Readonly<T> = {
  readonly [P in keyof T]: T[P];
};

// Pick specific properties
type Pick<T, K extends keyof T> = {
  [P in K]: T[P];
};

// Custom mapper: add prefix to all keys
type Prefixed<T, Prefix extends string> = {
  [K in keyof T as `${Prefix}${Capitalize<string & K>}`]: T[K];
};

// Usage
interface User {
  id: string;
  name: string;
  email: string;
}

type PrefixedUser = Prefixed<User, 'user'>;
// Result: { userId: string; userName: string; userEmail: string }
```

### 5. Template Literal Types

String manipulation at the type level:

```typescript
// Event names based on entity types
type Entity = 'user' | 'message' | 'conversation';
type Action = 'created' | 'updated' | 'deleted';
type EventName = `${Entity}:${Action}`;
// Result: 'user:created' | 'user:updated' | ... | 'conversation:deleted'

// Type-safe event emitter
interface Events {
  'user:created': { userId: string; name: string };
  'user:updated': { userId: string; changes: Partial<User> };
  'user:deleted': { userId: string };
  // ... other events
}

function on<E extends keyof Events>(event: E, handler: (payload: Events[E]) => void) {
  // Implementation
}

// Usage - fully type-safe
on('user:created', (payload) => {
  console.log(payload.userId, payload.name); // ✅ Typed correctly
});

on('user:deleted', (payload) => {
  console.log(payload.userId); // ✅ Typed correctly
  console.log(payload.name); // ❌ Type error: 'name' doesn't exist
});
```

### 6. Type Guards

Runtime type checking with type narrowing:

```typescript
// User-defined type guard
function isFileContext(item: ContextItem): item is FileContextItem {
  return item.type === 'file';
}

// Usage
const items: ContextItem[] = getContextItems();
const files = items.filter(isFileContext); // Type: FileContextItem[]

// Access type-specific properties
files.forEach((file) => {
  console.log(file.path); // ✅ TypeScript knows 'path' exists
});
```

### 7. Utility Type Composition

Combine utility types for complex transformations:

```typescript
// Make specific fields optional
type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
}

// Make avatar optional
type UserInput = PartialBy<User, 'avatar'>;
// Result: { id: string; name: string; email: string; avatar?: string }

// Require specific fields
type RequireBy<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

// Deep partial (recursive)
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};
```

## Type Safety Best Practices

### 1. Avoid `any` at All Costs

```typescript
// ❌ Bad: Loses all type safety
function process(data: any) {
  return data.value; // No type checking
}

// ✅ Good: Use generics
function process<T>(data: T): T {
  return data;
}

// ✅ Better: Constrain generics
function process<T extends { value: unknown }>(data: T) {
  return data.value; // Type-safe access
}

// ✅ Best: Use unknown for truly unknown types
function process(data: unknown) {
  if (typeof data === 'object' && data !== null && 'value' in data) {
    return (data as { value: unknown }).value;
  }
  throw new Error('Invalid data');
}
```

### 2. Leverage Type Inference

```typescript
// ❌ Redundant type annotation
const numbers: number[] = [1, 2, 3];

// ✅ Let TypeScript infer
const numbers = [1, 2, 3]; // Inferred as number[]

// ✅ Use 'as const' for literal types
const config = {
  apiUrl: 'https://api.example.com',
  timeout: 5000,
} as const;
// Type: { readonly apiUrl: 'https://api.example.com'; readonly timeout: 5000 }
```

### 3. Use Strict Null Checks

```typescript
// ❌ Unsafe: might be null
function getName(user: User) {
  return user.name.toUpperCase(); // Runtime error if name is null
}

// ✅ Handle null explicitly
function getName(user: User) {
  return user.name?.toUpperCase() ?? 'Unknown';
}

// ✅ Use discriminated unions for nullable types
type Result<T> = { success: true; data: T } | { success: false; error: string };

function getUser(id: string): Result<User> {
  // Implementation
}

const result = getUser('123');
if (result.success) {
  console.log(result.data.name); // Type-safe access
} else {
  console.error(result.error);
}
```

### 4. Prefer Interfaces for Object Shapes

```typescript
// ✅ Use interface for object shapes
interface User {
  id: string;
  name: string;
  email: string;
}

// ✅ Use type for unions, intersections, and complex types
type Status = 'active' | 'inactive' | 'pending';
type AdminUser = User & { role: 'admin'; permissions: string[] };
```

### 5. Document Public APIs with JSDoc

````typescript
/**
 * Sends a message to the chat API.
 *
 * @param request - The message request configuration
 * @param request.content - Message content (max 1MB)
 * @param request.conversationId - Optional conversation ID for context
 * @returns Promise resolving to the assistant's response
 * @throws {Error} If user is not authenticated
 * @throws {Error} If content exceeds size limit
 *
 * @example
 * ```typescript
 * const response = await sendMessage({
 *   content: 'Hello, world!',
 *   conversationId: 123
 * });
 * console.log(response.assistant_message.content);
 * ```
 */
export async function sendMessage(
  request: ChatSendMessageRequest,
): Promise<ChatSendMessageResponse> {
  // Implementation
}
````

## Common Patterns

### Pattern 1: Type-Safe Event Emitters

```typescript
// Define event map
interface EventMap {
  'user:login': { userId: string; timestamp: number };
  'user:logout': { userId: string };
  'message:sent': { messageId: string; conversationId: number };
}

// Type-safe emitter
class TypedEventEmitter<T extends Record<string, unknown>> {
  private listeners = new Map<keyof T, Set<(data: unknown) => void>>();

  on<K extends keyof T>(event: K, handler: (data: T[K]) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler as (data: unknown) => void);
  }

  emit<K extends keyof T>(event: K, data: T[K]): void {
    this.listeners.get(event)?.forEach((handler) => handler(data));
  }
}

// Usage
const emitter = new TypedEventEmitter<EventMap>();

emitter.on('user:login', (data) => {
  console.log(data.userId, data.timestamp); // Fully typed
});

emitter.emit('user:login', {
  userId: '123',
  timestamp: Date.now(),
}); // ✅ Type-safe

emitter.emit('user:login', {
  userId: 123, // ❌ Type error: number is not assignable to string
});
```

### Pattern 2: Builder Pattern with Type Safety

```typescript
interface Query {
  table: string;
  where?: Record<string, unknown>;
  select?: string[];
  orderBy?: string;
  limit?: number;
}

class QueryBuilder {
  private query: Query = { table: '' };

  table(name: string): this {
    this.query.table = name;
    return this;
  }

  where(conditions: Record<string, unknown>): this {
    this.query.where = conditions;
    return this;
  }

  select(...fields: string[]): this {
    this.query.select = fields;
    return this;
  }

  orderBy(field: string): this {
    this.query.orderBy = field;
    return this;
  }

  limit(count: number): this {
    this.query.limit = count;
    return this;
  }

  build(): Query {
    if (!this.query.table) {
      throw new Error('Table name is required');
    }
    return { ...this.query };
  }
}

// Usage - fluent, type-safe API
const query = new QueryBuilder()
  .table('users')
  .where({ active: true })
  .select('id', 'name', 'email')
  .orderBy('created_at')
  .limit(10)
  .build();
```

### Pattern 3: Result Type for Error Handling

```typescript
// Result type inspired by Rust
type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

// Helper constructors
const Ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
const Err = <E>(error: E): Result<never, E> => ({ ok: false, error });

// Usage
async function fetchUser(id: string): Promise<Result<User, string>> {
  try {
    const response = await fetch(`/api/users/${id}`);
    if (!response.ok) {
      return Err(`HTTP ${response.status}: ${response.statusText}`);
    }
    const user = await response.json();
    return Ok(user);
  } catch (error) {
    return Err(error instanceof Error ? error.message : 'Unknown error');
  }
}

// Consume safely
const result = await fetchUser('123');
if (result.ok) {
  console.log('User:', result.value);
} else {
  console.error('Error:', result.error);
}
```

### Pattern 4: Finite State Machines

```typescript
// Define states and events
type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: string }
  | { status: 'error'; message: string };

type Event =
  | { type: 'FETCH' }
  | { type: 'SUCCESS'; data: string }
  | { type: 'ERROR'; message: string }
  | { type: 'RETRY' };

// State machine
function reducer(state: State, event: Event): State {
  switch (state.status) {
    case 'idle':
      if (event.type === 'FETCH') {
        return { status: 'loading' };
      }
      return state;

    case 'loading':
      switch (event.type) {
        case 'SUCCESS':
          return { status: 'success', data: event.data };
        case 'ERROR':
          return { status: 'error', message: event.message };
        default:
          return state;
      }

    case 'success':
    case 'error':
      if (event.type === 'RETRY') {
        return { status: 'loading' };
      }
      return state;
  }
}
```

## Additional Resources

- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [Zustand Documentation](https://docs.pmnd.rs/zustand/getting-started/introduction)
- [Tauri Type System](https://tauri.app/v1/guides/features/command/#typescript-types)
- [Type Challenges](https://github.com/type-challenges/type-challenges) - Practice advanced TypeScript

## Contributing

When adding new types:

1. Place shared types in `packages/types/src/`
2. Add JSDoc comments with examples
3. Export from `packages/types/src/index.ts`
4. Document in this guide if introducing new patterns
5. Ensure Rust-TypeScript types stay in sync for Tauri commands

---

**Last Updated**: 2026-01-15
**Maintained By**: AGI Workforce Team
