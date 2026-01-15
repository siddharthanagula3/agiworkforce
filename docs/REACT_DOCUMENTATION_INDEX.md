# React Documentation Index

Complete index of React patterns and best practices documentation for the AGI Workforce project.

## 📚 Documentation Files

### Primary Documentation

#### 1. REACT_PATTERNS.md

**Location**: `/REACT_PATTERNS.md`
**Size**: 60 KB (2,527 lines)
**Level**: Comprehensive

**What's Inside**:

- Detailed explanations of all patterns
- Complete code examples with context
- Real-world usage scenarios
- TypeScript implementations
- Testing strategies for each pattern

**Best For**:

- Learning new patterns in depth
- Understanding why patterns work
- Implementing complex features
- Reference during code reviews

#### 2. REACT_QUICK_REFERENCE.md

**Location**: `/REACT_QUICK_REFERENCE.md`
**Size**: 9.5 KB
**Level**: Quick Reference

**What's Inside**:

- Code snippets ready to copy
- Checklists and tables
- Common pitfalls and solutions
- Quick pattern lookups
- VSCode snippets

**Best For**:

- Quick lookups during coding
- Remembering syntax
- Checking conventions
- Fast problem solving

#### 3. REACT_PATTERNS_SUMMARY.md

**Location**: `/docs/REACT_PATTERNS_SUMMARY.md`
**Size**: 11 KB
**Level**: Overview

**What's Inside**:

- Documentation overview
- Pattern catalog
- Project-specific implementations
- Code example locations
- Best practices summary

**Best For**:

- Getting started with documentation
- Finding specific patterns
- Understanding structure
- Navigating to examples

## 🗂️ Documentation Structure

```
agiworkforce/
├── REACT_PATTERNS.md              # Comprehensive guide (60 KB)
├── REACT_QUICK_REFERENCE.md       # Quick reference (9.5 KB)
└── docs/
    ├── REACT_PATTERNS_SUMMARY.md  # Summary & index (11 KB)
    └── REACT_DOCUMENTATION_INDEX.md  # This file
```

## 🎯 Quick Navigation

### By Topic

#### React 19 Features

- **Full Guide**: REACT_PATTERNS.md → React 19 Patterns
- **Quick Ref**: REACT_QUICK_REFERENCE.md → React 19 Features
- **Examples**: `/apps/web/app/` (Next.js 16 with React 19)

#### State Management (Zustand v5)

- **Full Guide**: REACT_PATTERNS.md → State Management with Zustand
- **Quick Ref**: REACT_QUICK_REFERENCE.md → Zustand Store Pattern
- **Examples**: `/apps/desktop/src/stores/settingsStore.ts`
- **Also See**: `/docs/ZUSTAND_PATTERNS.md` (existing doc)

#### Custom Hooks

- **Full Guide**: REACT_PATTERNS.md → Custom Hooks Patterns
- **Quick Ref**: REACT_QUICK_REFERENCE.md → Custom Hook Template
- **Examples**: `/apps/desktop/src/hooks/`

#### Component Patterns

- **Full Guide**: REACT_PATTERNS.md → Component Composition Patterns
- **Quick Ref**: REACT_QUICK_REFERENCE.md → Component Patterns Quick Guide
- **Examples**: Throughout `/apps/desktop/src/components/`

#### Error Handling

- **Full Guide**: REACT_PATTERNS.md → Error Boundary Patterns
- **Quick Ref**: REACT_QUICK_REFERENCE.md → Error Boundary Template
- **Implementation**: `/apps/desktop/src/components/ErrorBoundary.tsx`
- **Tests**: `/apps/desktop/src/components/__tests__/ErrorBoundary.test.tsx`

#### Forms

- **Full Guide**: REACT_PATTERNS.md → Form Handling Patterns
- **Quick Ref**: REACT_QUICK_REFERENCE.md → Form Handling Patterns
- **Examples**: `/apps/web/app/login/page.tsx`, `/apps/web/app/signup/page.tsx`

#### Performance

- **Full Guide**: REACT_PATTERNS.md → Performance Optimization
- **Quick Ref**: REACT_QUICK_REFERENCE.md → Performance Optimization Checklist
- **Examples**: Memoization throughout components

#### Context & Providers

- **Full Guide**: REACT_PATTERNS.md → Context Patterns
- **Quick Ref**: REACT_QUICK_REFERENCE.md → Context Pattern
- **Examples**: `/apps/desktop/src/providers/ThemeProvider.tsx`

#### Testing

- **Full Guide**: REACT_PATTERNS.md → Testing Patterns
- **Quick Ref**: REACT_QUICK_REFERENCE.md → Testing Checklist
- **Examples**: `__tests__/` directories throughout codebase

### By Use Case

#### I want to create a new component

1. Check **REACT_QUICK_REFERENCE.md** → Component Patterns
2. Review naming conventions
3. Look at similar components in `/apps/desktop/src/components/`
4. Follow TypeScript patterns
5. Add tests

#### I want to add global state

1. Read **REACT_PATTERNS.md** → State Management with Zustand
2. Check **REACT_QUICK_REFERENCE.md** → Zustand Store Pattern
3. Review `/apps/desktop/src/stores/settingsStore.ts`
4. Use middleware composition pattern
5. Add selectors for optimization

#### I want to create a custom hook

1. Check **REACT_QUICK_REFERENCE.md** → Custom Hook Template
2. Read **REACT_PATTERNS.md** → Custom Hooks Patterns
3. Study `/apps/desktop/src/hooks/useWindowManager.ts`
4. Follow cleanup patterns
5. Write tests with `renderHook`

#### I want to optimize performance

1. Review **REACT_QUICK_REFERENCE.md** → Performance Optimization Checklist
2. Read **REACT_PATTERNS.md** → Performance Optimization
3. Use React DevTools Profiler
4. Apply memoization patterns
5. Consider code splitting

#### I want to handle forms

1. For React 19: Check **REACT_PATTERNS.md** → useActionState
2. For traditional: Check **REACT_PATTERNS.md** → Form Handling Patterns
3. Review **REACT_QUICK_REFERENCE.md** → Form Handling Patterns
4. Look at `/apps/web/app/signup/page.tsx`
5. Add validation

#### I want to handle errors

1. Read **REACT_PATTERNS.md** → Error Boundary Patterns
2. Check **REACT_QUICK_REFERENCE.md** → Error Boundary Template
3. Review `/apps/desktop/src/components/ErrorBoundary.tsx`
4. Study tests in `__tests__/ErrorBoundary.test.tsx`
5. Implement error reporting

## 📖 Learning Path

### Beginner

1. Start with **REACT_QUICK_REFERENCE.md**
2. Understand basic patterns (components, hooks, state)
3. Review naming conventions
4. Look at simple component examples
5. Write first tests

### Intermediate

1. Read **REACT_PATTERNS.md** sections on:
   - Custom Hooks Patterns
   - Component Composition Patterns
   - Form Handling Patterns
2. Study real implementations in codebase
3. Practice with Zustand state management
4. Learn error handling patterns
5. Write comprehensive tests

### Advanced

1. Deep dive into **REACT_PATTERNS.md**:
   - Performance Optimization
   - Context Patterns
   - Advanced TypeScript patterns
2. Study complex hooks like `useWindowManager`
3. Implement optimization patterns
4. Master testing strategies
5. Contribute to documentation

## 🔍 Pattern Catalog

### Component Patterns

| Pattern                  | Level        | Location   | Example             |
| ------------------------ | ------------ | ---------- | ------------------- |
| Function Component       | Beginner     | Quick Ref  | Throughout codebase |
| Compound Components      | Intermediate | Full Guide | Tabs example        |
| Render Props             | Intermediate | Full Guide | Mouse tracker       |
| Higher-Order Components  | Intermediate | Full Guide | withLoading         |
| Container/Presentational | Intermediate | Full Guide | UserList            |

### Hook Patterns

| Pattern                | Level        | Location   | Example              |
| ---------------------- | ------------ | ---------- | -------------------- |
| Basic useState         | Beginner     | Quick Ref  | Throughout codebase  |
| useEffect with Cleanup | Beginner     | Full Guide | Event listeners      |
| Complex State Hook     | Intermediate | Full Guide | useWindowManager     |
| Keyboard Shortcuts     | Intermediate | Full Guide | useKeyboardShortcuts |
| External Store         | Advanced     | Full Guide | useToast             |

### State Management Patterns

| Pattern            | Level        | Location   | Example                 |
| ------------------ | ------------ | ---------- | ----------------------- |
| Local State        | Beginner     | Quick Ref  | Component state         |
| Zustand Store      | Intermediate | Full Guide | settingsStore           |
| Persist Middleware | Intermediate | Full Guide | Settings persistence    |
| Selectors          | Intermediate | Full Guide | Optimized subscriptions |
| Store Migration    | Advanced     | Full Guide | Version migration       |

### Form Patterns

| Pattern           | Level        | Location   | Example       |
| ----------------- | ------------ | ---------- | ------------- |
| Controlled Inputs | Beginner     | Quick Ref  | Basic forms   |
| useActionState    | Intermediate | Full Guide | Login form    |
| useFormStatus     | Intermediate | Full Guide | Submit button |
| Validation        | Intermediate | Full Guide | Signup form   |

### Performance Patterns

| Pattern           | Level        | Location   | Example                |
| ----------------- | ------------ | ---------- | ---------------------- |
| React.memo        | Intermediate | Full Guide | UserCard               |
| useMemo           | Intermediate | Full Guide | Expensive calculations |
| useCallback       | Intermediate | Full Guide | Event handlers         |
| Code Splitting    | Intermediate | Full Guide | Route splitting        |
| Virtual Scrolling | Advanced     | Full Guide | Large lists            |

## 🎓 Code Examples Map

### Real Implementation Examples

#### Desktop App (Tauri)

**State Management**:

- Settings Store: `/apps/desktop/src/stores/settingsStore.ts` (536 lines)
- Email Store: `/apps/desktop/src/stores/emailStore.ts`
- Calendar Store: `/apps/desktop/src/stores/calendarStore.ts`

**Custom Hooks**:

- Window Manager: `/apps/desktop/src/hooks/useWindowManager.ts` (264 lines)
- Keyboard Shortcuts: `/apps/desktop/src/hooks/useKeyboardShortcuts.ts` (207 lines)
- Toast: `/apps/desktop/src/hooks/useToast.ts` (182 lines)
- Screen Capture: `/apps/desktop/src/hooks/useScreenCapture.ts`

**Components**:

- Error Boundary: `/apps/desktop/src/components/ErrorBoundary.tsx` (225 lines)
- Theme Provider: `/apps/desktop/src/providers/ThemeProvider.tsx` (72 lines)
- File Upload: `/apps/desktop/src/components/FileUpload/`
- Calendar: `/apps/desktop/src/components/Calendar/`

**Tests**:

- Error Boundary: `/apps/desktop/src/components/__tests__/ErrorBoundary.test.tsx` (361 lines)
- Window Manager: `/apps/desktop/src/hooks/__tests__/useWindowManager.test.ts`
- Message List: `/apps/desktop/src/components/__tests__/MessageList.test.tsx`

#### Web App (Next.js 16)

**Server Components**:

- Dashboard: `/apps/web/app/dashboard/page.tsx`
- Settings: `/apps/web/app/dashboard/settings/page.tsx`
- Usage: `/apps/web/app/dashboard/usage/page.tsx`

**Client Components**:

- Login Form: `/apps/web/app/login/page.tsx` (225 lines)
- Signup Form: `/apps/web/app/signup/page.tsx` (351 lines)
- Providers: `/apps/web/app/providers.tsx`

**UI Components**:

- Card: `/apps/web/components/ui/card.tsx`
- Button: `/apps/web/components/ui/index.tsx`
- Dashboard Layout: `/apps/web/components/dashboard/DashboardLayout.tsx`

## 📝 Related Documentation

### Existing Documentation

- **Main Guide**: `/CLAUDE.md` - Project overview and commands
- **Zustand Patterns**: `/docs/ZUSTAND_PATTERNS.md` - Additional Zustand info
- **Type System**: `/docs/TYPE_SYSTEM.md` - TypeScript patterns
- **API Reference**: `/docs/API_REFERENCE.md` - API documentation
- **Backend Architecture**: `/docs/BACKEND_ARCHITECTURE.md` - Backend patterns

### Official Resources

- [React 19 Documentation](https://react.dev/)
- [Next.js 16 Documentation](https://nextjs.org/docs)
- [Zustand Documentation](https://docs.pmnd.rs/zustand/)
- [Tauri Documentation](https://v2.tauri.app/)
- [Vitest Documentation](https://vitest.dev/)

## 🛠️ Tools and Setup

### VSCode Extensions

- ESLint
- Prettier
- TypeScript
- React DevTools
- Tailwind CSS IntelliSense

### Development Commands

```bash
# Desktop development
pnpm dev:desktop

# Web development
cd apps/web && pnpm dev

# Type checking
pnpm typecheck:all

# Tests
pnpm test
pnpm --filter @agiworkforce/desktop test
pnpm --filter web test

# Linting
pnpm lint
pnpm lint:fix
```

### React DevTools

1. Install React DevTools browser extension
2. Enable Profiler
3. Record component renders
4. Analyze performance
5. Apply optimization patterns

## 🎯 Quick Links

### Documentation

- [Full Patterns Guide](../REACT_PATTERNS.md)
- [Quick Reference](../REACT_QUICK_REFERENCE.md)
- [Patterns Summary](./REACT_PATTERNS_SUMMARY.md)

### Code Examples

- [Desktop Components](../apps/desktop/src/components/)
- [Desktop Hooks](../apps/desktop/src/hooks/)
- [Desktop Stores](../apps/desktop/src/stores/)
- [Web App](../apps/web/app/)

### Tests

- [Desktop Tests](../apps/desktop/src/__tests__/)
- [Component Tests](../apps/desktop/src/components/__tests__/)
- [Hook Tests](../apps/desktop/src/hooks/__tests__/)
- [Web Tests](../apps/web/__tests__/)

## 📊 Documentation Stats

- **Total Documentation**: 3 files, ~81 KB
- **Code Examples**: 100+ patterns documented
- **Real Implementations**: 20+ files referenced
- **Test Coverage**: 15+ test files referenced
- **Patterns Covered**: 50+ unique patterns

## 🤝 Contributing

### Adding New Patterns

1. Implement pattern in codebase
2. Add to **REACT_PATTERNS.md** with full example
3. Add snippet to **REACT_QUICK_REFERENCE.md**
4. Update **REACT_PATTERNS_SUMMARY.md**
5. Add tests demonstrating pattern
6. Update this index if major addition

### Updating Documentation

1. Keep all three docs in sync
2. Maintain consistent formatting
3. Include TypeScript types
4. Add real examples when possible
5. Update file references

### Documentation Style

- Use clear, concise language
- Include code examples for everything
- Show both good and bad examples
- Explain the "why" not just the "how"
- Keep examples realistic and practical

## 📞 Getting Help

### Documentation Issues

1. Check this index for correct file
2. Search in specific documentation file
3. Look for similar patterns in codebase
4. Review tests for usage examples
5. Refer to official React documentation

### Pattern Questions

1. Start with **REACT_QUICK_REFERENCE.md**
2. If unclear, read **REACT_PATTERNS.md** section
3. Find similar implementation in codebase
4. Check test files for usage
5. Experiment with pattern

### Common Questions

**Q: Where do I find pattern X?**
A: Use this index or search in REACT_PATTERNS.md

**Q: How do I implement feature Y?**
A: Check REACT_QUICK_REFERENCE.md for template, then REACT_PATTERNS.md for details

**Q: Where are real examples?**
A: See "Code Examples Map" section above

**Q: How do I test pattern Z?**
A: See Testing Patterns in REACT_PATTERNS.md and test examples in codebase

**Q: What's the difference between the docs?**
A: PATTERNS = comprehensive, QUICK_REFERENCE = snippets, SUMMARY = overview

## 🔄 Version History

- **v1.0.0** (2026-01-15) - Initial release
  - REACT_PATTERNS.md created (2,527 lines)
  - REACT_QUICK_REFERENCE.md created
  - REACT_PATTERNS_SUMMARY.md created
  - Comprehensive coverage of React 19, Zustand v5, and modern patterns

## 📅 Maintenance

This documentation should be updated when:

- New patterns are added to the project
- React/Next.js/Zustand versions are updated
- Best practices change
- New features require new patterns
- Community feedback suggests improvements

---

**Documentation Team**: Claude Code
**Last Updated**: 2026-01-15
**Version**: 1.0.0
**Project**: AGI Workforce
