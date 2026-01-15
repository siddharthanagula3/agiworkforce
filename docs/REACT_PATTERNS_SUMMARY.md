# React Patterns Documentation Summary

This document provides an overview of the React patterns documentation created for the AGI Workforce project.

## Documentation Files

### 1. REACT_PATTERNS.md (Comprehensive Guide)

**Location**: `/REACT_PATTERNS.md`
**Size**: 2,527 lines
**Purpose**: In-depth guide with complete examples and explanations

**Sections**:

1. **React 19 Patterns** - New features including ref as prop, useActionState, useFormStatus, Server Components
2. **State Management with Zustand** - Store structure, selectors, subscriptions, hydration patterns
3. **Custom Hooks Patterns** - Complex state management, keyboard shortcuts, toast notifications
4. **Component Composition Patterns** - Compound components, render props, HOCs, container/presentational
5. **Error Boundary Patterns** - Class-based error boundaries with full implementation
6. **Form Handling Patterns** - Controlled forms, validation, React 19 form actions
7. **Performance Optimization** - React.memo, useMemo, useCallback, code splitting, virtual scrolling
8. **Context Patterns** - Theme provider, auth context, provider patterns
9. **Testing Patterns** - Component testing, hook testing, error boundary testing
10. **Best Practices** - Naming conventions, TypeScript, accessibility, file organization

### 2. REACT_QUICK_REFERENCE.md (Quick Reference)

**Location**: `/REACT_QUICK_REFERENCE.md`
**Purpose**: Fast lookup for common patterns and snippets

**Contents**:

- Quick code snippets for all major patterns
- Performance optimization checklist
- Testing checklist
- Naming conventions table
- Common pitfalls and solutions
- Accessibility checklist
- File organization structure
- VSCode snippets

## Key Patterns Documented

### React 19 Features (Used in Web App)

#### 1. Ref as Prop

- Eliminates need for `forwardRef`
- Cleaner component code
- Example location: Web app components

#### 2. useActionState

- Form handling with server actions
- Built-in pending state
- Example: `/apps/web/app/login/page.tsx`

#### 3. useFormStatus

- Access form status in nested components
- No prop drilling needed
- Works with form actions

#### 4. Server Components

- Data fetching on server
- Reduced client bundle
- Example: `/apps/web/app/dashboard/page.tsx`

### Zustand v5 Patterns (Used in Desktop App)

#### Store Structure

```tsx
// Middleware composition pattern
create<State>()(
  devtools(
    persist(
      subscribeWithSelector((set, get) => ({
        // state and actions
      })),
      {
        /* persist config */
      },
    ),
    {
      /* devtools config */
    },
  ),
);
```

**Key Features**:

- Type-safe with TypeScript
- Persist to localStorage
- DevTools integration (dev only)
- Selective subscriptions
- Migration support

**Example Implementation**: `/apps/desktop/src/stores/settingsStore.ts`

### Custom Hooks Patterns

#### 1. Window Manager Hook

**Location**: `/apps/desktop/src/hooks/useWindowManager.ts`
**Features**:

- Complex state management
- Tauri integration
- Event listeners with cleanup
- Optimistic updates
- Keyboard shortcuts

#### 2. Keyboard Shortcuts Hook

**Location**: `/apps/desktop/src/hooks/useKeyboardShortcuts.ts`
**Features**:

- Multiple shortcuts registration
- Platform-specific modifiers
- Form element handling
- Scope management
- Global registry

#### 3. Toast Hook

**Location**: `/apps/desktop/src/hooks/useToast.ts`
**Features**:

- External state management
- Auto-dismiss
- Update/dismiss functionality
- Multiple toast variants

### Component Composition Patterns

#### 1. Compound Components

- Shared context between components
- Flexible API
- Example: Tabs component

#### 2. Render Props

- Share logic via function
- Flexible rendering
- Example: Mouse tracker

#### 3. Container/Presentational

- Separate logic from UI
- Easier testing
- Better reusability

### Error Boundary Pattern

**Location**: `/apps/desktop/src/components/ErrorBoundary.tsx`

**Features**:

- Catches React errors
- Reports to error service
- Copy error details
- Reset/reload functionality
- Custom fallback support

**Test Coverage**: `/apps/desktop/src/components/__tests__/ErrorBoundary.test.tsx`

### Performance Optimization Strategies

#### 1. Memoization

- `React.memo` for component memoization
- `useMemo` for expensive calculations
- `useCallback` for function memoization

#### 2. Code Splitting

- `React.lazy` for component lazy loading
- `Suspense` for loading states
- Route-based splitting

#### 3. Virtual Scrolling

- Only render visible items
- Smooth scrolling performance
- Large list handling

#### 4. Debouncing/Throttling

- Custom hooks for input debouncing
- Throttle for scroll events
- Performance improvement

### Context Patterns

#### Theme Provider

**Location**: `/apps/desktop/src/providers/ThemeProvider.tsx`
**Features**:

- Theme persistence
- System preference detection
- DOM class management

#### Auth Context (Example)

**Features**:

- User state management
- Auth actions (sign in/out/up)
- Protected routes
- Loading states

### Testing Patterns

#### Component Testing

- Render tests
- User interaction tests
- Loading/error state tests
- Async action tests

#### Hook Testing

- `renderHook` utility
- `act` for state updates
- Cleanup verification
- Error handling tests

#### Error Boundary Testing

- Error catching verification
- Fallback rendering
- Error reporting
- User actions (reset, reload, copy)

## Project-Specific Implementations

### Desktop App (Tauri + React)

**Technology Stack**:

- React 19.2
- Zustand v5 for state management
- Vite 7 build system
- TypeScript 5.9
- Tailwind CSS v4

**Key Files**:

- Stores: `/apps/desktop/src/stores/`
- Hooks: `/apps/desktop/src/hooks/`
- Components: `/apps/desktop/src/components/`
- Tests: Various `__tests__/` directories

**Patterns Used**:

- Zustand stores for global state
- Custom hooks for Tauri integration
- Error boundaries for error handling
- Performance optimization throughout

### Web App (Next.js 16)

**Technology Stack**:

- Next.js 16 with React 19
- Server Components
- React Query v5
- Tailwind CSS v4

**Key Files**:

- Pages: `/apps/web/app/`
- Components: `/apps/web/components/`
- Tests: `/apps/web/__tests__/`

**Patterns Used**:

- Server Components for data fetching
- useActionState for forms
- Client components for interactivity
- React Query for client-side data

## Code Examples Locations

### Real Project Examples

1. **Zustand Store**: `/apps/desktop/src/stores/settingsStore.ts` (536 lines)
2. **Complex Hook**: `/apps/desktop/src/hooks/useWindowManager.ts` (264 lines)
3. **Keyboard Shortcuts**: `/apps/desktop/src/hooks/useKeyboardShortcuts.ts` (207 lines)
4. **Error Boundary**: `/apps/desktop/src/components/ErrorBoundary.tsx` (225 lines)
5. **Theme Provider**: `/apps/desktop/src/providers/ThemeProvider.tsx` (72 lines)
6. **Toast Hook**: `/apps/desktop/src/hooks/useToast.ts` (182 lines)
7. **Login Form**: `/apps/web/app/login/page.tsx` (225 lines)
8. **Signup Form**: `/apps/web/app/signup/page.tsx` (351 lines)

### Test Examples

1. **Error Boundary Tests**: `/apps/desktop/src/components/__tests__/ErrorBoundary.test.tsx` (361 lines)
2. **Window Manager Tests**: `/apps/desktop/src/hooks/__tests__/useWindowManager.test.ts`
3. **Prompt Suggestions Tests**: `/apps/desktop/src/hooks/__tests__/usePromptSuggestions.test.ts`

## Best Practices Summary

### Component Organization

```
components/
├── ui/                 # Reusable UI components
├── features/           # Feature-specific components
├── layouts/            # Layout components
└── shared/             # Shared business components
```

### Naming Conventions

- Components: `PascalCase`
- Hooks: `useCamelCase`
- Event handlers: `handleEventName`
- Boolean props: `isCondition`, `hasCondition`
- Callbacks: `onEventName`

### TypeScript Best Practices

- Use `interface` for props
- Use `type` for unions/intersections
- Avoid inline type definitions
- Use discriminated unions for complex state
- Proper generic typing

### Performance Checklist

- [ ] Use React.memo for expensive components
- [ ] Use useMemo for expensive calculations
- [ ] Use useCallback for callbacks to memoized children
- [ ] Implement code splitting
- [ ] Use virtual scrolling for large lists
- [ ] Debounce/throttle user input
- [ ] Optimize bundle size

### Accessibility Checklist

- [ ] Images have alt text
- [ ] Form inputs have labels
- [ ] Keyboard accessible
- [ ] Semantic HTML
- [ ] Color contrast compliant
- [ ] Screen reader support
- [ ] Focus management

## Using the Documentation

### For New Features

1. Check REACT_QUICK_REFERENCE.md for pattern templates
2. Review REACT_PATTERNS.md for detailed explanations
3. Look at real examples in the codebase
4. Follow TypeScript and naming conventions
5. Add tests following testing patterns

### For Code Review

1. Verify patterns match documentation
2. Check naming conventions
3. Ensure TypeScript types are correct
4. Verify accessibility compliance
5. Check test coverage

### For Debugging

1. Check Error Boundary implementation
2. Review store subscriptions (Zustand)
3. Verify useEffect cleanup
4. Check for stale closures
5. Review performance optimizations

### For Learning

1. Start with REACT_QUICK_REFERENCE.md
2. Read relevant sections in REACT_PATTERNS.md
3. Study real examples in codebase
4. Look at test files for usage
5. Experiment with patterns

## Migration Notes

### From Class Components

- Convert to function components
- Replace `componentDidMount` with `useEffect`
- Replace `componentDidUpdate` with `useEffect` with dependencies
- Replace `componentWillUnmount` with `useEffect` cleanup
- Replace state with `useState`

### From React 18 to React 19

- Remove `forwardRef` usage
- Replace `useFormState` with `useActionState`
- Consider Server Components for data fetching
- Use `useFormStatus` for form pending states

### Zustand v4 to v5

- Update middleware composition order
- Use `createJSONStorage` for persist
- Add `subscribeWithSelector` for selective subscriptions
- Update TypeScript types

## Performance Monitoring

### React DevTools Profiler

1. Enable profiler in DevTools
2. Record interaction
3. Review render times
4. Identify unnecessary renders
5. Apply optimization patterns

### Bundle Analysis

```bash
# Desktop app
pnpm --filter @agiworkforce/desktop build

# Web app
pnpm --filter web build
```

## Additional Resources

### Official Documentation

- [React 19 Docs](https://react.dev/)
- [Next.js 16 Docs](https://nextjs.org/docs)
- [Zustand Docs](https://docs.pmnd.rs/zustand/)
- [Tauri Docs](https://v2.tauri.app/)

### Project Documentation

- Main project guide: `/CLAUDE.md`
- React patterns guide: `/REACT_PATTERNS.md`
- Quick reference: `/REACT_QUICK_REFERENCE.md`
- Testing guide: See CLAUDE.md testing section

### Code Locations

- Desktop source: `/apps/desktop/src/`
- Web source: `/apps/web/`
- Shared types: `/packages/types/`
- Shared utils: `/packages/utils/`

## Contributing

When adding new patterns:

1. Document in REACT_PATTERNS.md with full examples
2. Add quick reference in REACT_QUICK_REFERENCE.md
3. Include TypeScript types
4. Add tests demonstrating usage
5. Update this summary if adding major patterns

## Questions and Support

For questions about React patterns:

1. Check REACT_QUICK_REFERENCE.md first
2. Read detailed explanation in REACT_PATTERNS.md
3. Look for similar patterns in codebase
4. Review test files for usage examples
5. Refer to official React/Next.js/Zustand docs

---

**Last Updated**: 2026-01-15
**Documentation Version**: 1.0.0
**Project**: AGI Workforce
