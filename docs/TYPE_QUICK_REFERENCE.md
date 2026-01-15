# TypeScript Type Quick Reference

> Quick reference guide for common type patterns in AGI Workforce

## Importing Types

```typescript
// Shared types from packages
import type { SignalingEvent, ContextItem, FileContextItem } from '@agiworkforce/types';

// Application-specific types
import type { Message, Conversation } from '../types/chat';
import type { Provider } from '../types/provider';
import type { McpServerInfo } from '../types/mcp';
```

## Tauri Command Invocations

### Basic Invocation

```typescript
import { invoke } from '@tauri-apps/api/core';

// Simple command with no parameters
const result = await invoke<string>('get_version');

// Command with parameters
const user = await invoke<User>('get_user', { userId: '123' });
```

### Chat Commands

```typescript
// Send a chat message
interface ChatSendMessageRequest {
  conversationId?: number;
  content: string;
  provider?: string;
  model?: string;
  preferCloudCredits?: boolean;
}

const response = await invoke<ChatSendMessageResponse>('chat_send_message', {
  userId: currentUserId,
  content: 'Hello!',
  conversationId: 123,
  preferCloudCredits: true,
});
```

### LLM Commands

```typescript
// Configure a provider
await invoke('llm_configure_provider', {
  provider: 'ollama',
  apiKey: null,
  baseUrl: 'http://localhost:11434',
});

// Get available models
const models = await invoke<ModelInfo[]>('llm_get_available_models');

// Check provider status
const status = await invoke<ProviderStatus>('llm_check_provider_status', {
  provider: 'ollama',
});
```

### MCP Commands

```typescript
// List MCP servers
const servers = await invoke<McpServerInfo[]>('mcp_list_servers');

// Connect to a server
await invoke('mcp_connect_server', { serverName: 'github' });

// Execute a tool
const result = await invoke<McpToolResult>('mcp_execute_tool', {
  toolId: 'mcp__github__create_issue',
  parameters: {
    title: 'Bug report',
    body: 'Description here',
  },
});

// Store credentials
await invoke('mcp_set_credential', {
  serverName: 'github',
  key: 'token',
  value: 'ghp_xxxxx',
});
```

### File Operations

```typescript
// Read file
const content = await invoke<string>('read_file', {
  path: '/path/to/file.ts',
});

// Write file
await invoke('write_file', {
  path: '/path/to/file.ts',
  content: 'export default function() {}',
});

// List directory
const files = await invoke<string[]>('list_directory', {
  path: '/path/to/directory',
});
```

## Zustand Store Patterns

### Reading State

```typescript
// Read entire state (causes re-render on any change)
const state = useAuthStore();

// Read specific property (only re-renders when that property changes)
const user = useAuthStore((state) => state.user);

// Read computed value
const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

// Multiple properties
const { user, loading } = useAuthStore((state) => ({
  user: state.user,
  loading: state.isLoading,
}));
```

### Using Selectors

```typescript
// Define selector
export const selectUserId = (state: AuthState) => state.user?.id;

// Use selector
const userId = useAuthStore(selectUserId);
```

### Invoking Actions

```typescript
// Sync action
const increment = useCounterStore((state) => state.increment);
increment();

// Or directly
useCounterStore.getState().increment();

// Async action
const { loadSettings } = useSettingsStore();
await loadSettings();

// From outside React
const loadUser = async () => {
  await useAuthStore.getState().signIn('email@example.com', 'password');
};
```

### Subscribing to Changes

```typescript
// Subscribe to specific property
const unsubscribe = useAuthStore.subscribe(
  (state) => state.user,
  (user, previousUser) => {
    console.log('User changed:', user);
  },
);

// Cleanup
unsubscribe();
```

### Waiting for Hydration

```typescript
// Wait for store to hydrate from localStorage
import { waitForAuthReady } from '../stores/authStore';

await waitForAuthReady();
const user = useAuthStore.getState().user;
```

## Common Type Patterns

### Discriminated Unions

```typescript
type Result<T, E> = { success: true; data: T } | { success: false; error: E };

// Usage
const result: Result<User, string> = await fetchUser();
if (result.success) {
  console.log(result.data); // TypeScript knows 'data' exists
} else {
  console.error(result.error); // TypeScript knows 'error' exists
}
```

### Optional Chaining & Nullish Coalescing

```typescript
// Optional chaining
const userName = user?.profile?.name;

// Nullish coalescing
const displayName = user?.name ?? 'Anonymous';

// Combined
const email = user?.email?.toLowerCase() ?? 'no-email@example.com';
```

### Type Guards

```typescript
function isFileContext(item: ContextItem): item is FileContextItem {
  return item.type === 'file';
}

const items: ContextItem[] = getItems();
const files = items.filter(isFileContext); // Type: FileContextItem[]
```

### Generics

```typescript
// Generic function
function first<T>(arr: T[]): T | undefined {
  return arr[0];
}

const num = first([1, 2, 3]); // Type: number | undefined
const str = first(['a', 'b']); // Type: string | undefined

// Generic interface
interface Response<T> {
  data: T;
  status: number;
  message: string;
}

const userResponse: Response<User> = await api.getUser();
```

### Utility Types

```typescript
// Partial - make all properties optional
type PartialUser = Partial<User>;

// Required - make all properties required
type RequiredUser = Required<User>;

// Pick - select specific properties
type UserBasicInfo = Pick<User, 'id' | 'name' | 'email'>;

// Omit - exclude specific properties
type UserWithoutPassword = Omit<User, 'password'>;

// Record - create object type with specific keys
type UserMap = Record<string, User>;

// Readonly - make all properties readonly
type ReadonlyUser = Readonly<User>;
```

### Type Assertions

```typescript
// Use 'as' for type assertions
const input = document.getElementById('input') as HTMLInputElement;

// Use 'as const' for literal types
const config = {
  apiUrl: 'https://api.example.com',
  timeout: 5000,
} as const;
// Type: { readonly apiUrl: 'https://api.example.com'; readonly timeout: 5000 }

// Double assertion (use sparingly)
const value = unknown as any as SomeType;
```

## Context Items

### Creating Context Items

```typescript
// File context
const fileContext: FileContextItem = {
  id: crypto.randomUUID(),
  type: 'file',
  name: 'app.tsx',
  path: '/src/app.tsx',
  content: 'import React...',
  language: 'typescript',
  size: 1024,
  lineCount: 50,
  timestamp: new Date(),
};

// Image context
const imageContext: ImageContextItem = {
  id: crypto.randomUUID(),
  type: 'image',
  name: 'screenshot.png',
  path: '/screenshots/screenshot.png',
  width: 1920,
  height: 1080,
  format: 'png',
  timestamp: new Date(),
};

// Web context
const webContext: WebContextItem = {
  id: crypto.randomUUID(),
  type: 'web',
  name: 'Search results',
  query: 'TypeScript best practices',
  results: [
    {
      title: 'TypeScript Handbook',
      url: 'https://www.typescriptlang.org/docs/',
      snippet: 'The TypeScript Handbook is a comprehensive guide...',
      source: 'typescriptlang.org',
    },
  ],
  timestamp: new Date(),
};
```

### Type Narrowing with Context Items

```typescript
function renderContext(item: ContextItem) {
  switch (item.type) {
    case 'file':
      return <FilePreview path={item.path} content={item.content} />;
    case 'image':
      return <ImagePreview src={item.dataUrl} />;
    case 'web':
      return <WebResults results={item.results} />;
    case 'url':
      return <UrlPreview url={item.url} title={item.title} />;
    case 'code-snippet':
      return <CodeBlock code={item.code} language={item.language} />;
    default:
      return <GenericPreview item={item} />;
  }
}
```

## Event Handling

### Tauri Events

```typescript
import { listen } from '@tauri-apps/api/event';

// Listen to Tauri events
const unlisten = await listen<ChatStreamChunkPayload>('chat:stream:chunk', (event) => {
  console.log('Chunk:', event.payload.delta);
});

// Cleanup
unlisten();

// Listen once
const unlistenOnce = await listen(
  'app:ready',
  () => {
    console.log('App is ready');
  },
  { once: true },
);
```

### Signaling Events

```typescript
import type { SignalingEvent } from '@agiworkforce/types';

function handleSignalingEvent(event: SignalingEvent) {
  switch (event.type) {
    case 'open':
      console.log('Connection opened');
      break;
    case 'registered':
      console.log(`Expires at: ${new Date(event.expiresAt)}`);
      break;
    case 'peer_ready':
      console.log(`Peer ${event.role} is ready`);
      break;
    case 'signal':
      handleSignal(event.from, event.kind, event.payload);
      break;
    case 'error':
      console.error('Error:', event.error);
      break;
  }
}
```

## Error Handling

### Result Type Pattern

```typescript
type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

async function fetchUser(id: string): Promise<Result<User, string>> {
  try {
    const user = await api.getUser(id);
    return { ok: true, value: user };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Usage
const result = await fetchUser('123');
if (result.ok) {
  console.log('User:', result.value);
} else {
  console.error('Error:', result.error);
}
```

### Try-Catch with Type Guards

```typescript
try {
  const data = await riskyOperation();
  processData(data);
} catch (error) {
  if (error instanceof NetworkError) {
    console.error('Network error:', error.message);
  } else if (error instanceof ValidationError) {
    console.error('Validation error:', error.field, error.message);
  } else if (error instanceof Error) {
    console.error('Unknown error:', error.message);
  } else {
    console.error('Unexpected error:', error);
  }
}
```

## React Component Props

### Basic Props

```typescript
interface ButtonProps {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}

function Button({ label, onClick, variant = 'primary', disabled }: ButtonProps) {
  return (
    <button onClick={onClick} disabled={disabled} className={variant}>
      {label}
    </button>
  );
}
```

### Props with Children

```typescript
interface CardProps {
  title: string;
  children: React.ReactNode;
}

function Card({ title, children }: CardProps) {
  return (
    <div>
      <h2>{title}</h2>
      <div>{children}</div>
    </div>
  );
}
```

### Generic Component Props

```typescript
interface ListProps<T> {
  items: T[];
  renderItem: (item: T) => React.ReactNode;
  keyExtractor: (item: T) => string;
}

function List<T>({ items, renderItem, keyExtractor }: ListProps<T>) {
  return (
    <ul>
      {items.map((item) => (
        <li key={keyExtractor(item)}>{renderItem(item)}</li>
      ))}
    </ul>
  );
}

// Usage
<List
  items={users}
  renderItem={(user) => <UserCard user={user} />}
  keyExtractor={(user) => user.id}
/>
```

### Forwarding Refs

```typescript
// React 19: ref is just a prop
interface InputProps {
  ref?: React.Ref<HTMLInputElement>;
  placeholder?: string;
}

function Input({ ref, placeholder }: InputProps) {
  return <input ref={ref} placeholder={placeholder} />;
}

// Usage
const inputRef = useRef<HTMLInputElement>(null);
<Input ref={inputRef} placeholder="Enter text" />
```

## Async Patterns

### Promise Types

```typescript
// Function returning a promise
async function loadData(): Promise<User[]> {
  const response = await fetch('/api/users');
  return response.json();
}

// Promise.all with proper typing
const [users, posts, comments] = await Promise.all([fetchUsers(), fetchPosts(), fetchComments()]);
// Types: [User[], Post[], Comment[]]
```

### Async State in Stores

```typescript
interface DataState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  fetch: () => Promise<void>;
}

const useDataStore = create<DataState<User>>()((set) => ({
  data: null,
  loading: false,
  error: null,

  fetch: async () => {
    set({ loading: true, error: null });
    try {
      const data = await fetchData();
      set({ data, loading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Unknown error',
        loading: false,
      });
    }
  },
}));
```

## Helpful Tips

### Use Type Inference

```typescript
// ❌ Redundant
const message: string = 'Hello';

// ✅ Let TypeScript infer
const message = 'Hello';
```

### Const Assertions

```typescript
// Regular object - mutable properties
const config = {
  api: 'https://api.example.com',
  timeout: 5000,
};
config.api = 'https://other.com'; // OK

// Const assertion - readonly properties
const config = {
  api: 'https://api.example.com',
  timeout: 5000,
} as const;
config.api = 'https://other.com'; // ❌ Error
```

### Satisfies Operator

```typescript
// Ensure type but keep narrow type
const config = {
  apiUrl: 'https://api.example.com',
  timeout: 5000,
  retries: 3,
} satisfies Record<string, string | number>;

// config.timeout is still number (not string | number)
const doubled = config.timeout * 2; // ✅ OK
```

### Non-Null Assertion

```typescript
// Use sparingly - only when you're certain
const user = users.find((u) => u.id === '123')!;
// Asserts that user is not undefined

// Better: handle null case
const user = users.find((u) => u.id === '123');
if (!user) throw new Error('User not found');
// Now user is definitely defined
```

---

**Last Updated**: 2026-01-15
