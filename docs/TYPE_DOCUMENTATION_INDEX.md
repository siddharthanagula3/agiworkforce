# TypeScript Type System Documentation

> Complete documentation index for the AGI Workforce type system

## Quick Start

New to the project? Start here:

1. **[Type Quick Reference](./TYPE_QUICK_REFERENCE.md)** - Quick lookup for common patterns
2. **[Type System Architecture](./TYPE_SYSTEM.md)** - Understanding the overall structure
3. **[Tauri Types](./TAURI_TYPES.md)** - Bridging Rust and TypeScript
4. **[Zustand Patterns](./ZUSTAND_PATTERNS.md)** - State management patterns

## Documentation Structure

### Core Documentation

#### [TYPE_SYSTEM.md](./TYPE_SYSTEM.md)

Comprehensive guide to the TypeScript type system architecture.

**Topics Covered:**

- Type organization and directory structure
- Shared types package (`@agiworkforce/types`)
- Discriminated unions and type narrowing
- Advanced type utilities (branded types, conditional types, mapped types)
- Template literal types
- Type guards and type safety patterns
- Best practices and anti-patterns

**When to Use:**

- Learning the project's type system architecture
- Understanding how types are organized across the monorepo
- Implementing advanced type patterns
- Contributing new types to the shared package

#### [TYPE_QUICK_REFERENCE.md](./TYPE_QUICK_REFERENCE.md)

Fast reference guide for common type patterns and operations.

**Topics Covered:**

- Importing types from shared packages
- Tauri command invocations with type safety
- Zustand store usage patterns
- Common type patterns (discriminated unions, generics, utilities)
- Context item creation and type narrowing
- Event handling patterns
- Error handling with Result types
- React component props typing

**When to Use:**

- Quick lookup during development
- Copy-paste examples for common patterns
- Reference for correct import syntax
- Finding the right utility type

#### [TAURI_TYPES.md](./TAURI_TYPES.md)

Complete reference for Tauri command type signatures and Rust-TypeScript interop.

**Topics Covered:**

- Naming conventions (snake_case ↔ camelCase)
- Type mappings (Rust → TypeScript)
- Core command patterns (Auth, Chat, LLM, MCP, Files, Settings)
- Type validation patterns
- Error handling with error codes
- Event emission and listening
- Best practices for keeping types in sync

**When to Use:**

- Adding new Tauri commands
- Debugging type mismatches between Rust and TypeScript
- Understanding how FFI types work
- Implementing validation logic
- Working with Tauri events

#### [ZUSTAND_PATTERNS.md](./ZUSTAND_PATTERNS.md)

Best practices and patterns for Zustand v5 state management.

**Topics Covered:**

- Store creation pattern with middleware
- Middleware stack (devtools, persist, subscribeWithSelector, immer)
- State management patterns (async state, computed values, pagination)
- Performance optimization techniques
- Testing stores and components
- Real-world examples from the codebase

**When to Use:**

- Creating a new Zustand store
- Optimizing store performance
- Implementing persistence and hydration
- Testing state management logic
- Understanding middleware composition

### Package Documentation

#### [packages/types/src/signaling.ts](../packages/types/src/signaling.ts)

WebSocket signaling protocol types for real-time peer connections.

**Key Types:**

- `SignalingEvent` - Discriminated union of all signaling events
- `SignalingRole` - Desktop or mobile peer
- `SignalingClientOptions` - Client configuration
- `SignalKind` - WebRTC signal types (offer, answer, ice, control)

**Use Cases:**

- Device pairing (desktop ↔ mobile)
- Real-time synchronization
- WebRTC connection establishment

#### [packages/types/src/context.ts](../packages/types/src/context.ts)

Context item types for enriching AI conversations.

**Key Types:**

- `ContextItem` - Union of all context item types
- `FileContextItem` - File system files
- `ImageContextItem` - Images with OCR
- `WebContextItem` - Web search results
- `UrlContextItem` - Web page content
- `CodeSnippetContextItem` - Code excerpts
- `AutocompleteState` - Context autocomplete UI state

**Use Cases:**

- Adding files to chat context
- Image analysis with vision models
- Web search augmentation
- Code snippet sharing

#### [packages/types/src/prompt-enhancement.ts](../packages/types/src/prompt-enhancement.ts)

AI-powered prompt optimization and intelligent API routing types.

**Key Types:**

- `EnhancedPrompt` - Enhanced prompt with metadata
- `UseCase` - Task categories (Coding, Search, ImageGen, etc.)
- `APIProvider` - Supported LLM providers
- `APIRoute` - Routing decision with fallbacks
- `ProviderCapabilities` - Provider performance profiles

**Use Cases:**

- Prompt optimization
- Intelligent model selection
- Cost and latency optimization
- Provider fallback handling

**Note:** These types are for documentation only. Implementation is in Rust backend.

## Type System Principles

### 1. Type Safety First

```typescript
// ❌ Avoid: any loses all type safety
function process(data: any) {}

// ✅ Prefer: Use generics or unknown
function process<T>(data: T) {}
function process(data: unknown) {}
```

### 2. Discriminated Unions

```typescript
// Type-safe state machines
type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: string }
  | { status: 'error'; error: string };

function render(state: State) {
  switch (state.status) {
    case 'success':
      return state.data; // TypeScript knows 'data' exists
    case 'error':
      return state.error; // TypeScript knows 'error' exists
  }
}
```

### 3. Exhaustive Type Coverage

```typescript
// Use union types exhaustively
type Provider = 'openai' | 'anthropic' | 'google';

function getApiKey(provider: Provider): string {
  switch (provider) {
    case 'openai':
      return process.env.OPENAI_KEY!;
    case 'anthropic':
      return process.env.ANTHROPIC_KEY!;
    case 'google':
      return process.env.GOOGLE_KEY!;
    // TypeScript ensures all cases are handled
  }
}
```

### 4. Type Inference Over Annotation

```typescript
// ❌ Redundant
const message: string = 'Hello';

// ✅ Let TypeScript infer
const message = 'Hello';

// ✅ Use 'as const' for literals
const config = {
  api: 'https://api.example.com',
  timeout: 5000,
} as const;
```

### 5. Branded Types for Domain Modeling

```typescript
// Create nominal types
type UserId = string & { readonly __brand: 'UserId' };
type MessageId = string & { readonly __brand: 'MessageId' };

// Prevents mixing different ID types
function fetchUser(id: UserId) {}
function deleteMessage(id: MessageId) {}

const userId = 'user-123' as UserId;
const messageId = 'msg-456' as MessageId;

fetchUser(userId); // ✅ OK
fetchUser(messageId); // ❌ Type error
```

## Development Workflow

### Adding New Types

1. **Determine Scope:**
   - Shared across apps? → `packages/types/src/`
   - Desktop-only? → `apps/desktop/src/types/`
   - Web-only? → `apps/web/types/`

2. **Add Type Definition:**

   ````typescript
   // packages/types/src/my-feature.ts

   /**
    * Description of the type
    *
    * @example
    * ```typescript
    * const example: MyType = { ... };
    * ```
    */
   export interface MyType {
     /** Field description */
     field: string;
   }
   ````

3. **Export from Index:**

   ```typescript
   // packages/types/src/index.ts
   export * from './my-feature';
   ```

4. **Document in This Guide:**
   - Add to TYPE_SYSTEM.md if introducing new patterns
   - Add to TYPE_QUICK_REFERENCE.md for common usage
   - Add to relevant specialized guide

5. **Update Rust Types (if Tauri command):**

   ```rust
   // apps/desktop/src-tauri/src/sys/commands/my-feature.rs

   #[derive(Serialize, Deserialize)]
   pub struct MyType {
       pub field: String,
   }
   ```

### Keeping Rust and TypeScript in Sync

For Tauri commands:

1. **Define Rust type first**
2. **Create matching TypeScript type**
3. **Use serde aliases for camelCase:**
   ```rust
   #[serde(alias = "myField")]
   pub my_field: String,
   ```
4. **Document both with JSDoc/rustdoc**
5. **Add validation on Rust side**

## Testing Types

### Compile-Time Type Tests

```typescript
// Type assertion tests
const validConfig: Config = {
  api: 'https://api.example.com',
  timeout: 5000,
};

// This should cause a compile error:
// const invalid: Config = {
//   api: 123, // ❌ number not assignable to string
//   timeout: 5000
// };
```

### Runtime Type Guards

```typescript
function isFileContext(item: ContextItem): item is FileContextItem {
  return item.type === 'file';
}

// Usage
const items: ContextItem[] = getItems();
const files = items.filter(isFileContext); // Type: FileContextItem[]
```

## Common Pitfalls

### 1. Overusing `any`

```typescript
// ❌ Bad: Loses type safety
const data: any = await fetchData();
data.thisProbablyDoesntExist(); // No error!

// ✅ Good: Use proper typing
const data: ApiResponse = await fetchData();
data.thisProbablyDoesntExist(); // ❌ Compile error
```

### 2. Ignoring Null/Undefined

```typescript
// ❌ Bad: Runtime error if user is null
const name = user.name;

// ✅ Good: Handle null cases
const name = user?.name ?? 'Anonymous';
```

### 3. Type Assertions Without Validation

```typescript
// ❌ Bad: Unsafe assertion
const input = document.getElementById('input') as HTMLInputElement;

// ✅ Good: Validate before assertion
const element = document.getElementById('input');
if (element instanceof HTMLInputElement) {
  // Safe to use as input
}
```

### 4. Inline Function Props

```typescript
// ❌ Bad: Creates new function every render
<Button onClick={() => handleClick(id)} />

// ✅ Good: Use callback hook or selector
const handleClickMemo = useCallback(() => handleClick(id), [id]);
<Button onClick={handleClickMemo} />
```

## Tools and Resources

### TypeScript Compiler

```bash
# Type check all code
pnpm typecheck:all

# Type check specific app
pnpm --filter @agiworkforce/desktop typecheck
pnpm --filter web typecheck
```

### ESLint Type Rules

Configured in `.eslintrc.cjs`:

- `@typescript-eslint/no-explicit-any` - Warn on `any` usage
- `@typescript-eslint/no-unsafe-assignment` - Prevent unsafe assignments
- `@typescript-eslint/strict-boolean-expressions` - Enforce strict boolean checks

### IDE Integration

- **VS Code:** Install TypeScript extension
- **TypeScript Language Server:** Provides IntelliSense
- **Error highlighting:** Real-time type checking

### External Resources

- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [TypeScript Deep Dive](https://basarat.gitbook.io/typescript/)
- [Type Challenges](https://github.com/type-challenges/type-challenges)
- [Zustand Documentation](https://docs.pmnd.rs/zustand/)
- [Tauri Type System](https://tauri.app/v1/guides/features/command/)

## Contributing

When contributing types:

1. Follow existing patterns in this documentation
2. Add JSDoc comments with examples
3. Keep Rust and TypeScript types in sync
4. Update relevant documentation files
5. Add type tests where appropriate
6. Ensure strict mode compliance

## Version History

- **2026-01-15**: Initial comprehensive documentation
  - Created TYPE_SYSTEM.md
  - Created TYPE_QUICK_REFERENCE.md
  - Created TAURI_TYPES.md
  - Created ZUSTAND_PATTERNS.md
  - Added JSDoc to all shared types

---

**Maintained By**: AGI Workforce Team
**Questions?** See individual guides or CLAUDE.md for project context
