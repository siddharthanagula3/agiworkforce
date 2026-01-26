# Zustand Store Patterns Guide

> Best practices and patterns for Zustand v5 state management in AGI Workforce

## Table of Contents

- [Store Creation Pattern](#store-creation-pattern)
- [Middleware Stack](#middleware-stack)
- [State Management Patterns](#state-management-patterns)
- [Performance Optimization](#performance-optimization)
- [Testing Stores](#testing-stores)
- [Real-World Examples](#real-world-examples)

## Store Creation Pattern

### Basic Store Template

```typescript
import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector } from 'zustand/middleware';

// 1. Define state interface
interface ExampleState {
  // State properties
  data: string[];
  loading: boolean;
  error: string | null;

  // Sync actions
  setData: (data: string[]) => void;
  clearData: () => void;

  // Async actions
  fetchData: () => Promise<void>;

  // Hydration tracking (for persist middleware)
  _hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;
}

// 2. Create store with type-safe pattern
export const useExampleStore = create<ExampleState>()(
  devtools(
    persist(
      subscribeWithSelector((set, get) => ({
        // Initial state
        data: [],
        loading: false,
        error: null,
        _hasHydrated: false,

        // Sync actions
        setData: (data) => set({ data }),

        clearData: () =>
          set({
            data: [],
            error: null,
          }),

        // Async actions
        fetchData: async () => {
          set({ loading: true, error: null });
          try {
            const response = await fetch('/api/data');
            const data = await response.json();
            set({ data, loading: false });
          } catch (error) {
            set({
              error: error instanceof Error ? error.message : 'Unknown error',
              loading: false,
            });
          }
        },

        // Hydration
        setHasHydrated: (state: boolean) => {
          set({ _hasHydrated: state });
        },
      })),
      {
        name: 'example-storage',
        version: 1,
        partialize: (state) => ({
          data: state.data,
          // Only persist what's needed
        }),
        onRehydrateStorage: () => (state) => {
          if (state) {
            state.setHasHydrated(true);
          }
        },
      },
    ),
    { name: 'ExampleStore', enabled: import.meta.env.DEV },
  ),
);

// 3. Export selectors
export const selectData = (state: ExampleState) => state.data;
export const selectLoading = (state: ExampleState) => state.loading;
export const selectError = (state: ExampleState) => state.error;

// 4. Export hydration helper
export function waitForExampleHydration(): Promise<void> {
  return new Promise((resolve) => {
    const state = useExampleStore.getState();
    if (state._hasHydrated) {
      resolve();
      return;
    }
    const unsub = useExampleStore.subscribe((s) => {
      if (s._hasHydrated) {
        unsub();
        resolve();
      }
    });
  });
}
```

## Middleware Stack

### Understanding Middleware Composition

Middleware is applied **inside-out**:

```typescript
create<State>()(
  devtools(        // Applied last (outermost)
    persist(       // Applied second
      subscribeWithSelector(  // Applied first (innermost)
        (set, get) => ({ ... })
      )
    )
  )
);
```

### Devtools Middleware

```typescript
devtools(
  // ... other middleware
  {
    name: 'StoreName', // Name in Redux DevTools
    enabled: import.meta.env.DEV, // Only in development
  },
);
```

**Benefits:**

- Time-travel debugging
- State inspection
- Action logging

### Persist Middleware

```typescript
persist(
  // ... store implementation
  {
    name: 'storage-key', // localStorage key
    version: 1, // For migrations

    // Control what gets persisted
    partialize: (state) => ({
      user: state.user,
      settings: state.settings,
      // Don't persist loading, error, etc.
    }),

    // Custom storage
    storage: createJSONStorage(() => localStorage),

    // Migration function
    migrate: (persistedState: unknown, version: number) => {
      const state = persistedState as any;
      if (version < 2) {
        // Migrate from v1 to v2
        state.newField = 'default';
      }
      return state as State;
    },

    // Merge strategy
    merge: (persistedState, currentState) => {
      return {
        ...currentState,
        ...persistedState,
        // Custom merge logic
      };
    },

    // Rehydration callback
    onRehydrateStorage: () => (state, error) => {
      if (error) {
        console.error('Hydration error:', error);
      } else if (state) {
        state.setHasHydrated(true);
      }
    },
  },
);
```

### SubscribeWithSelector Middleware

Enables granular subscriptions:

```typescript
// Without subscribeWithSelector
const count = useStore((state) => state.count); // Re-renders on any state change

// With subscribeWithSelector
const count = useStore((state) => state.count); // Only re-renders when count changes

// Subscribe to specific changes
useEffect(() => {
  const unsubscribe = useStore.subscribe(
    (state) => state.count,
    (count, previousCount) => {
      console.log('Count changed:', count, 'was:', previousCount);
    },
  );
  return unsubscribe;
}, []);
```

### Immer Middleware

Simplifies nested state updates:

```typescript
import { immer } from 'zustand/middleware/immer';

interface TodoState {
  todos: Todo[];
  addTodo: (todo: Todo) => void;
  toggleTodo: (id: string) => void;
}

const useTodoStore = create<TodoState>()(
  immer((set) => ({
    todos: [],

    addTodo: (todo) =>
      set((state) => {
        // Immer allows direct mutation
        state.todos.push(todo);
      }),

    toggleTodo: (id) =>
      set((state) => {
        const todo = state.todos.find((t) => t.id === id);
        if (todo) {
          todo.completed = !todo.completed;
        }
      }),
  })),
);
```

## State Management Patterns

### Async State Pattern

```typescript
interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

interface UserState extends AsyncState<User> {
  fetchUser: (id: string) => Promise<void>;
  updateUser: (user: Partial<User>) => Promise<void>;
  clearError: () => void;
}

const useUserStore = create<UserState>()((set, get) => ({
  data: null,
  loading: false,
  error: null,

  fetchUser: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const user = await api.getUser(id);
      set({ data: user, loading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch user',
        loading: false,
      });
    }
  },

  updateUser: async (updates: Partial<User>) => {
    const currentUser = get().data;
    if (!currentUser) return;

    set({ loading: true, error: null });
    try {
      const updated = await api.updateUser(currentUser.id, updates);
      set({ data: updated, loading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to update user',
        loading: false,
      });
    }
  },

  clearError: () => set({ error: null }),
}));
```

### Computed Values

```typescript
interface CartState {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (id: string) => void;

  // Computed properties as methods
  getTotal: () => number;
  getItemCount: () => number;
}

const useCartStore = create<CartState>()((set, get) => ({
  items: [],

  addItem: (item) => set((state) => ({
    items: [...state.items, item]
  })),

  removeItem: (id) => set((state) => ({
    items: state.items.filter(item => item.id !== id)
  })),

  // Computed values
  getTotal: () => {
    return get().items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  },

  getItemCount: () => {
    return get().items.reduce((sum, item) => sum + item.quantity, 0);
  },
}));

// Usage in component
function Cart() {
  const items = useCartStore((state) => state.items);
  const total = useCartStore((state) => state.getTotal());
  const itemCount = useCartStore((state) => state.getItemCount());

  return (
    <div>
      <p>Items: {itemCount}</p>
      <p>Total: ${total.toFixed(2)}</p>
    </div>
  );
}
```

### Store Composition

```typescript
// Compose multiple stores
const useChatStore = create<ChatState>()((set, get) => ({
  messages: [],

  sendMessage: async (content: string) => {
    // Access other stores
    const userId = useAuthStore.getState().user?.id;
    if (!userId) {
      throw new Error('Not authenticated');
    }

    const settings = useSettingsStore.getState();
    const provider = settings.llmConfig.defaultProvider;

    // Send message with combined context
    const response = await invoke('chat_send_message', {
      userId,
      content,
      provider,
    });

    set((state) => ({
      messages: [...state.messages, response.user_message, response.assistant_message],
    }));
  },
}));
```

### Pagination Pattern

```typescript
interface PaginatedState<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  loading: boolean;

  fetchPage: (page: number) => Promise<void>;
  nextPage: () => Promise<void>;
  previousPage: () => Promise<void>;
  reset: () => void;
}

function createPaginatedStore<T>(
  fetchFn: (page: number, pageSize: number) => Promise<{ items: T[]; total: number }>,
) {
  return create<PaginatedState<T>>()((set, get) => ({
    items: [],
    page: 1,
    pageSize: 20,
    total: 0,
    hasMore: true,
    loading: false,

    fetchPage: async (page: number) => {
      set({ loading: true });
      try {
        const { items, total } = await fetchFn(page, get().pageSize);
        set({
          items,
          page,
          total,
          hasMore: page * get().pageSize < total,
          loading: false,
        });
      } catch (error) {
        set({ loading: false });
        throw error;
      }
    },

    nextPage: async () => {
      const { page, hasMore, loading } = get();
      if (hasMore && !loading) {
        await get().fetchPage(page + 1);
      }
    },

    previousPage: async () => {
      const { page, loading } = get();
      if (page > 1 && !loading) {
        await get().fetchPage(page - 1);
      }
    },

    reset: () =>
      set({
        items: [],
        page: 1,
        total: 0,
        hasMore: true,
      }),
  }));
}

// Usage
const useUsersStore = createPaginatedStore<User>(async (page, pageSize) => {
  const response = await api.getUsers({ page, pageSize });
  return {
    items: response.users,
    total: response.total,
  };
});
```

## Performance Optimization

### 1. Selective Subscriptions

```typescript
// ❌ Bad: Re-renders on any state change
const state = useStore();

// ✅ Good: Only re-renders when specific value changes
const count = useStore((state) => state.count);
const user = useStore((state) => state.user);
```

### 2. Shallow Comparison

```typescript
import { shallow } from 'zustand/shallow';

// Multiple values with shallow comparison
const { user, settings } = useStore(
  (state) => ({ user: state.user, settings: state.settings }),
  shallow,
);
```

### 3. Memoized Selectors

```typescript
import { useMemo } from 'react';

// Export selector functions
export const selectUserId = (state: AuthState) => state.user?.id;
export const selectUserName = (state: AuthState) => state.user?.name;

// Use in components
const userId = useAuthStore(selectUserId);
const userName = useAuthStore(selectUserName);

// Computed selector with dependencies
const useFilteredItems = (query: string) => {
  return useItemsStore((state) =>
    state.items.filter((item) => item.name.toLowerCase().includes(query.toLowerCase())),
  );
};
```

### 4. Batched Updates

```typescript
// ❌ Bad: Multiple renders
set({ loading: true });
set({ error: null });
set({ data: null });

// ✅ Good: Single render
set({
  loading: true,
  error: null,
  data: null,
});
```

### 5. Avoid Inline Functions

```typescript
// ❌ Bad: Creates new function on each render
<Button onClick={() => useStore.getState().increment()} />

// ✅ Good: Use selector
const increment = useStore((state) => state.increment);
<Button onClick={increment} />
```

## Testing Stores

### Unit Testing Actions

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useCounterStore } from './counterStore';

describe('CounterStore', () => {
  beforeEach(() => {
    // Reset store before each test
    useCounterStore.setState({
      count: 0,
    });
  });

  it('should increment count', () => {
    const { increment } = useCounterStore.getState();
    increment();
    expect(useCounterStore.getState().count).toBe(1);
  });

  it('should decrement count', () => {
    useCounterStore.setState({ count: 5 });
    const { decrement } = useCounterStore.getState();
    decrement();
    expect(useCounterStore.getState().count).toBe(4);
  });

  it('should reset count', () => {
    useCounterStore.setState({ count: 10 });
    const { reset } = useCounterStore.getState();
    reset();
    expect(useCounterStore.getState().count).toBe(0);
  });
});
```

### Testing Async Actions

```typescript
import { describe, it, expect, vi } from 'vitest';
import { useUserStore } from './userStore';

describe('UserStore async actions', () => {
  it('should fetch user successfully', async () => {
    const mockUser = { id: '1', name: 'John' };
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      json: async () => mockUser,
      ok: true,
    } as Response);

    const { fetchUser } = useUserStore.getState();
    await fetchUser('1');

    const state = useUserStore.getState();
    expect(state.data).toEqual(mockUser);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it('should handle fetch error', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Network error'));

    const { fetchUser } = useUserStore.getState();
    await fetchUser('1');

    const state = useUserStore.getState();
    expect(state.data).toBeNull();
    expect(state.loading).toBe(false);
    expect(state.error).toBe('Network error');
  });
});
```

### Testing with React Components

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useCounterStore } from './counterStore';
import Counter from './Counter';

describe('Counter component', () => {
  it('should display and update count', async () => {
    render(<Counter />);

    const button = screen.getByRole('button', { name: /increment/i });
    const countDisplay = screen.getByText(/count: 0/i);

    expect(countDisplay).toBeInTheDocument();

    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/count: 1/i)).toBeInTheDocument();
    });
  });
});
```

## Real-World Examples

### Auth Store (from AGI Workforce)

```typescript
import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector } from 'zustand/middleware';

interface User {
  id: string;
  email: string;
  name?: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  _hasHydrated: boolean;

  setUser: (user: User | null) => void;
  clearAuth: () => void;
  setHasHydrated: (state: boolean) => void;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  devtools(
    persist(
      subscribeWithSelector((set, get) => ({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
        _hasHydrated: false,

        setUser: (user) =>
          set({
            user,
            isAuthenticated: !!user,
            error: null,
          }),

        clearAuth: () =>
          set({
            user: null,
            isAuthenticated: false,
            error: null,
          }),

        setHasHydrated: (state: boolean) => {
          set({ _hasHydrated: state });
        },

        signIn: async (email: string, password: string) => {
          set({ isLoading: true, error: null });
          try {
            const response = await supabaseAuth.signIn({ email, password });
            if (response.error) {
              set({ error: response.error.message, isLoading: false });
              return { error: response.error.message };
            }
            set({ isLoading: false });
            return { error: null };
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            set({ error: message, isLoading: false });
            return { error: message };
          }
        },

        signOut: async () => {
          set({ isLoading: true });
          try {
            await supabaseAuth.signOut();
            get().clearAuth();
          } finally {
            set({ isLoading: false });
          }
        },
      })),
      {
        name: 'auth-storage',
        partialize: (state) => ({
          user: state.user,
          isAuthenticated: state.isAuthenticated,
        }),
        onRehydrateStorage: () => (state) => {
          if (state) {
            state.setHasHydrated(true);
          }
        },
      },
    ),
    { name: 'AuthStore', enabled: import.meta.env.DEV },
  ),
);

// Selectors
export const selectUser = (state: AuthState) => state.user;
export const selectIsAuthenticated = (state: AuthState) => state.isAuthenticated;
export const selectIsLoading = (state: AuthState) => state.isLoading;

// Wait for hydration
export function waitForAuthReady(): Promise<void> {
  return new Promise((resolve) => {
    const state = useAuthStore.getState();
    if (state._hasHydrated) {
      resolve();
      return;
    }
    const unsub = useAuthStore.subscribe((s) => {
      if (s._hasHydrated) {
        unsub();
        resolve();
      }
    });
  });
}
```

### Settings Store (from AGI Workforce)

See `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/stores/settingsStore.ts` for a complete real-world example with:

- Complex nested state
- Type-safe task routing
- Migration support
- Custom merge logic
- Integration with Tauri commands

---

**Last Updated**: 2026-01-15
**See Also**: [TYPE_SYSTEM.md](./TYPE_SYSTEM.md), [TYPE_QUICK_REFERENCE.md](./TYPE_QUICK_REFERENCE.md)
