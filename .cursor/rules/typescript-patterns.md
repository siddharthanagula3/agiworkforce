---
description: "TypeScript patterns for AGI Workforce (React 19, Zustand, Tauri v2)"
globs: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"]
alwaysApply: false
---
# TypeScript/JavaScript Patterns

> Extends the common patterns rule with TypeScript/JavaScript specifics for AGI Workforce.

## API Response Format

```typescript
interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  meta?: {
    total: number
    page: number
    limit: number
  }
}
```

## Custom Hooks Pattern

```typescript
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(handler)
  }, [value, delay])

  return debouncedValue
}
```

## Zustand Store Pattern

```typescript
interface SettingsState {
  theme: 'light' | 'dark'
  setTheme: (theme: 'light' | 'dark') => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    immer((set) => ({
      theme: 'dark',
      setTheme: (theme) => set((state) => { state.theme = theme }),
    })),
    { name: 'settings-storage', version: 10 }
  )
)
```

## Tauri Event Listener Pattern

```typescript
import { listen } from '@/lib/tauri-mock'

useEffect(() => {
  const unlisten = listen('tool:event', (event) => {
    // Handle tool events (Started, Progress, Completed)
  })
  return () => { unlisten.then(fn => fn()) }
}, [])
```

## Repository Pattern

```typescript
interface Repository<T> {
  findAll(filters?: Filters): Promise<T[]>
  findById(id: string): Promise<T | null>
  create(data: CreateDto): Promise<T>
  update(id: string, data: UpdateDto): Promise<T>
  delete(id: string): Promise<void>
}
```
