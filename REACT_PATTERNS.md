# React Patterns Guide

Comprehensive guide to React patterns used in the AGI Workforce project, including React 19 features, state management, component patterns, and performance optimization strategies.

## Table of Contents

1. [React 19 Patterns](#react-19-patterns)
2. [State Management with Zustand](#state-management-with-zustand)
3. [Custom Hooks Patterns](#custom-hooks-patterns)
4. [Component Composition Patterns](#component-composition-patterns)
5. [Error Boundary Patterns](#error-boundary-patterns)
6. [Form Handling Patterns](#form-handling-patterns)
7. [Performance Optimization](#performance-optimization)
8. [Context Patterns](#context-patterns)
9. [Testing Patterns](#testing-patterns)
10. [Best Practices](#best-practices)

---

## React 19 Patterns

### 1. Ref as Prop (No More forwardRef)

React 19 eliminates the need for `forwardRef` by treating `ref` as a regular prop.

**Before (React 18):**

```tsx
import { forwardRef } from 'react';

const Input = forwardRef<HTMLInputElement, InputProps>((props, ref) => {
  return <input ref={ref} {...props} />;
});
```

**After (React 19):**

```tsx
// ref is just a prop now
interface InputProps {
  ref?: React.Ref<HTMLInputElement>;
  // other props
}

function Input({ ref, ...props }: InputProps) {
  return <input ref={ref} {...props} />;
}
```

### 2. useActionState for Form Handling

Replaces the experimental `useFormState` with better state management for async actions.

```tsx
'use client';

import { useActionState } from 'react';

interface FormState {
  success: boolean;
  message?: string;
  errors?: Record<string, string[]>;
}

function ContactForm() {
  const [state, action, isPending] = useActionState(
    async (prevState: FormState, formData: FormData): Promise<FormState> => {
      try {
        const name = formData.get('name') as string;
        const email = formData.get('email') as string;

        // Validation
        if (!name || !email) {
          return {
            success: false,
            errors: {
              name: !name ? ['Name is required'] : [],
              email: !email ? ['Email is required'] : [],
            },
          };
        }

        // Submit to API
        await fetch('/api/contact', {
          method: 'POST',
          body: JSON.stringify({ name, email }),
        });

        return { success: true, message: 'Form submitted successfully!' };
      } catch (error) {
        return {
          success: false,
          message: 'An error occurred. Please try again.',
        };
      }
    },
    { success: false }, // Initial state
  );

  return (
    <form action={action} className="space-y-4">
      <div>
        <input
          type="text"
          name="name"
          placeholder="Your name"
          disabled={isPending}
          className="w-full px-4 py-2 border rounded"
        />
        {state.errors?.name && <p className="text-red-500 text-sm mt-1">{state.errors.name[0]}</p>}
      </div>

      <div>
        <input
          type="email"
          name="email"
          placeholder="Your email"
          disabled={isPending}
          className="w-full px-4 py-2 border rounded"
        />
        {state.errors?.email && (
          <p className="text-red-500 text-sm mt-1">{state.errors.email[0]}</p>
        )}
      </div>

      {state.message && (
        <p className={state.success ? 'text-green-500' : 'text-red-500'}>{state.message}</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="px-6 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
      >
        {isPending ? 'Submitting...' : 'Submit'}
      </button>
    </form>
  );
}
```

### 3. useFormStatus for Submit Button State

Access form status from nested components without prop drilling.

```tsx
'use client';

import { useFormStatus } from 'react-dom';

function SubmitButton() {
  const { pending, data, method, action } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="px-6 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
    >
      {pending ? (
        <>
          <span className="inline-block animate-spin mr-2">⏳</span>
          Submitting...
        </>
      ) : (
        'Submit'
      )}
    </button>
  );
}

function LoginForm() {
  return (
    <form action="/api/login" method="POST">
      <input type="email" name="email" required />
      <input type="password" name="password" required />
      <SubmitButton />
    </form>
  );
}
```

### 4. Server Components (Next.js 16)

**Example from web app:**

```tsx
// app/dashboard/page.tsx - Server Component
import { getUser, getUsageStats } from '@/lib/services';
import { redirect } from 'next/navigation';
import { ClientDashboard } from './client-dashboard';

export default async function DashboardPage() {
  // Data fetching happens on the server
  const user = await getUser();

  if (!user) {
    redirect('/login');
  }

  const stats = await getUsageStats(user.id);

  // Pass data to client component
  return <ClientDashboard user={user} stats={stats} />;
}
```

### 5. Suspense for Data Fetching

```tsx
import { Suspense } from 'react';

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-8 bg-gray-200 rounded animate-pulse" />
      <div className="h-64 bg-gray-200 rounded animate-pulse" />
    </div>
  );
}

async function DashboardContent() {
  const data = await fetchDashboardData();
  return <div>{/* Dashboard content */}</div>;
}

export default function Dashboard() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent />
    </Suspense>
  );
}
```

---

## State Management with Zustand

### 1. Store Structure (Zustand v5)

**Example from settingsStore.ts:**

```tsx
import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector, createJSONStorage } from 'zustand/middleware';

interface SettingsState {
  theme: 'light' | 'dark' | 'system';
  temperature: number;
  maxTokens: number;

  // Actions
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setTemperature: (temp: number) => void;
  setMaxTokens: (tokens: number) => void;
  loadSettings: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>()(
  devtools(
    persist(
      subscribeWithSelector((set, get) => ({
        // Initial state
        theme: 'system',
        temperature: 0.7,
        maxTokens: 4096,

        // Actions
        setTheme: (theme) => {
          set({ theme });

          // Apply theme to DOM
          if (typeof document !== 'undefined') {
            const root = document.documentElement;
            root.classList.remove('light', 'dark');

            if (theme === 'system') {
              const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
                ? 'dark'
                : 'light';
              root.classList.add(systemTheme);
            } else {
              root.classList.add(theme);
            }
          }
        },

        setTemperature: (temperature) => {
          set({ temperature });
        },

        setMaxTokens: (maxTokens) => {
          set({ maxTokens });
        },

        loadSettings: async () => {
          try {
            const settings = await fetch('/api/settings').then((r) => r.json());
            set(settings);
          } catch (error) {
            console.error('Failed to load settings:', error);
          }
        },
      })),
      {
        name: 'agiworkforce-settings',
        version: 2,
        storage: createJSONStorage(() =>
          typeof window === 'undefined' ? fallbackStorage : window.localStorage,
        ),
        partialize: (state) => ({
          theme: state.theme,
          temperature: state.temperature,
          maxTokens: state.maxTokens,
        }),
        migrate: (persistedState: unknown, version: number) => {
          const state = persistedState as any;

          // Migration from v1 to v2
          if (version < 2) {
            state.maxTokens = state.maxTokens || 4096;
          }

          return state as SettingsState;
        },
      },
    ),
    { name: 'SettingsStore', enabled: import.meta.env.DEV },
  ),
);

// Selectors for optimized subscriptions
export const selectTheme = (state: SettingsState) => state.theme;
export const selectTemperature = (state: SettingsState) => state.temperature;
```

### 2. Using Stores in Components

```tsx
import { useSettingsStore, selectTheme } from '@/stores/settingsStore';

function ThemeToggle() {
  // Subscribe to specific state slice
  const theme = useSettingsStore(selectTheme);
  const setTheme = useSettingsStore((state) => state.setTheme);

  return (
    <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>Toggle Theme</button>
  );
}

// Access store outside React components
function syncSettings() {
  const settings = useSettingsStore.getState();
  console.log('Current theme:', settings.theme);
}
```

### 3. Subscribing to Store Changes

```tsx
import { useEffect } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';

function SettingsSyncer() {
  useEffect(() => {
    // Subscribe to theme changes only
    const unsubscribe = useSettingsStore.subscribe(
      (state) => state.theme,
      (theme) => {
        console.log('Theme changed to:', theme);
        // Sync with backend or perform side effects
      },
    );

    return unsubscribe;
  }, []);

  return null;
}
```

### 4. Store Hydration Pattern

```tsx
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      // ... store definition
      _hasHydrated: false,
      setHasHydrated: (state: boolean) => {
        set({ _hasHydrated: state });
      },
    }),
    {
      name: 'settings-storage',
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.setHasHydrated(true);
        }
      },
    },
  ),
);

// Wait for hydration before using persisted data
export function waitForHydration(): Promise<void> {
  return new Promise((resolve) => {
    const state = useSettingsStore.getState();
    if (state._hasHydrated) {
      resolve();
      return;
    }

    const unsub = useSettingsStore.subscribe((s) => {
      if (s._hasHydrated) {
        unsub();
        resolve();
      }
    });
  });
}
```

---

## Custom Hooks Patterns

### 1. Complex State Management Hook

**Example from useWindowManager.ts:**

```tsx
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { invoke, listen } from '@tauri-apps/api';

export interface WindowState {
  pinned: boolean;
  alwaysOnTop: boolean;
  dock: 'left' | 'right' | null;
  maximized: boolean;
  focused: boolean;
}

export interface WindowActions {
  setPinned: (value: boolean) => Promise<void>;
  togglePinned: () => Promise<void>;
  dock: (position: 'left' | 'right' | null) => Promise<void>;
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
}

export function useWindowManager() {
  const [state, setState] = useState<WindowState>({
    pinned: false,
    alwaysOnTop: false,
    dock: null,
    maximized: false,
    focused: true,
  });

  // Use ref to avoid stale closures
  const stateRef = useRef(state);
  stateRef.current = state;

  // Refresh state from backend
  const refresh = useCallback(async () => {
    try {
      const payload = await invoke<WindowState>('window_get_state');
      setState((current) => ({ ...current, ...payload }));
    } catch (error) {
      console.error('Failed to refresh window state', error);
    }
  }, []);

  // Setup event listeners
  useEffect(() => {
    let isMounted = true;
    const cleaners: Array<() => void> = [];

    const setupListeners = async () => {
      try {
        const stateListener = await listen<WindowState>('window:state', (event) => {
          if (!isMounted) return;
          setState((current) => ({ ...current, ...event.payload }));
        });

        const focusListener = await listen<boolean>('window:focus', (event) => {
          if (!isMounted) return;
          setState((current) => ({ ...current, focused: event.payload }));
        });

        cleaners.push(stateListener, focusListener);
      } catch (error) {
        console.error('Failed to setup listeners:', error);
      }
    };

    void setupListeners();

    return () => {
      isMounted = false;
      cleaners.forEach((unlisten) => unlisten());
    };
  }, []);

  // Actions with optimistic updates
  const setPinned = useCallback(async (value: boolean) => {
    // Optimistic update
    setState((current) => ({ ...current, pinned: value }));

    try {
      await invoke('window_set_pinned', { pinned: value });
    } catch (error) {
      // Rollback on error
      setState((current) => ({ ...current, pinned: !value }));
      console.error('Failed to update pinned state', error);
      throw error;
    }
  }, []);

  const togglePinned = useCallback(async () => {
    await setPinned(!stateRef.current.pinned);
  }, [setPinned]);

  const dock = useCallback(async (position: 'left' | 'right' | null) => {
    try {
      await invoke('window_dock', { position });
    } catch (error) {
      console.error('Failed to dock window', error);
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey || !event.altKey) return;

      if (event.code === 'ArrowLeft') {
        event.preventDefault();
        void dock('left');
      } else if (event.code === 'ArrowRight') {
        event.preventDefault();
        void dock('right');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dock]);

  // Memoize actions object to prevent unnecessary re-renders
  const actions: WindowActions = useMemo(
    () => ({
      setPinned,
      togglePinned,
      dock,
      minimize: async () => {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().minimize();
      },
      toggleMaximize: async () => {
        await invoke('window_toggle_maximize');
      },
    }),
    [setPinned, togglePinned, dock],
  );

  return { state, actions };
}
```

### 2. Keyboard Shortcuts Hook

**Example from useKeyboardShortcuts.ts:**

```tsx
import { useCallback, useEffect, useRef } from 'react';

export interface Modifiers {
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
}

export interface KeyboardShortcut {
  key: string;
  modifiers?: Modifiers;
  action: (event: KeyboardEvent) => void | Promise<void>;
  preventDefault?: boolean;
  stopPropagation?: boolean;
  description?: string;
  enabled?: boolean;
  scope?: string;
}

export interface UseKeyboardShortcutsOptions {
  enabled?: boolean;
  enableOnFormElements?: boolean;
  scope?: string;
}

function modifiersMatch(event: KeyboardEvent, modifiers: Modifiers = {}): boolean {
  return (
    event.ctrlKey === (modifiers.ctrl ?? false) &&
    event.altKey === (modifiers.alt ?? false) &&
    event.shiftKey === (modifiers.shift ?? false) &&
    event.metaKey === (modifiers.meta ?? false)
  );
}

function isFormElement(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;

  const tagName = target.tagName.toLowerCase();
  return (
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    target.isContentEditable
  );
}

export function useKeyboardShortcuts(
  shortcuts: KeyboardShortcut[],
  options: UseKeyboardShortcutsOptions = {},
): void {
  const { enabled = true, enableOnFormElements = false, scope } = options;

  // Use ref to avoid recreating handler on shortcuts changes
  const shortcutsRef = useRef<KeyboardShortcut[]>(shortcuts);
  shortcutsRef.current = shortcuts;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;
      if (!enableOnFormElements && isFormElement(event.target)) return;

      for (const shortcut of shortcutsRef.current) {
        if (shortcut.enabled === false) continue;
        if (scope && shortcut.scope && scope !== shortcut.scope) continue;
        if (event.key !== shortcut.key) continue;
        if (!modifiersMatch(event, shortcut.modifiers)) continue;

        if (shortcut.preventDefault !== false) {
          event.preventDefault();
        }

        if (shortcut.stopPropagation) {
          event.stopPropagation();
        }

        Promise.resolve(shortcut.action(event)).catch((error) => {
          console.error('[Keyboard Shortcut] Action failed:', error);
        });

        break;
      }
    },
    [enabled, enableOnFormElements, scope],
  );

  useEffect(() => {
    if (!enabled) return;

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, handleKeyDown]);
}

// Helper for platform-specific shortcuts
const isMac =
  typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;

export function platformModifiers(options: { shift?: boolean; alt?: boolean }): Modifiers {
  if (isMac) {
    return {
      meta: true,
      shift: options.shift,
      alt: options.alt,
    };
  }

  return {
    ctrl: true,
    shift: options.shift,
    alt: options.alt,
  };
}

// Usage example
function Editor() {
  useKeyboardShortcuts([
    {
      key: 's',
      modifiers: platformModifiers({}),
      action: () => saveDocument(),
      description: 'Save document',
    },
    {
      key: 'z',
      modifiers: platformModifiers({}),
      action: () => undo(),
      description: 'Undo',
    },
    {
      key: 'z',
      modifiers: platformModifiers({ shift: true }),
      action: () => redo(),
      description: 'Redo',
    },
  ]);

  return <div>Editor content</div>;
}
```

### 3. Toast Notification Hook

**Example from useToast.ts:**

```tsx
import { useState, useEffect } from 'react';

interface Toast {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: 'default' | 'success' | 'error' | 'warning';
  duration?: number;
}

interface ToastState {
  toasts: Toast[];
}

type Action =
  | { type: 'ADD_TOAST'; toast: Toast }
  | { type: 'UPDATE_TOAST'; toast: Partial<Toast> }
  | { type: 'DISMISS_TOAST'; toastId?: string }
  | { type: 'REMOVE_TOAST'; toastId?: string };

const listeners: Array<(state: ToastState) => void> = [];
let memoryState: ToastState = { toasts: [] };
let count = 0;

function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
}

function reducer(state: ToastState, action: Action): ToastState {
  switch (action.type) {
    case 'ADD_TOAST':
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, 5), // Max 5 toasts
      };

    case 'UPDATE_TOAST':
      return {
        ...state,
        toasts: state.toasts.map((t) => (t.id === action.toast.id ? { ...t, ...action.toast } : t)),
      };

    case 'DISMISS_TOAST': {
      const { toastId } = action;

      if (toastId) {
        setTimeout(() => {
          dispatch({ type: 'REMOVE_TOAST', toastId });
        }, 300); // Animation duration
      }

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined ? { ...t, open: false } : t,
        ),
      };
    }

    case 'REMOVE_TOAST':
      return {
        ...state,
        toasts: action.toastId ? state.toasts.filter((t) => t.id !== action.toastId) : [],
      };
  }
}

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action);
  listeners.forEach((listener) => listener(memoryState));
}

export function toast(props: Omit<Toast, 'id'>) {
  const id = genId();

  const update = (props: Toast) =>
    dispatch({
      type: 'UPDATE_TOAST',
      toast: { ...props, id },
    });

  const dismiss = () => dispatch({ type: 'DISMISS_TOAST', toastId: id });

  dispatch({
    type: 'ADD_TOAST',
    toast: {
      ...props,
      id,
    },
  });

  return { id, dismiss, update };
}

export function useToast() {
  const [state, setState] = useState<ToastState>(memoryState);

  useEffect(() => {
    listeners.push(setState);
    return () => {
      const index = listeners.indexOf(setState);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  }, []);

  return {
    toasts: state.toasts,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: 'DISMISS_TOAST', toastId }),
  };
}

// Usage
function MyComponent() {
  const { toast } = useToast();

  const handleSave = async () => {
    try {
      await saveData();
      toast({
        title: 'Success',
        description: 'Your data has been saved.',
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save data.',
        variant: 'error',
      });
    }
  };

  return <button onClick={handleSave}>Save</button>;
}
```

---

## Component Composition Patterns

### 1. Compound Components Pattern

```tsx
import { createContext, useContext, useState, ReactNode } from 'react';

// Context for sharing state
interface TabsContextValue {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabs() {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error('Tabs compound components must be used within Tabs');
  }
  return context;
}

// Root component
interface TabsProps {
  defaultTab: string;
  children: ReactNode;
}

export function Tabs({ defaultTab, children }: TabsProps) {
  const [activeTab, setActiveTab] = useState(defaultTab);

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      <div className="tabs">{children}</div>
    </TabsContext.Provider>
  );
}

// Sub-components
interface TabListProps {
  children: ReactNode;
}

Tabs.List = function TabList({ children }: TabListProps) {
  return <div className="flex border-b">{children}</div>;
};

interface TabProps {
  value: string;
  children: ReactNode;
}

Tabs.Tab = function Tab({ value, children }: TabProps) {
  const { activeTab, setActiveTab } = useTabs();

  return (
    <button
      className={`px-4 py-2 ${activeTab === value ? 'border-b-2 border-blue-500' : ''}`}
      onClick={() => setActiveTab(value)}
    >
      {children}
    </button>
  );
};

interface TabPanelProps {
  value: string;
  children: ReactNode;
}

Tabs.Panel = function TabPanel({ value, children }: TabPanelProps) {
  const { activeTab } = useTabs();

  if (activeTab !== value) return null;

  return <div className="p-4">{children}</div>;
};

// Usage
function App() {
  return (
    <Tabs defaultTab="home">
      <Tabs.List>
        <Tabs.Tab value="home">Home</Tabs.Tab>
        <Tabs.Tab value="profile">Profile</Tabs.Tab>
        <Tabs.Tab value="settings">Settings</Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="home">Home content</Tabs.Panel>
      <Tabs.Panel value="profile">Profile content</Tabs.Panel>
      <Tabs.Panel value="settings">Settings content</Tabs.Panel>
    </Tabs>
  );
}
```

### 2. Render Props Pattern

```tsx
interface MouseTrackerProps {
  children: (mouse: { x: number; y: number }) => ReactNode;
}

function MouseTracker({ children }: MouseTrackerProps) {
  const [position, setPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      setPosition({ x: event.clientX, y: event.clientY });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return <>{children(position)}</>;
}

// Usage
function App() {
  return (
    <MouseTracker>
      {(mouse) => (
        <div>
          Mouse position: {mouse.x}, {mouse.y}
        </div>
      )}
    </MouseTracker>
  );
}
```

### 3. Higher-Order Component (HOC) Pattern

```tsx
import { ComponentType } from 'react';

interface WithLoadingProps {
  isLoading: boolean;
}

function withLoading<P extends object>(
  Component: ComponentType<P>,
  LoadingComponent: ComponentType = () => <div>Loading...</div>,
) {
  return function WithLoadingComponent(props: P & WithLoadingProps) {
    const { isLoading, ...restProps } = props;

    if (isLoading) {
      return <LoadingComponent />;
    }

    return <Component {...(restProps as P)} />;
  };
}

// Usage
interface UserProfileProps {
  user: { name: string; email: string };
}

function UserProfile({ user }: UserProfileProps) {
  return (
    <div>
      <h1>{user.name}</h1>
      <p>{user.email}</p>
    </div>
  );
}

const UserProfileWithLoading = withLoading(UserProfile);

function App() {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchUser().then((data) => {
      setUser(data);
      setIsLoading(false);
    });
  }, []);

  return <UserProfileWithLoading user={user} isLoading={isLoading} />;
}
```

### 4. Container/Presentational Pattern

```tsx
// Presentational Component (Pure UI)
interface UserListProps {
  users: Array<{ id: string; name: string; email: string }>;
  onUserClick: (userId: string) => void;
  loading: boolean;
  error: string | null;
}

function UserList({ users, onUserClick, loading, error }: UserListProps) {
  if (loading) {
    return <div>Loading users...</div>;
  }

  if (error) {
    return <div className="text-red-500">Error: {error}</div>;
  }

  return (
    <div className="space-y-2">
      {users.map((user) => (
        <div
          key={user.id}
          className="p-4 border rounded cursor-pointer hover:bg-gray-50"
          onClick={() => onUserClick(user.id)}
        >
          <h3 className="font-bold">{user.name}</h3>
          <p className="text-gray-600">{user.email}</p>
        </div>
      ))}
    </div>
  );
}

// Container Component (Logic)
function UserListContainer() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers()
      .then((data) => {
        setUsers(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const handleUserClick = useCallback((userId: string) => {
    console.log('User clicked:', userId);
    // Navigate or perform action
  }, []);

  return <UserList users={users} onUserClick={handleUserClick} loading={loading} error={error} />;
}
```

---

## Error Boundary Patterns

### Class-Based Error Boundary

**Example from ErrorBoundary.tsx:**

```tsx
import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw, Home, Copy, Send } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorReported: boolean;
  copySuccess: boolean;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorReported: false,
      copySuccess: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    this.setState({
      error,
      errorInfo,
    });

    // Report to error tracking service
    if (!import.meta.env.DEV) {
      this.reportError(error, errorInfo);
    }
  }

  reportError = async (error: Error, errorInfo: ErrorInfo) => {
    try {
      await fetch('/api/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: error.message,
          stack: error.stack,
          componentStack: errorInfo.componentStack,
          timestamp: new Date().toISOString(),
        }),
      });

      this.setState({ errorReported: true });
    } catch (err) {
      console.error('Failed to report error:', err);
    }
  };

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorReported: false,
      copySuccess: false,
    });
  };

  handleReload = () => {
    window.location.reload();
  };

  handleCopyError = async () => {
    if (!this.state.error) return;

    const errorDetails = {
      message: this.state.error.message,
      stack: this.state.error.stack,
      componentStack: this.state.errorInfo?.componentStack,
      timestamp: new Date().toISOString(),
    };

    try {
      await navigator.clipboard.writeText(JSON.stringify(errorDetails, null, 2));
      this.setState({ copySuccess: true });
      setTimeout(() => this.setState({ copySuccess: false }), 2000);
    } catch (err) {
      console.error('Failed to copy error details:', err);
    }
  };

  override render() {
    if (this.state.hasError) {
      // Custom fallback
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div className="flex h-screen w-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
          <div className="mx-4 max-w-lg rounded-lg border border-red-200 bg-white p-8 shadow-lg dark:border-red-800 dark:bg-gray-800">
            <div className="mb-4 flex items-center gap-3">
              <AlertCircle className="h-8 w-8 text-red-500" />
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Something went wrong
              </h1>
            </div>

            <p className="mb-4 text-gray-600 dark:text-gray-300">
              The application encountered an unexpected error. You can try reloading the page or
              resetting the view.
            </p>

            {this.state.errorReported && (
              <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3">
                <p className="text-sm text-green-700">
                  Error report sent successfully. Thank you for helping us improve!
                </p>
              </div>
            )}

            {this.state.error && (
              <details className="mb-6 rounded border border-gray-200 bg-gray-50 p-3">
                <summary className="cursor-pointer font-medium text-gray-700">
                  Error details
                </summary>
                <div className="mt-2 space-y-2">
                  <p className="font-mono text-sm text-red-600">{this.state.error.toString()}</p>
                  {this.state.errorInfo && (
                    <pre className="max-h-48 overflow-auto font-mono text-xs text-gray-600">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  )}
                </div>
              </details>
            )}

            <div className="flex flex-wrap gap-3">
              <button
                onClick={this.handleReset}
                className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
              >
                <Home className="h-4 w-4" />
                Reset View
              </button>

              <button
                onClick={this.handleReload}
                className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-700 hover:bg-gray-50"
              >
                <RefreshCw className="h-4 w-4" />
                Reload Page
              </button>

              <button
                onClick={this.handleCopyError}
                className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-700 hover:bg-gray-50"
              >
                <Copy className="h-4 w-4" />
                {this.state.copySuccess ? 'Copied!' : 'Copy Error'}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
```

### Usage with Nested Boundaries

```tsx
function App() {
  return (
    <ErrorBoundary>
      <Layout>
        <ErrorBoundary fallback={<SidebarError />}>
          <Sidebar />
        </ErrorBoundary>

        <ErrorBoundary fallback={<ContentError />}>
          <MainContent />
        </ErrorBoundary>
      </Layout>
    </ErrorBoundary>
  );
}
```

---

## Form Handling Patterns

### 1. Controlled Form with Validation

```tsx
import { useState, ChangeEvent, FormEvent } from 'react';

interface FormData {
  email: string;
  password: string;
  confirmPassword: string;
}

interface FormErrors {
  email?: string;
  password?: string;
  confirmPassword?: string;
}

function SignupForm() {
  const [formData, setFormData] = useState<FormData>({
    email: '',
    password: '',
    confirmPassword: '',
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);

  const validateField = (name: keyof FormData, value: string): string | undefined => {
    switch (name) {
      case 'email':
        if (!value) return 'Email is required';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          return 'Invalid email format';
        }
        break;

      case 'password':
        if (!value) return 'Password is required';
        if (value.length < 8) return 'Password must be at least 8 characters';
        if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(value)) {
          return 'Password must contain uppercase, lowercase, and number';
        }
        break;

      case 'confirmPassword':
        if (!value) return 'Please confirm password';
        if (value !== formData.password) return 'Passwords do not match';
        break;
    }

    return undefined;
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    setFormData((prev) => ({ ...prev, [name]: value }));

    // Clear error on change
    if (errors[name as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const handleBlur = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const error = validateField(name as keyof FormData, value);

    if (error) {
      setErrors((prev) => ({ ...prev, [name]: error }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    Object.keys(formData).forEach((key) => {
      const error = validateField(key as keyof FormData, formData[key as keyof FormData]);
      if (error) {
        newErrors[key as keyof FormErrors] = error;
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error('Signup failed');
      }

      // Success - redirect or show success message
      window.location.href = '/dashboard';
    } catch (error) {
      setErrors({ email: 'Signup failed. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <input
          type="email"
          name="email"
          placeholder="Email"
          value={formData.email}
          onChange={handleChange}
          onBlur={handleBlur}
          className="w-full px-4 py-2 border rounded"
        />
        {errors.email && <p className="mt-1 text-sm text-red-500">{errors.email}</p>}
      </div>

      <div>
        <input
          type="password"
          name="password"
          placeholder="Password"
          value={formData.password}
          onChange={handleChange}
          onBlur={handleBlur}
          className="w-full px-4 py-2 border rounded"
        />
        {errors.password && <p className="mt-1 text-sm text-red-500">{errors.password}</p>}
      </div>

      <div>
        <input
          type="password"
          name="confirmPassword"
          placeholder="Confirm Password"
          value={formData.confirmPassword}
          onChange={handleChange}
          onBlur={handleBlur}
          className="w-full px-4 py-2 border rounded"
        />
        {errors.confirmPassword && (
          <p className="mt-1 text-sm text-red-500">{errors.confirmPassword}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full px-6 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
      >
        {loading ? 'Signing up...' : 'Sign Up'}
      </button>
    </form>
  );
}
```

### 2. Form with useActionState (React 19)

See the React 19 Patterns section above for comprehensive examples.

---

## Performance Optimization

### 1. React.memo for Component Memoization

```tsx
import { memo } from 'react';

interface UserCardProps {
  user: { id: string; name: string; email: string };
  onEdit: (id: string) => void;
}

// Component will only re-render if props change
const UserCard = memo(function UserCard({ user, onEdit }: UserCardProps) {
  console.log('Rendering UserCard for', user.name);

  return (
    <div className="p-4 border rounded">
      <h3>{user.name}</h3>
      <p>{user.email}</p>
      <button onClick={() => onEdit(user.id)}>Edit</button>
    </div>
  );
});

// Custom comparison function
const UserCardWithCustomCompare = memo(UserCard, (prevProps, nextProps) => {
  // Return true if props are equal (skip re-render)
  return (
    prevProps.user.id === nextProps.user.id &&
    prevProps.user.name === nextProps.user.name &&
    prevProps.user.email === nextProps.user.email
  );
});
```

### 2. useMemo for Expensive Calculations

```tsx
import { useMemo } from 'react';

function UserList({ users, searchTerm }: { users: User[]; searchTerm: string }) {
  // Memoize filtered and sorted users
  const filteredUsers = useMemo(() => {
    console.log('Filtering users...');

    return users
      .filter((user) => user.name.toLowerCase().includes(searchTerm.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [users, searchTerm]); // Only recalculate when users or searchTerm changes

  // Memoize statistics
  const stats = useMemo(() => {
    return {
      total: filteredUsers.length,
      active: filteredUsers.filter((u) => u.active).length,
      inactive: filteredUsers.filter((u) => !u.active).length,
    };
  }, [filteredUsers]);

  return (
    <div>
      <div className="mb-4">
        <p>Total: {stats.total}</p>
        <p>Active: {stats.active}</p>
        <p>Inactive: {stats.inactive}</p>
      </div>

      <div className="space-y-2">
        {filteredUsers.map((user) => (
          <UserCard key={user.id} user={user} />
        ))}
      </div>
    </div>
  );
}
```

### 3. useCallback for Function Memoization

```tsx
import { useCallback, useState } from 'react';

function TodoList() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');

  // Memoize callback to prevent child re-renders
  const handleToggle = useCallback((id: string) => {
    setTodos((prev) =>
      prev.map((todo) => (todo.id === id ? { ...todo, completed: !todo.completed } : todo)),
    );
  }, []); // No dependencies - function never changes

  const handleDelete = useCallback((id: string) => {
    setTodos((prev) => prev.filter((todo) => todo.id !== id));
  }, []);

  const handleFilterChange = useCallback((newFilter: 'all' | 'active' | 'completed') => {
    setFilter(newFilter);
  }, []);

  // This is fine without useCallback - inline functions for JSX
  const filteredTodos = todos.filter((todo) => {
    if (filter === 'active') return !todo.completed;
    if (filter === 'completed') return todo.completed;
    return true;
  });

  return (
    <div>
      <FilterBar filter={filter} onFilterChange={handleFilterChange} />

      <div className="space-y-2">
        {filteredTodos.map((todo) => (
          <TodoItem key={todo.id} todo={todo} onToggle={handleToggle} onDelete={handleDelete} />
        ))}
      </div>
    </div>
  );
}

// Child component with memo
const TodoItem = memo(function TodoItem({
  todo,
  onToggle,
  onDelete,
}: {
  todo: Todo;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  console.log('Rendering TodoItem', todo.id);

  return (
    <div className="flex items-center gap-2 p-2 border rounded">
      <input type="checkbox" checked={todo.completed} onChange={() => onToggle(todo.id)} />
      <span className={todo.completed ? 'line-through' : ''}>{todo.text}</span>
      <button onClick={() => onDelete(todo.id)}>Delete</button>
    </div>
  );
});
```

### 4. Code Splitting with React.lazy

```tsx
import { lazy, Suspense } from 'react';

// Lazy load components
const Dashboard = lazy(() => import('./Dashboard'));
const Settings = lazy(() => import('./Settings'));
const Profile = lazy(() => import('./Profile'));

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center h-screen">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500" />
    </div>
  );
}

function App() {
  const [currentView, setCurrentView] = useState<'dashboard' | 'settings' | 'profile'>('dashboard');

  return (
    <div>
      <nav>
        <button onClick={() => setCurrentView('dashboard')}>Dashboard</button>
        <button onClick={() => setCurrentView('settings')}>Settings</button>
        <button onClick={() => setCurrentView('profile')}>Profile</button>
      </nav>

      <Suspense fallback={<LoadingSpinner />}>
        {currentView === 'dashboard' && <Dashboard />}
        {currentView === 'settings' && <Settings />}
        {currentView === 'profile' && <Profile />}
      </Suspense>
    </div>
  );
}
```

### 5. Virtual Scrolling for Large Lists

```tsx
import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';

interface VirtualListProps {
  items: Array<{ id: string; name: string }>;
}

function VirtualList({ items }: VirtualListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 50, // Estimated item height in pixels
    overscan: 5, // Render 5 extra items above and below viewport
  });

  return (
    <div ref={parentRef} className="h-screen overflow-auto">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const item = items[virtualItem.index];

          return (
            <div
              key={item.id}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`,
              }}
              className="p-4 border-b"
            >
              <h3>{item.name}</h3>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

### 6. Debouncing and Throttling

```tsx
import { useState, useEffect, useCallback } from 'react';

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// Throttle hook
function useThrottle<T>(value: T, interval: number): T {
  const [throttledValue, setThrottledValue] = useState<T>(value);
  const lastExecuted = useRef<number>(Date.now());

  useEffect(() => {
    if (Date.now() >= lastExecuted.current + interval) {
      lastExecuted.current = Date.now();
      setThrottledValue(value);
    } else {
      const timerId = setTimeout(() => {
        lastExecuted.current = Date.now();
        setThrottledValue(value);
      }, interval);

      return () => clearTimeout(timerId);
    }
  }, [value, interval]);

  return throttledValue;
}

// Usage example
function SearchComponent() {
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 500);

  useEffect(() => {
    if (debouncedSearchTerm) {
      // Perform search with debounced value
      fetch(`/api/search?q=${debouncedSearchTerm}`)
        .then((res) => res.json())
        .then((data) => console.log(data));
    }
  }, [debouncedSearchTerm]);

  return (
    <input
      type="text"
      value={searchTerm}
      onChange={(e) => setSearchTerm(e.target.value)}
      placeholder="Search..."
      className="w-full px-4 py-2 border rounded"
    />
  );
}
```

---

## Context Patterns

### 1. Theme Provider

**Example from ThemeProvider.tsx:**

```tsx
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

type Theme = 'dark' | 'light' | 'system';

interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
}

interface ThemeProviderState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const initialState: ThemeProviderState = {
  theme: 'system',
  setTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
  children,
  defaultTheme = 'dark',
  storageKey = 'ui-theme',
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme,
  );

  useEffect(() => {
    const root = window.document.documentElement;

    root.classList.remove('light', 'dark');

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';

      root.classList.add(systemTheme);
      return;
    }

    root.classList.add(theme);
  }, [theme]);

  const value = {
    theme,
    setTheme: (theme: Theme) => {
      localStorage.setItem(storageKey, theme);
      setTheme(theme);
    },
  };

  return <ThemeProviderContext.Provider value={value}>{children}</ThemeProviderContext.Provider>;
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }

  return context;
};
```

### 2. Auth Context

```tsx
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface User {
  id: string;
  email: string;
  name: string;
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if user is already logged in
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/auth/me');
      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    const response = await fetch('/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      throw new Error('Sign in failed');
    }

    const data = await response.json();
    setUser(data.user);
  };

  const signOut = async () => {
    await fetch('/api/auth/signout', { method: 'POST' });
    setUser(null);
  };

  const signUp = async (email: string, password: string, name: string) => {
    const response = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });

    if (!response.ok) {
      throw new Error('Sign up failed');
    }

    const data = await response.json();
    setUser(data.user);
  };

  const value: AuthContextValue = {
    user,
    isLoading,
    isAuthenticated: !!user,
    signIn,
    signOut,
    signUp,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}

// Protected route component
export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    window.location.href = '/login';
    return null;
  }

  return <>{children}</>;
}
```

---

## Testing Patterns

### 1. Component Testing with Vitest

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { UserProfile } from './UserProfile';

describe('UserProfile', () => {
  const mockUser = {
    id: '1',
    name: 'John Doe',
    email: 'john@example.com',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders user information', () => {
    render(<UserProfile user={mockUser} />);

    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('john@example.com')).toBeInTheDocument();
  });

  it('calls onEdit when edit button is clicked', async () => {
    const onEdit = vi.fn();
    render(<UserProfile user={mockUser} onEdit={onEdit} />);

    const editButton = screen.getByRole('button', { name: /edit/i });
    await userEvent.click(editButton);

    expect(onEdit).toHaveBeenCalledWith(mockUser.id);
  });

  it('shows loading state while updating', async () => {
    const onUpdate = vi.fn(() => new Promise((resolve) => setTimeout(resolve, 100)));
    render(<UserProfile user={mockUser} onUpdate={onUpdate} />);

    const updateButton = screen.getByRole('button', { name: /update/i });
    fireEvent.click(updateButton);

    expect(screen.getByText(/updating/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByText(/updating/i)).not.toBeInTheDocument();
    });
  });

  it('handles errors gracefully', async () => {
    const onUpdate = vi.fn(() => Promise.reject(new Error('Update failed')));
    render(<UserProfile user={mockUser} onUpdate={onUpdate} />);

    const updateButton = screen.getByRole('button', { name: /update/i });
    fireEvent.click(updateButton);

    await waitFor(() => {
      expect(screen.getByText(/update failed/i)).toBeInTheDocument();
    });
  });
});
```

### 2. Custom Hook Testing

```tsx
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { useCounter } from './useCounter';

describe('useCounter', () => {
  it('initializes with default value', () => {
    const { result } = renderHook(() => useCounter());
    expect(result.current.count).toBe(0);
  });

  it('initializes with custom value', () => {
    const { result } = renderHook(() => useCounter(10));
    expect(result.current.count).toBe(10);
  });

  it('increments count', () => {
    const { result } = renderHook(() => useCounter());

    act(() => {
      result.current.increment();
    });

    expect(result.current.count).toBe(1);
  });

  it('decrements count', () => {
    const { result } = renderHook(() => useCounter(5));

    act(() => {
      result.current.decrement();
    });

    expect(result.current.count).toBe(4);
  });

  it('resets count', () => {
    const { result } = renderHook(() => useCounter(10));

    act(() => {
      result.current.increment();
      result.current.increment();
    });

    expect(result.current.count).toBe(12);

    act(() => {
      result.current.reset();
    });

    expect(result.current.count).toBe(10);
  });
});
```

### 3. Error Boundary Testing

**Example from ErrorBoundary.test.tsx:**

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from '../ErrorBoundary';

const ThrowError = ({ shouldThrow = false }: { shouldThrow?: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test error');
  }
  return <div>No error</div>;
};

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <div>Test content</div>
      </ErrorBoundary>,
    );

    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('renders error UI when child throws error', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    consoleError.mockRestore();
  });

  it('renders custom fallback when provided', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const fallback = <div>Custom error fallback</div>;

    render(
      <ErrorBoundary fallback={fallback}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Custom error fallback')).toBeInTheDocument();

    consoleError.mockRestore();
  });
});
```

---

## Best Practices

### 1. Component Organization

```
components/
├── ui/                    # Reusable UI components
│   ├── Button.tsx
│   ├── Input.tsx
│   ├── Card.tsx
│   └── index.ts          # Barrel export
├── features/              # Feature-specific components
│   ├── Auth/
│   │   ├── LoginForm.tsx
│   │   ├── SignupForm.tsx
│   │   └── AuthProvider.tsx
│   └── Dashboard/
│       ├── DashboardLayout.tsx
│       ├── Sidebar.tsx
│       └── MainContent.tsx
├── layouts/               # Layout components
│   ├── AppLayout.tsx
│   └── AuthLayout.tsx
└── shared/                # Shared business components
    ├── ErrorBoundary.tsx
    └── LoadingSpinner.tsx
```

### 2. Naming Conventions

```tsx
// Components: PascalCase
function UserProfile() {}
function UserProfileCard() {}

// Hooks: camelCase with 'use' prefix
function useAuth() {}
function useWindowSize() {}

// Event handlers: 'handle' prefix
function handleClick() {}
function handleSubmit() {}
function handleUserUpdate() {}

// Boolean props: 'is' or 'has' prefix
interface Props {
  isLoading: boolean;
  hasError: boolean;
  isDisabled: boolean;
}

// Callback props: 'on' prefix
interface Props {
  onClick: () => void;
  onSubmit: (data: FormData) => void;
  onUserUpdate: (user: User) => void;
}
```

### 3. TypeScript Best Practices

```tsx
// Use interface for props
interface UserCardProps {
  user: User;
  onEdit: (id: string) => void;
  className?: string;
}

// Use type for unions and intersections
type Status = 'idle' | 'loading' | 'success' | 'error';
type UserWithTimestamps = User & { createdAt: Date; updatedAt: Date };

// Avoid inline type definitions
// Bad
function UserCard({ user }: { user: { id: string; name: string } }) {}

// Good
interface User {
  id: string;
  name: string;
}

function UserCard({ user }: { user: User }) {}

// Use discriminated unions for complex state
type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error };

function useAsyncData<T>(fetcher: () => Promise<T>) {
  const [state, setState] = useState<AsyncState<T>>({ status: 'idle' });

  // TypeScript knows the shape based on status
  if (state.status === 'success') {
    console.log(state.data); // TypeScript knows data exists
  }
}
```

### 4. Props Destructuring

```tsx
// Destructure props in function signature
function UserCard({ user, onEdit, className }: UserCardProps) {
  return (
    <div className={className}>
      <h3>{user.name}</h3>
      <button onClick={() => onEdit(user.id)}>Edit</button>
    </div>
  );
}

// Use rest parameters for forwarding props
function Button({ children, className, ...props }: ButtonProps) {
  return (
    <button className={`btn ${className}`} {...props}>
      {children}
    </button>
  );
}
```

### 5. Conditional Rendering

```tsx
// Use early returns for cleaner code
function UserProfile({ userId }: { userId: string }) {
  const { user, isLoading, error } = useUser(userId);

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return <ErrorMessage error={error} />;
  }

  if (!user) {
    return <EmptyState message="User not found" />;
  }

  return (
    <div>
      <h1>{user.name}</h1>
      <p>{user.email}</p>
    </div>
  );
}

// Use ternary for simple conditions
function StatusBadge({ status }: { status: Status }) {
  return <span className={status === 'active' ? 'text-green-500' : 'text-gray-500'}>{status}</span>;
}

// Use && for conditional rendering
function Notification({ message }: { message?: string }) {
  return <div>{message && <div className="notification">{message}</div>}</div>;
}
```

### 6. Key Props in Lists

```tsx
// Always use stable, unique keys
function UserList({ users }: { users: User[] }) {
  return (
    <div>
      {users.map((user) => (
        // Good: Using stable ID
        <UserCard key={user.id} user={user} />
      ))}
    </div>
  );
}

// Avoid using index as key if list can change
// Bad
{
  users.map((user, index) => <UserCard key={index} user={user} />);
}

// If no ID available, use a combination
{
  users.map((user) => <UserCard key={`${user.email}-${user.createdAt}`} user={user} />);
}
```

### 7. Accessibility

```tsx
function AccessibleButton() {
  return (
    <button type="button" aria-label="Close dialog" aria-pressed={false} onClick={handleClick}>
      <span aria-hidden="true">×</span>
    </button>
  );
}

function AccessibleForm() {
  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="email">
        Email
        <input
          id="email"
          type="email"
          name="email"
          required
          aria-required="true"
          aria-invalid={hasError}
          aria-describedby={hasError ? 'email-error' : undefined}
        />
      </label>
      {hasError && (
        <p id="email-error" role="alert" className="text-red-500">
          Please enter a valid email
        </p>
      )}
    </form>
  );
}
```

---

## Conclusion

This guide covers the essential React patterns used in the AGI Workforce project. For more specific examples:

- **Desktop app patterns**: See `/apps/desktop/src/components/`
- **Web app patterns**: See `/apps/web/app/` and `/apps/web/components/`
- **Custom hooks**: See `/apps/desktop/src/hooks/`
- **Zustand stores**: See `/apps/desktop/src/stores/`
- **Tests**: See `__tests__/` directories throughout the codebase

Always prioritize:

- Type safety with TypeScript
- Performance optimization
- Accessibility compliance
- Code maintainability
- Test coverage

For questions or contributions, refer to the main CLAUDE.md file.
