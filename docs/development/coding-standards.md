# Coding Standards & Patterns

This document outlines the coding standards and common patterns for the AGI Workforce project.

## Technology Stack

- **Frontend**: React 19, TypeScript 5.9, Tailwind CSS v4
- **State Management**: Zustand v5
- **Desktop**: Tauri v2
- **Build**: Vite 7 (Desktop), Next.js 16 (Web)

## React Patterns

### Component Structure

```tsx
// components/Feature/FeatureName.tsx
interface FeatureNameProps {
  id: string;
  onAction?: (id: string) => void;
}

export function FeatureName({ id, onAction }: FeatureNameProps) {
  // 1. Hooks
  const { data } = useData(id);

  // 2. Event Handlers
  const handleClick = () => onAction?.(id);

  // 3. Render
  return <div className="p-4 rounded-lg bg-white dark:bg-zinc-900">{/* Content */}</div>;
}
```

### Hooks

- Name custom hooks `use[Purpose]`.
- Keep business logic in hooks, UI in components.
- Use `useEffect` sparingly; prefer event handlers or derived state.

### React 19 Features

We leverage React 19 features where possible:

- **Ref as Prop**: Use `ref` directly instead of `forwardRef`.
- **Server Actions**: Use `useActionState` for form handling (Web App).
- **useFormStatus**: For pending states in forms.

## State Management (Zustand)

We use **Zustand v5** for global client state.

### Store Pattern

```typescript
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

interface FeatureState {
  items: string[];
  addItem: (item: string) => void;
}

export const useFeatureStore = create<FeatureState>()(
  devtools(
    persist(
      (set) => ({
        items: [],
        addItem: (item) =>
          set((state) => ({
            items: [...state.items, item],
          })),
      }),
      { name: 'feature-store' },
    ),
  ),
);
```

**Guidelines:**

- Use atomic stores for independent features.
- Use selectors to minimize re-renders: `useStore(state => state.value)`.
- Use `persist` middleware for data that should survive reloads.

## TypeScript Guidelines

- **Strict Mode**: Always enabled. No `any` unless absolutely necessary.
- **Interfaces**: Use `interface` for object shapes (props, state).
- **Types**: Use `type` for unions/intersections.
- **Generics**: Use proper generic constraints.

```typescript
// Good
interface User {
  id: string;
  name: string;
}

// Bad
type User = {
  id: string;
  name: string;
};
```

## Naming Conventions

| Entity           | Case            | Example           |
| ---------------- | --------------- | ----------------- |
| Components       | PascalCase      | `UserProfile.tsx` |
| Hooks            | camelCase       | `useAuth.ts`      |
| Utilities        | camelCase       | `formatDate.ts`   |
| Constants        | SCREAMING_SNAKE | `MAX_RETRIES`     |
| Types/Interfaces | PascalCase      | `UserResponse`    |

## File Organization

```
src/
├── components/
│   ├── ui/           # Generic UI components (buttons, inputs)
│   └── features/     # Business logic components
├── hooks/            # Custom hooks
├── lib/              # Utilities and helpers
├── stores/           # Zustand stores
└── types/            # Shared TypeScript definitions
```

## Testing

- **Unit Tests**: Vitest for utility functions.
- **Component Tests**: React Testing Library.
- **E2E**: Playwright (Web) / WebDriverIO (Desktop).

See `docs/testing/README.md` for detailed testing guides.
