---
description: "TypeScript coding style for AGI Workforce (React 19 + Vite + Tailwind 4)"
globs: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"]
alwaysApply: false
---
# TypeScript/JavaScript Coding Style

> Extends the common coding style rule with TypeScript/JavaScript specifics for AGI Workforce.

## Immutability

Use spread operator and Immer for immutable updates:

```typescript
// WRONG: Mutation
function updateUser(user, name) {
  user.name = name  // MUTATION!
  return user
}

// CORRECT: Immutability
function updateUser(user, name) {
  return {
    ...user,
    name
  }
}

// CORRECT: Zustand + Immer (used in stores)
set(produce(state => {
  state.settings.theme = 'dark'
}))
```

## Error Handling

Use async/await with try-catch:

```typescript
try {
  const result = await invoke('command_name', { paramKey: value })
  return result
} catch (error) {
  console.error('Operation failed:', error)
  throw new Error('Detailed user-friendly message')
}
```

## Input Validation

Use Zod for schema-based validation:

```typescript
import { z } from 'zod'

const schema = z.object({
  email: z.string().email(),
  age: z.number().int().min(0).max(150)
})

const validated = schema.parse(input)
```

## Console.log

- No `console.log` statements in production code
- Use proper logging or toast notifications instead
- Hooks will warn about console.log in edited files

## React Conventions

- Functional components only
- Tailwind CSS 4 for styling
- Radix UI primitives for accessible components
- Lucide icons for iconography
- Sonner for toast notifications
- Named exports preferred
- Absolute imports from `src/`

## Tauri IPC

```typescript
// CORRECT: camelCase params
await invoke('get_conversation', { conversationId: id })

// WRONG: snake_case params (silently fails!)
await invoke('get_conversation', { conversation_id: id })
```

## State Management

- Zustand v5 + Immer + Persist middleware
- Settings persist to localStorage with migration support
- Use interfaces for store types
- Strict TypeScript mode
