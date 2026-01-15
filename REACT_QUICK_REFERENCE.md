# React Quick Reference Guide

Quick reference for common React patterns and best practices in the AGI Workforce project.

## React 19 Features

### Ref as Prop

```tsx
// No forwardRef needed in React 19
function Input({ ref, ...props }: { ref?: React.Ref<HTMLInputElement> }) {
  return <input ref={ref} {...props} />;
}
```

### useActionState

```tsx
const [state, action, isPending] = useActionState(
  async (prev, formData) => {
    // Handle form submission
    return { success: true };
  },
  { success: false },
);

return <form action={action}>...</form>;
```

### useFormStatus

```tsx
function SubmitButton() {
  const { pending } = useFormStatus();
  return <button disabled={pending}>Submit</button>;
}
```

## Zustand Store Pattern

```tsx
import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector, createJSONStorage } from 'zustand/middleware';

export const useStore = create<State>()(
  devtools(
    persist(
      subscribeWithSelector((set, get) => ({
        // State
        count: 0,

        // Actions
        increment: () => set((state) => ({ count: state.count + 1 })),
        decrement: () => set((state) => ({ count: state.count - 1 })),
      })),
      {
        name: 'store-name',
        storage: createJSONStorage(() => localStorage),
      },
    ),
    { name: 'StoreName', enabled: import.meta.env.DEV },
  ),
);

// Selectors
export const selectCount = (state: State) => state.count;
```

## Custom Hook Template

```tsx
export function useCustomHook(param: string) {
  const [state, setState] = useState<StateType>(initialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Memoized callback
  const handleAction = useCallback(async () => {
    try {
      const result = await performAction();
      setState(result);
    } catch (error) {
      console.error('Action failed:', error);
    }
  }, []);

  // Effect with cleanup
  useEffect(() => {
    let isMounted = true;

    const setup = async () => {
      if (!isMounted) return;
      // Setup logic
    };

    setup();

    return () => {
      isMounted = false;
      // Cleanup logic
    };
  }, []);

  // Memoized value
  const computedValue = useMemo(() => {
    return expensiveCalculation(state);
  }, [state]);

  return { state, handleAction, computedValue };
}
```

## Performance Optimization Checklist

- [ ] Use `React.memo` for expensive components
- [ ] Use `useMemo` for expensive calculations
- [ ] Use `useCallback` for callbacks passed to memoized children
- [ ] Implement code splitting with `React.lazy`
- [ ] Use virtual scrolling for large lists
- [ ] Debounce/throttle user input
- [ ] Optimize bundle size with tree shaking
- [ ] Use Suspense for async data fetching

## Component Patterns Quick Guide

### Compound Components

```tsx
<Tabs defaultTab="home">
  <Tabs.List>
    <Tabs.Tab value="home">Home</Tabs.Tab>
  </Tabs.List>
  <Tabs.Panel value="home">Content</Tabs.Panel>
</Tabs>
```

### Render Props

```tsx
<DataProvider>{(data) => <Display data={data} />}</DataProvider>
```

### Container/Presentational

```tsx
// Container (Logic)
function UserListContainer() {
  const [users, setUsers] = useState([]);
  // ... logic
  return <UserList users={users} />;
}

// Presentational (UI)
function UserList({ users }) {
  return <div>{/* UI only */}</div>;
}
```

## Error Boundary Template

```tsx
class ErrorBoundary extends Component<Props, State> {
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback />;
    }
    return this.props.children;
  }
}
```

## Form Handling Patterns

### Controlled Form

```tsx
function Form() {
  const [data, setData] = useState({ email: '', password: '' });

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await submitForm(data);
  };

  return (
    <form onSubmit={handleSubmit}>
      <input name="email" value={data.email} onChange={handleChange} />
      <input name="password" value={data.password} onChange={handleChange} />
      <button type="submit">Submit</button>
    </form>
  );
}
```

## Context Pattern

```tsx
const Context = createContext<ContextValue | null>(null);

export function Provider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(initialState);

  const value = useMemo(
    () => ({
      state,
      actions: {
        update: (newState) => setState(newState),
      },
    }),
    [state],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useCustomContext() {
  const context = useContext(Context);
  if (!context) throw new Error('Must be used within Provider');
  return context;
}
```

## Testing Checklist

### Component Tests

- [ ] Renders correctly
- [ ] Handles user interactions
- [ ] Shows loading states
- [ ] Displays error states
- [ ] Updates on prop changes
- [ ] Cleanup on unmount

### Hook Tests

- [ ] Initial state correct
- [ ] Actions work correctly
- [ ] Side effects triggered
- [ ] Cleanup executed
- [ ] Error handling works

## Naming Conventions

| Type           | Convention               | Example                 |
| -------------- | ------------------------ | ----------------------- |
| Components     | PascalCase               | `UserProfile`           |
| Hooks          | camelCase with `use`     | `useAuth`               |
| Event handlers | `handle` prefix          | `handleClick`           |
| Boolean props  | `is`/`has` prefix        | `isLoading`, `hasError` |
| Callbacks      | `on` prefix              | `onClick`, `onSubmit`   |
| Files          | PascalCase or kebab-case | `UserProfile.tsx`       |
| Directories    | kebab-case               | `user-profile/`         |

## TypeScript Tips

```tsx
// Interface for props
interface Props {
  user: User;
  onUpdate: (user: User) => void;
}

// Discriminated unions for state
type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error };

// Generic component
function List<T>({ items, renderItem }: { items: T[]; renderItem: (item: T) => ReactNode }) {
  return <div>{items.map(renderItem)}</div>;
}

// Props with children
interface Props {
  children: ReactNode;
  className?: string;
}
```

## Common Pitfalls

### Don't

```tsx
// Don't use inline objects in props (causes re-renders)
<Component style={{ margin: 10 }} />;

// Don't use index as key for dynamic lists
{
  items.map((item, i) => <Item key={i} />);
}

// Don't forget cleanup in useEffect
useEffect(() => {
  const timer = setInterval(() => {}, 1000);
  // Missing: return () => clearInterval(timer);
}, []);

// Don't call hooks conditionally
if (condition) {
  useEffect(() => {}, []); // Wrong!
}
```

### Do

```tsx
// Memoize objects
const style = useMemo(() => ({ margin: 10 }), []);
<Component style={style} />;

// Use stable keys
{
  items.map((item) => <Item key={item.id} />);
}

// Always cleanup
useEffect(() => {
  const timer = setInterval(() => {}, 1000);
  return () => clearInterval(timer);
}, []);

// Hooks at top level only
useEffect(() => {
  if (condition) {
    // Logic here
  }
}, [condition]);
```

## Accessibility Quick Checklist

- [ ] All images have `alt` text
- [ ] Form inputs have associated labels
- [ ] Interactive elements are keyboard accessible
- [ ] Use semantic HTML (`button`, `nav`, `main`, etc.)
- [ ] Color contrast meets WCAG standards
- [ ] Screen reader announcements with `aria-live`
- [ ] Focus management for modals/dialogs
- [ ] Skip links for navigation

## File Organization

```
components/
├── ui/                 # Reusable UI components
│   ├── Button.tsx
│   ├── Input.tsx
│   └── index.ts
├── features/           # Feature-specific components
│   ├── Auth/
│   └── Dashboard/
└── shared/             # Shared components
    └── ErrorBoundary.tsx

hooks/
├── useAuth.ts
├── useWindowManager.ts
└── index.ts

stores/
├── authStore.ts
├── settingsStore.ts
└── index.ts
```

## Environment-Specific Code

```tsx
// Development only
if (import.meta.env.DEV) {
  console.log('Debug info');
}

// Production only
if (import.meta.env.PROD) {
  initAnalytics();
}

// Environment variables
const apiUrl = import.meta.env.VITE_API_URL;
```

## Performance Profiling

```tsx
import { Profiler } from 'react';

function App() {
  const onRenderCallback = (id: string, phase: 'mount' | 'update', actualDuration: number) => {
    console.log(`${id} ${phase} took ${actualDuration}ms`);
  };

  return (
    <Profiler id="App" onRender={onRenderCallback}>
      <YourComponent />
    </Profiler>
  );
}
```

## Useful VSCode Snippets

### React Function Component

```tsx
// Trigger: rfc
function ComponentName() {
  return <div></div>;
}

export default ComponentName;
```

### useState

```tsx
// Trigger: ust
const [state, setState] = useState(initialState);
```

### useEffect

```tsx
// Trigger: uef
useEffect(() => {
  return () => {
    // cleanup
  };
}, []);
```

### Custom Hook

```tsx
// Trigger: uch
export function useCustomHook() {
  const [state, setState] = useState();

  return { state };
}
```

## Resources

- **Full Documentation**: See `REACT_PATTERNS.md`
- **Project Guidelines**: See `CLAUDE.md`
- **Component Examples**: `/apps/desktop/src/components/`
- **Hook Examples**: `/apps/desktop/src/hooks/`
- **Store Examples**: `/apps/desktop/src/stores/`
- **Test Examples**: `__tests__/` directories

---

For detailed explanations and more examples, refer to the comprehensive `REACT_PATTERNS.md` guide.
