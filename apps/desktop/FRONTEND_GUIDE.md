# Frontend Development Guide

## Overview

The AGI Workforce desktop application frontend is built with React 19, TypeScript 5.9, and modern web technologies. This guide covers architectural patterns, best practices, and common development workflows.

## Technology Stack

### Core Framework

- **React 19.2** - Latest React with concurrent features
- **TypeScript 5.9** - Strict mode enabled for type safety
- **Vite 7** - Fast build tool with SWC compiler
- **Tauri 2.9** - Desktop integration layer

### UI & Styling

- **Tailwind CSS v4** - CSS-first configuration (no JS config)
- **Radix UI** - Headless, accessible component primitives
- **Lucide React** - Icon library
- **Class Variance Authority** - Component variant management
- **Framer Motion** - Animation library

### State Management

- **Zustand v5** - Lightweight state management with middleware
- **React Hook Form** - Form state management
- **Zod v4** - Schema validation

### Specialized Libraries

- **xterm.js v6** - Terminal emulator
- **Monaco Editor** - Code editor (VS Code engine)
- **@xyflow/react v12** - Node-based workflow editor
- **Mermaid v11** - Diagram rendering
- **React Markdown** - Markdown rendering with math support

## React 19 Patterns

### 1. Server Actions (Form Handling)

React 19 introduces `useActionState` and `useFormStatus` for simplified form handling:

```tsx
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

function SubmitButton() {
  const { pending } = useFormStatus();
  return <button disabled={pending}>{pending ? 'Submitting...' : 'Submit'}</button>;
}

function MyForm() {
  const [state, action, isPending] = useActionState(
    async (prevState, formData) => {
      const name = formData.get('name') as string;
      // Process form submission
      return { success: true, message: 'Saved!' };
    },
    { success: false, message: '' },
  );

  return (
    <form action={action}>
      <input name="name" />
      <SubmitButton />
      {state.message && <p>{state.message}</p>}
    </form>
  );
}
```

### 2. Ref as Prop (No forwardRef)

React 19 treats `ref` as a regular prop, eliminating the need for `forwardRef`:

```tsx
// React 19: ref is just a prop
interface InputProps {
  ref?: React.Ref<HTMLInputElement>;
  placeholder?: string;
}

function Input({ ref, placeholder, ...props }: InputProps) {
  return <input ref={ref} placeholder={placeholder} {...props} />;
}

// Usage
function Parent() {
  const inputRef = useRef<HTMLInputElement>(null);
  return <Input ref={inputRef} placeholder="Enter text" />;
}
```

### 3. use Hook for Async Data

React 19's `use` hook allows reading promises and context directly:

```tsx
import { use, Suspense } from 'react';

async function fetchUser(id: string) {
  const response = await fetch(`/api/users/${id}`);
  return response.json();
}

function UserProfile({ userPromise }: { userPromise: Promise<User> }) {
  const user = use(userPromise);
  return <div>{user.name}</div>;
}

function App() {
  const userPromise = fetchUser('123');
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <UserProfile userPromise={userPromise} />
    </Suspense>
  );
}
```

### 4. Document Metadata

React 19 supports metadata in components:

```tsx
function Page() {
  return (
    <>
      <title>My Page</title>
      <meta name="description" content="Page description" />
      <div>Page content</div>
    </>
  );
}
```

## Zustand State Management

### Store Architecture

All stores follow Zustand v5 best practices with middleware composition:

```tsx
import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

interface MyState {
  count: number;
  items: string[];
  increment: () => void;
  addItem: (item: string) => void;
  _hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;
}

export const useMyStore = create<MyState>()(
  devtools(
    persist(
      subscribeWithSelector(
        immer((set, get) => ({
          count: 0,
          items: [],

          increment: () =>
            set((state) => {
              state.count++;
            }),

          addItem: (item) =>
            set((state) => {
              state.items.push(item);
            }),

          // Hydration tracking
          _hasHydrated: false,
          setHasHydrated: (state) => set({ _hasHydrated: state }),
        })),
      ),
      {
        name: 'my-store',
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({
          count: state.count,
          items: state.items,
        }),
        onRehydrateStorage: () => (state) => {
          state?.setHasHydrated(true);
        },
      },
    ),
    { name: 'MyStore', enabled: import.meta.env.DEV },
  ),
);

// Selectors for optimized subscriptions
export const selectCount = (state: MyState) => state.count;
export const selectItems = (state: MyState) => state.items;

// Wait for hydration helper
export const waitForHydration = () => {
  return new Promise<void>((resolve) => {
    const unsubscribe = useMyStore.subscribe(
      (state) => state._hasHydrated,
      (hasHydrated) => {
        if (hasHydrated) {
          unsubscribe();
          resolve();
        }
      },
      { fireImmediately: true },
    );
  });
};
```

### Key Store Patterns

#### 1. Middleware Order

```tsx
// Correct order: devtools(persist(subscribeWithSelector(immer(...))))
create<State>()(
  devtools(
    persist(
      subscribeWithSelector(
        immer((set, get) => ({ ... }))
      ),
      { name: 'store-name', storage: createJSONStorage(() => localStorage) }
    ),
    { name: 'StoreName', enabled: import.meta.env.DEV }
  )
);
```

#### 2. Immer for Immutable Updates

```tsx
// With Immer - direct mutation
increment: () => set((state) => {
  state.count++;
}),

// Without Immer - spread syntax
increment: () => set((state) => ({
  count: state.count + 1,
})),
```

#### 3. Selective Subscriptions

```tsx
// Subscribe to specific slice
const count = useMyStore(selectCount);

// Subscribe with equality check
const items = useMyStore(
  (state) => state.items,
  (a, b) => a.length === b.length,
);

// Subscribe outside components
useMyStore.subscribe(
  (state) => state.count,
  (count) => console.log('Count changed:', count),
  { fireImmediately: true },
);
```

## Custom Hooks

### useWindowManager

Manages Tauri window state and operations:

```tsx
import { useWindowManager } from '@/hooks/useWindowManager';

function WindowControls() {
  const { state, actions } = useWindowManager();

  return (
    <div>
      <button onClick={() => actions.minimize()}>Minimize</button>
      <button onClick={() => actions.toggleMaximize()}>
        {state.maximized ? 'Restore' : 'Maximize'}
      </button>
      <button onClick={() => actions.dock('left')}>Dock Left</button>
      {state.pinned && <span>Pinned</span>}
    </div>
  );
}
```

### useTheme

Access and modify theme:

```tsx
import { useThemeContext } from '@/providers/ThemeProvider';

function ThemeToggle() {
  const { theme, setTheme } = useThemeContext();

  return (
    <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>Toggle Theme</button>
  );
}
```

### useKeyboardShortcuts

Register keyboard shortcuts:

```tsx
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

function Editor() {
  useKeyboardShortcuts({
    'Cmd+S': () => saveFile(),
    'Cmd+K': () => openCommandPalette(),
    Esc: () => closeModal(),
  });

  return <div>Editor content</div>;
}
```

## Component Patterns

### 1. Composition with Radix UI

```tsx
import * as Dialog from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';

function MyDialog({ children, open, onOpenChange }: DialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
            'bg-surface-elevated rounded-lg shadow-xl',
            'w-[90vw] max-w-2xl p-6',
          )}
        >
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

### 2. Class Variance Authority (CVA)

```tsx
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input hover:bg-accent hover:text-accent-foreground',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 px-3',
        lg: 'h-11 px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
```

### 3. Error Boundaries

```tsx
import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || <div>Something went wrong</div>;
    }

    return this.props.children;
  }
}
```

### 4. Lazy Loading

```tsx
import { lazy, Suspense } from 'react';
import { Spinner } from '@/components/ui/Spinner';

const HeavyComponent = lazy(() => import('./HeavyComponent'));

function App() {
  return (
    <Suspense fallback={<Spinner size="lg" />}>
      <HeavyComponent />
    </Suspense>
  );
}
```

## Tauri Integration

### Invoking Rust Commands

```tsx
import { invoke } from '@tauri-apps/api/core';

async function readFile(path: string) {
  try {
    const content = await invoke<string>('file_read', { path });
    return content;
  } catch (error) {
    console.error('Failed to read file:', error);
    throw error;
  }
}

function FileViewer({ path }: { path: string }) {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    readFile(path)
      .then(setContent)
      .finally(() => setLoading(false));
  }, [path]);

  if (loading) return <Spinner />;
  return <pre>{content}</pre>;
}
```

### Listening to Events

```tsx
import { listen } from '@tauri-apps/api/event';

function AgentMonitor() {
  const [status, setStatus] = useState<string>('idle');

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    const setup = async () => {
      unlisten = await listen<{ status: string }>('agent:status', (event) => {
        setStatus(event.payload.status);
      });
    };

    setup();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  return <div>Agent Status: {status}</div>;
}
```

## Performance Optimization

### 1. Memoization

```tsx
import { useMemo, useCallback } from 'react';

function ExpensiveComponent({ data }: { data: Item[] }) {
  // Memoize expensive computation
  const processedData = useMemo(() => {
    return data.map((item) => expensiveTransform(item));
  }, [data]);

  // Memoize callbacks
  const handleClick = useCallback((id: string) => {
    console.log('Clicked:', id);
  }, []);

  return (
    <div>
      {processedData.map((item) => (
        <ItemCard key={item.id} item={item} onClick={handleClick} />
      ))}
    </div>
  );
}
```

### 2. Virtual Lists

```tsx
import { FixedSizeList } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';

function VirtualList({ items }: { items: string[] }) {
  const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => (
    <div style={style}>{items[index]}</div>
  );

  return (
    <AutoSizer>
      {({ height, width }) => (
        <FixedSizeList height={height} width={width} itemCount={items.length} itemSize={35}>
          {Row}
        </FixedSizeList>
      )}
    </AutoSizer>
  );
}
```

### 3. Debouncing

```tsx
import { useDebouncedCallback } from 'use-debounce';

function SearchInput() {
  const [query, setQuery] = useState('');

  const debouncedSearch = useDebouncedCallback(async (value: string) => {
    const results = await searchAPI(value);
    setResults(results);
  }, 500);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    debouncedSearch(value);
  };

  return <input value={query} onChange={handleChange} />;
}
```

## Testing

### Component Testing

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  it('renders with text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click me</Button>);

    fireEvent.click(screen.getByText('Click me'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('applies variant styles', () => {
    render(<Button variant="destructive">Delete</Button>);
    const button = screen.getByText('Delete');
    expect(button).toHaveClass('bg-destructive');
  });
});
```

### Hook Testing

```tsx
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useCounter } from './useCounter';

describe('useCounter', () => {
  it('increments counter', () => {
    const { result } = renderHook(() => useCounter());

    expect(result.current.count).toBe(0);

    act(() => {
      result.current.increment();
    });

    expect(result.current.count).toBe(1);
  });
});
```

## Common Patterns

### Loading States

```tsx
function DataLoader() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    fetchData()
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  if (error) return <ErrorMessage error={error} />;
  if (!data) return <EmptyState />;

  return <DataDisplay data={data} />;
}
```

### Modal Management

```tsx
function App() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <button onClick={() => setModalOpen(true)}>Open Modal</button>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modal Title</DialogTitle>
          </DialogHeader>
          <div>Modal content</div>
          <DialogFooter>
            <Button onClick={() => setModalOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

### Form Validation

```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.email('Invalid email address'),
});

type FormData = z.infer<typeof schema>;

function MyForm() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = (data: FormData) => {
    console.log('Valid data:', data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('name')} />
      {errors.name && <span>{errors.name.message}</span>}

      <input {...register('email')} />
      {errors.email && <span>{errors.email.message}</span>}

      <button type="submit">Submit</button>
    </form>
  );
}
```

## Best Practices

1. **Type Safety**: Always use TypeScript with strict mode
2. **Performance**: Use `memo`, `useMemo`, `useCallback` judiciously
3. **Accessibility**: Follow Radix UI patterns for ARIA attributes
4. **Error Handling**: Wrap async operations in try-catch
5. **Code Splitting**: Lazy load heavy components
6. **State Management**: Keep state close to where it's used
7. **Testing**: Write tests for critical user flows
8. **Documentation**: Document complex components and hooks

## Resources

- [React 19 Documentation](https://react.dev)
- [Zustand Documentation](https://docs.pmnd.rs/zustand)
- [Radix UI Documentation](https://www.radix-ui.com)
- [Tailwind CSS v4 Documentation](https://tailwindcss.com)
- [Tauri Documentation](https://tauri.app)
