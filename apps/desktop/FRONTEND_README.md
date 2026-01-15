# Frontend Development - Complete Guide

## Overview

Welcome to the AGI Workforce desktop application frontend documentation. This guide provides comprehensive information about the React 19-based frontend architecture, components, and development patterns.

## Documentation Structure

This frontend documentation is organized into several focused guides:

### 1. [FRONTEND_GUIDE.md](./FRONTEND_GUIDE.md)

**Core React 19 patterns, hooks, and development workflow**

Topics covered:

- React 19 new features (useActionState, ref as prop, use hook)
- Zustand v5 state management patterns
- Custom hooks catalog
- Tauri integration patterns
- Performance optimization
- Testing strategies
- Best practices

**When to use**: Starting a new component, implementing state management, or learning React 19 patterns.

---

### 2. [UI_COMPONENTS.md](./UI_COMPONENTS.md)

**Complete catalog of reusable UI components**

Topics covered:

- Base components (Button, Badge, Card, Spinner)
- Form components (Input, Select, Checkbox, Switch)
- Overlay components (Dialog, AlertDialog, Popover, Tooltip)
- Navigation components (Tabs, Accordion, DropdownMenu)
- Feedback components (Toast, Alert, Progress)
- Layout components (ScrollArea, Separator, Table)
- Composition patterns and examples

**When to use**: Building UI, finding a component for specific functionality, or learning component APIs.

---

### 3. [STYLING_GUIDE.md](./STYLING_GUIDE.md)

**Tailwind CSS v4 styling system**

Topics covered:

- CSS-first configuration (no JavaScript config)
- Color system and semantic colors
- Typography and spacing
- Responsive design patterns
- Dark mode implementation
- Animation utilities
- Common utility patterns
- cn() helper function

**When to use**: Styling components, implementing themes, or learning Tailwind CSS v4.

---

### 4. [SPECIALIZED_INTEGRATIONS.md](./SPECIALIZED_INTEGRATIONS.md)

**Advanced library integrations**

Topics covered:

- **xterm.js**: Terminal emulator integration
- **Monaco Editor**: Code editor implementation
- **@xyflow/react**: Node-based workflow editor
- Configuration examples
- Advanced features
- Best practices for each library

**When to use**: Implementing terminal features, code editing, or workflow builders.

---

### 5. [COMPONENT_DOCUMENTATION.md](./COMPONENT_DOCUMENTATION.md)

**Major feature components documentation**

Topics covered:

- UnifiedAgenticChat (main chat interface)
- Terminal components
- Code editor components
- Workflow canvas
- Settings panel
- MCP integration
- File upload components
- Calendar components

**When to use**: Working with major application features or understanding component architecture.

---

## Quick Start

### Prerequisites

```bash
# Node.js 22.12.0+
node --version

# pnpm 9.15.3+
pnpm --version

# Rust (for Tauri)
rustc --version
```

### Installation

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev:desktop

# Run tests
pnpm test

# Type check
pnpm typecheck
```

### Project Structure

```
apps/desktop/
├── src/
│   ├── components/        # React components
│   │   ├── ui/           # Base UI components (Radix + Tailwind)
│   │   ├── UnifiedAgenticChat/  # Main chat interface
│   │   ├── Terminal/     # Terminal components
│   │   ├── Code/         # Code editor components
│   │   ├── Configurator/ # Workflow builder
│   │   └── ...           # Feature-specific components
│   ├── stores/           # Zustand state stores
│   ├── hooks/            # Custom React hooks
│   ├── lib/              # Utility functions
│   ├── styles/           # Global CSS and Tailwind config
│   ├── types/            # TypeScript type definitions
│   ├── providers/        # Context providers
│   └── services/         # API and business logic
├── src-tauri/            # Rust backend
├── e2e/                  # Playwright E2E tests
└── public/               # Static assets
```

## Technology Stack Summary

### Core

- **React 19.2** - UI framework with concurrent features
- **TypeScript 5.9** - Type-safe development
- **Vite 7** - Build tool with SWC compiler
- **Tauri 2.9** - Desktop app framework

### UI & Styling

- **Tailwind CSS v4** - CSS-first utility framework
- **Radix UI** - Headless component primitives
- **Framer Motion** - Animation library
- **Lucide React** - Icon library

### State Management

- **Zustand v5** - Lightweight state management
- **React Hook Form** - Form state management
- **Zod v4** - Schema validation

### Specialized Libraries

- **xterm.js v6** - Terminal emulator
- **Monaco Editor** - Code editor (VS Code)
- **@xyflow/react v12** - Node-based workflows
- **Mermaid v11** - Diagram rendering

## Common Development Tasks

### Creating a New Component

```tsx
// 1. Create component file
// src/components/MyFeature/MyComponent.tsx

import { cn } from '@/lib/utils';

interface MyComponentProps {
  title: string;
  onAction?: () => void;
  className?: string;
}

export function MyComponent({ title, onAction, className }: MyComponentProps) {
  return (
    <div className={cn('p-4 rounded-lg border', className)}>
      <h2 className="text-lg font-semibold">{title}</h2>
      <button
        onClick={onAction}
        className="mt-2 px-4 py-2 bg-primary text-primary-foreground rounded"
      >
        Action
      </button>
    </div>
  );
}

// 2. Create test file
// src/components/MyFeature/__tests__/MyComponent.test.tsx

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MyComponent } from '../MyComponent';

describe('MyComponent', () => {
  it('renders with title', () => {
    render(<MyComponent title="Test Title" />);
    expect(screen.getByText('Test Title')).toBeInTheDocument();
  });

  it('calls onAction when button clicked', () => {
    const handleAction = vi.fn();
    render(<MyComponent title="Test" onAction={handleAction} />);

    fireEvent.click(screen.getByText('Action'));
    expect(handleAction).toHaveBeenCalledTimes(1);
  });
});

// 3. Export from index
// src/components/MyFeature/index.ts

export { MyComponent } from './MyComponent';
```

### Creating a Store

```tsx
// src/stores/myFeatureStore.ts

import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

interface MyFeatureState {
  items: string[];
  loading: boolean;

  addItem: (item: string) => void;
  removeItem: (index: number) => void;
  fetchItems: () => Promise<void>;

  _hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;
}

export const useMyFeatureStore = create<MyFeatureState>()(
  devtools(
    persist(
      subscribeWithSelector(
        immer((set, get) => ({
          items: [],
          loading: false,

          addItem: (item) =>
            set((state) => {
              state.items.push(item);
            }),

          removeItem: (index) =>
            set((state) => {
              state.items.splice(index, 1);
            }),

          fetchItems: async () => {
            set({ loading: true });
            try {
              const items = await invoke<string[]>('fetch_items');
              set({ items, loading: false });
            } catch (error) {
              console.error('Failed to fetch items:', error);
              set({ loading: false });
            }
          },

          _hasHydrated: false,
          setHasHydrated: (state) => set({ _hasHydrated: state }),
        })),
      ),
      {
        name: 'my-feature-store',
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({
          items: state.items,
        }),
        onRehydrateStorage: () => (state) => {
          state?.setHasHydrated(true);
        },
      },
    ),
    { name: 'MyFeatureStore', enabled: import.meta.env.DEV },
  ),
);

// Selectors
export const selectItems = (state: MyFeatureState) => state.items;
export const selectLoading = (state: MyFeatureState) => state.loading;
```

### Creating a Custom Hook

```tsx
// src/hooks/useMyFeature.ts

import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

export function useMyFeature() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await invoke<Data>('fetch_data');
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

// Usage
function MyComponent() {
  const { data, loading, error, refetch } = useMyFeature();

  if (loading) return <Spinner />;
  if (error) return <ErrorDisplay error={error} onRetry={refetch} />;
  if (!data) return <EmptyState />;

  return <div>{data.content}</div>;
}
```

### Invoking Rust Commands

```tsx
import { invoke } from '@tauri-apps/api/core';

// Simple command
async function greet(name: string) {
  const message = await invoke<string>('greet', { name });
  console.log(message);
}

// Command with complex data
async function processData(data: ProcessInput) {
  try {
    const result = await invoke<ProcessOutput>('process_data', {
      input: data,
    });
    return result;
  } catch (error) {
    console.error('Command failed:', error);
    throw error;
  }
}

// Listening to events
import { listen } from '@tauri-apps/api/event';

useEffect(() => {
  let unlisten: (() => void) | null = null;

  const setup = async () => {
    unlisten = await listen<EventPayload>('my-event', (event) => {
      console.log('Event received:', event.payload);
    });
  };

  setup();

  return () => {
    if (unlisten) unlisten();
  };
}, []);
```

## Code Examples

### React 19 Form with useActionState

```tsx
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

function SubmitButton() {
  const { pending } = useFormStatus();
  return <Button disabled={pending}>{pending ? 'Saving...' : 'Save'}</Button>;
}

function MyForm() {
  const [state, action] = useActionState(
    async (prevState, formData) => {
      const name = formData.get('name') as string;
      try {
        await invoke('save_name', { name });
        return { success: true, message: 'Saved successfully!' };
      } catch (error) {
        return { success: false, message: 'Failed to save' };
      }
    },
    { success: false, message: '' },
  );

  return (
    <form action={action} className="space-y-4">
      <Input name="name" placeholder="Enter name" />
      {state.message && (
        <p className={state.success ? 'text-green-600' : 'text-red-600'}>{state.message}</p>
      )}
      <SubmitButton />
    </form>
  );
}
```

### Responsive Layout

```tsx
function ResponsiveLayout() {
  return (
    <div className="flex flex-col lg:flex-row gap-4">
      {/* Sidebar - full width on mobile, fixed width on desktop */}
      <aside className="w-full lg:w-64 border rounded-lg p-4">
        <nav>Navigation</nav>
      </aside>

      {/* Main content - flexible */}
      <main className="flex-1">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((item) => (
            <Card key={item.id}>{item.content}</Card>
          ))}
        </div>
      </main>

      {/* Right panel - hidden on mobile */}
      <aside className="hidden xl:block w-80 border rounded-lg p-4">Additional info</aside>
    </div>
  );
}
```

### Dark Mode Toggle

```tsx
import { useThemeContext } from '@/providers/ThemeProvider';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/Button';

function ThemeToggle() {
  const { theme, setTheme } = useThemeContext();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
    >
      {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </Button>
  );
}
```

## Testing

### Component Test Example

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { MyComponent } from './MyComponent';

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent title="Test" />);
    expect(screen.getByText('Test')).toBeInTheDocument();
  });

  it('handles user interaction', async () => {
    const handleClick = vi.fn();
    render(<MyComponent onAction={handleClick} />);

    await userEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalled();
  });

  it('handles async operations', async () => {
    render(<MyComponent />);

    await waitFor(() => {
      expect(screen.getByText('Loaded')).toBeInTheDocument();
    });
  });
});
```

### E2E Test Example

```ts
// e2e/chat.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Chat Interface', () => {
  test('sends message', async ({ page }) => {
    await page.goto('/');

    // Type message
    await page.getByPlaceholder('Type a message').fill('Hello, AI!');

    // Click send
    await page.getByRole('button', { name: 'Send' }).click();

    // Verify message appears
    await expect(page.getByText('Hello, AI!')).toBeVisible();
  });
});
```

## Debugging

### React DevTools

Install React DevTools browser extension for component inspection and profiling.

### Zustand DevTools

Stores are configured with devtools in development:

```tsx
// Open Redux DevTools in browser
// View store state and actions in real-time
```

### Console Logging

```tsx
// Add debugging logs
console.log('[MyComponent] Rendered with props:', props);

// Group related logs
console.group('Data Processing');
console.log('Input:', input);
console.log('Output:', output);
console.groupEnd();
```

### Error Boundaries

Wrap components in error boundaries for graceful error handling:

```tsx
<ErrorBoundary
  fallback={<ErrorDisplay />}
  onError={(error, errorInfo) => {
    console.error('Error caught:', error, errorInfo);
  }}
>
  <MyComponent />
</ErrorBoundary>
```

## Performance Tips

1. **Use React.memo for expensive components**
2. **Implement virtual scrolling for large lists**
3. **Debounce frequent operations** (search, resize)
4. **Lazy load heavy components**
5. **Use Suspense for async boundaries**
6. **Minimize re-renders with proper dependencies**
7. **Profile with React DevTools**

## Resources

### Official Documentation

- [React 19 Docs](https://react.dev)
- [Zustand Docs](https://docs.pmnd.rs/zustand)
- [Tailwind CSS v4](https://tailwindcss.com)
- [Radix UI](https://www.radix-ui.com)
- [Tauri](https://tauri.app)

### Learning Resources

- [React TypeScript Cheatsheet](https://react-typescript-cheatsheet.netlify.app)
- [Tailwind CSS Playground](https://play.tailwindcss.com)
- [Component Examples](https://ui.shadcn.com)

### Tools

- [React DevTools](https://react.dev/learn/react-developer-tools)
- [Redux DevTools](https://github.com/reduxjs/redux-devtools) (for Zustand)
- [TypeScript Playground](https://www.typescriptlang.org/play)

## Contributing

1. Follow the component structure conventions
2. Write tests for new components
3. Document complex logic
4. Use TypeScript strict mode
5. Follow accessibility guidelines
6. Optimize for performance
7. Keep components focused and reusable

## Getting Help

- Check existing components for patterns
- Review test files for usage examples
- Consult the documentation guides
- Ask in team chat for clarification

---

**Last Updated**: January 2026

**Frontend Version**: React 19.2 with Tauri 2.9
