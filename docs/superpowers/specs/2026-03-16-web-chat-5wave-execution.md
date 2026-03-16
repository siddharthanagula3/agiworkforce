# Web Chat UI/UX Parity: 5-Wave Execution Plan

**Date**: 2026-03-16
**Scope**: Complete visual polish, feature completion, and testing for web chat parity with desktop
**Execution Model**: 5 sequential waves (5 agents per wave) + Code Review + Test Writing
**Target Completion**: ~4-6 hours wall-clock time

## Executive Summary

The web chat interface has completed core parity (9/9 phases implemented in previous sprints). This plan executes the final refinement phase using sequential 5-agent waves:
- **Wave 1**: Polish & Animations (framer-motion, dark mode, transitions)
- **Wave 2**: Feature Completion (CommandPalette, KeyboardShortcuts, help, admin tools)
- **Wave 3**: Testing Infrastructure (E2E setup, critical flows, test utilities)
- **Wave 4**: Performance & Accessibility (optimization, a11y audit, fixes)
- **Wave 5**: Integration & Edge Cases (cross-feature, mobile, error boundaries, offline)

Post-waves: Code Review → Test Writing phase.

## Project Context

### Current State (2026-03-15 verified)
- ✅ **Phases 1-6 completed**: Adapter layer, MessageBubble, ToolLabel, MessageList, ChatComposerNew, Sidebar, advanced features
- ✅ **Code review complete**: 3 CRITICAL issues fixed (sidebar duplication, test failures, thinking mode persistence)
- ✅ **Tests passing**: 73/73 in chat-store tests, TypeScript clean
- ✅ **Git status**: All changes committed and pushed to main (commit 860719cb)
- ⏳ **Pending**: Visual polish, animations, dark mode refinement, E2E tests, performance optimization

### Remaining Work (by workstream)

**Polish Track** (Wave 1)
- Framer-motion animations for MessageBubble entrance, ToolTimeline collapse/expand, Sidebar transitions
- Dark mode refinement: contrast verification, component testing in dark theme
- Loading states, page transitions, smooth interactions
- ReasoningAccordion animations (if not complete)

**Feature Track** (Wave 2)
- CommandPalette: full search/action functionality, keyboard navigation
- KeyboardShortcutsDialog: display all shortcuts, search capability, help modal
- Help/tour system for new users
- Admin tools panel (model info, token usage, request history)

**Testing Track** (Waves 3 + Post-Wave Phase)
- E2E test infrastructure (Playwright, page objects, test utilities)
- Critical flow tests: chat creation → message send → tool execution → model switching
- Unit tests for all new utilities and store changes
- Component tests for animations and interactive behavior
- Target 80%+ code coverage

**Performance/A11y Track** (Wave 4)
- Profile and optimize message rendering, sidebar re-renders, store updates
- Image lazy-loading, code-splitting
- Accessibility audit: keyboard nav, screen reader, ARIA labels, contrast
- Fix all WCAG violations

**Integration Track** (Wave 5)
- Cross-feature integration testing (streaming + voice + models + themes)
- Mobile responsiveness (375px, 768px, 1024px+ breakpoints)
- Error boundary coverage, graceful degradation
- Session persistence, offline handling

## Architecture & Design Decisions

### 1. No New Data Structures
- Reuse existing stores: `chat-store.ts`, `model-store.ts`, `chat-preferences-store.ts` (just updated with `thinkingEnabled`)
- All state management via Zustand with Persist middleware
- No new database tables or API changes required

### 2. Theming System
- **CSS Custom Properties** (already implemented):
  - Light: `--chat-bg: #faf9f7`, `--chat-sidebar-bg: #f5f4f1`
  - Dark: `--chat-bg: #0f0f13`, `--chat-sidebar-bg: #0b0c14`
  - Semantic borders: `--chat-border-strong`, `--chat-border-subtle`
- **Dark mode toggle**: Via `useTheme()` hook (uses next-themes or custom localStorage)
- **No hardcoded colors** in components — use CSS variables or Tailwind semantic classes

### 3. Animation Strategy
- **Library**: framer-motion (consistent with desktop)
- **Key animations**:
  - MessageBubble: opacity + slide-in (0→1, y: 8→0)
  - ToolTimeline: height + opacity collapse/expand
  - Sidebar: smooth width transitions when collapsed
  - Page transitions: fade + optional slide
- **Performance**: Use `gpu: true` for layout shifts, avoid animating large DOM lists

### 4. Component Ownership (Wave Assignments)

| Wave | Track | Components | Agents |
|------|-------|------------|--------|
| 1 | Polish | MessageBubble, ToolTimeline, Sidebar, transitions, dark mode | 5 |
| 2 | Features | CommandPalette, KeyboardShortcuts, Help, AdminTools | 5 |
| 3 | Testing | E2E infra, page objects, test utilities, critical flow scaffolds | 5 |
| 4 | Perf/A11y | Profiling, optimization, a11y audit, fixes | 5 |
| 5 | Integration | Cross-feature, mobile, error boundaries, offline | 5 |

### 5. Testing Strategy

**Unit Tests** (Vitest):
- Animation helpers, utility functions, store actions
- All new hooks and custom logic
- Mock dependencies (Supabase, Tauri)

**Component Tests** (Vitest + React Testing Library):
- MessageBubble animations and rendering
- ToolLabel interactions and state
- Sidebar toggle/collapse behavior
- Form inputs and validation

**E2E Tests** (Playwright):
- Critical user flow: new chat → send message → view response → toggle dark mode
- Model switching: select model → verify header → send message
- Streaming + interruption: send message → wait for stream → click stop
- Keyboard navigation: Cmd+K → CommandPalette → select action

**Coverage Target**: 80%+ lines covered by tests

### 6. Error Handling & Graceful Degradation

- **Voice input unavailable**: Gracefully hide VoiceInputButton
- **Dark mode unsupported**: Fallback to light theme
- **E2E text-to-speech fails**: Continue with typed input
- **Command palette unavailable**: Hide Cmd+K UI, all features still work
- **Streaming abort fails**: Show error toast, message still deliverable

### 7. Performance Targets

- **Lighthouse**: 90+ scores (performance, accessibility, best practices)
- **Message rendering**: <100ms for 50-message thread (virtual scrolling if needed)
- **Dark mode toggle**: <50ms to switch themes
- **Sidebar collapse**: smooth 200ms transition
- **Model selector open**: <200ms popup render

### 8. Accessibility (WCAG 2.1 AA)

- ✅ All buttons have `aria-label` or semantic text
- ✅ Keyboard navigation: Tab, Shift+Tab, Enter, Escape, arrow keys
- ✅ Focus indicators visible (outline or ring)
- ✅ Color contrast: 4.5:1 for text (AA), 3:1 for graphics
- ✅ Screen reader: semantic HTML, ARIA roles where needed
- ✅ Form labels associated with inputs
- ✅ Loading states announced via `aria-live="polite"`

## Implementation Phases

### Phase 1: Wave Execution (Waves 1-5)

Each wave runs 5 agents in parallel:
- **Wave 1 agents**: Polish specialist, animator, theme specialist, dark mode QA, transition reviewer
- **Wave 2 agents**: CommandPalette dev, KeyboardShortcuts dev, help/tour dev, admin tools dev, feature integration QA
- **Wave 3 agents**: E2E infrastructure, page object developer, test utility dev, critical flow scaffolder, testing QA
- **Wave 4 agents**: Performance profiler, optimization dev, a11y auditor, accessibility fixer, perf QA
- **Wave 5 agents**: Integration tester, mobile dev, error boundary dev, offline dev, integration QA

**Wave Duration**: ~45 min per wave (given parallel execution)
**Total Waves**: ~225 min (3.75 hours)

### Phase 2: Code Review

- Launch `code-reviewer` agent on all Wave 1-5 outputs
- Generate comprehensive review across all modified files
- Categorize issues by severity (Critical/High/Medium/Low)
- Document all findings in review summary
- **Duration**: ~30 min

### Phase 3: Test Writing

- Write unit tests (Vitest) for all new utilities, store changes, hooks
- Write component tests for animation components and interactive elements
- Complete E2E tests scaffolded in Wave 3
- Run full test suite, target 80%+ coverage
- **Duration**: ~60 min

## Success Criteria

- ✅ All 5 waves complete (code written)
- ✅ Code review complete, all Critical issues identified
- ✅ Tests written for all code (target 80%+ coverage)
- ✅ Web chat UI indistinguishable from desktop (visual parity)
- ✅ No regressions from Phases 1-6
- ✅ All tests passing (post Wave 3 + test writing)
- ✅ Lighthouse scores 90+
- ✅ WCAG 2.1 AA compliance verified

## Files Modified (Expected)

### Wave 1 (Polish)
- `apps/web/features/chat/components/messages/MessageBubble.tsx` (animations)
- `apps/web/features/chat/components/messages/ToolTimeline.tsx` (animations)
- `apps/web/features/chat/components/Sidebar/ChatSidebarNew.tsx` (transitions)
- `apps/web/app/globals.css` (dark mode variables, animation keyframes)
- `apps/web/components/UnifiedAgenticChat/MessageListNew.tsx` (if needed)

### Wave 2 (Features)
- `apps/web/components/UnifiedAgenticChat/CommandPalette.tsx` (functionality)
- `apps/web/components/UnifiedAgenticChat/KeyboardShortcutsDialog.tsx` (full dialog)
- New: `apps/web/components/UnifiedAgenticChat/HelpTour.tsx`
- New: `apps/web/components/UnifiedAgenticChat/AdminToolsPanel.tsx`

### Wave 3 (Testing)
- New: `apps/web/e2e/fixtures/` (test utilities, page objects)
- New: `apps/web/e2e/critical-flows.spec.ts` (critical path tests)
- New: `playwright.config.ts` (E2E configuration)

### Wave 4 (Perf/A11y)
- Various: Performance optimizations (profiling-guided)
- Various: A11y fixes (audit-guided)

### Wave 5 (Integration)
- Integration tests and cross-feature bug fixes

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Wave dependencies (e.g., Wave 2 needs Wave 1 CSS) | Features designed to be independent; CSS is already in place |
| Animations cause jank | Performance profiling in Wave 4; use GPU-accelerated transforms |
| A11y audit finds major issues | Dedicated Wave 4 fixer agents; budget 1-2 agents for remediation |
| E2E tests flaky | Use Playwright best practices (explicit waits, stable selectors); test in Wave 3 scaffolding |
| Dark mode not properly implemented | Already have CSS variables; Wave 1 validates all components |
| Keyboard nav broken | Wave 2 + Wave 5 ensure full keyboard coverage |

## Post-Execution Deliverables

1. **Implementation Summary**: All code changes, component modifications
2. **Code Review Report**: Issues found, categorized by severity
3. **Test Report**: Coverage report, passing/failing tests
4. **Performance Report**: Lighthouse scores, profiling results
5. **A11y Report**: WCAG violations found and fixed
6. **Deployment Checklist**: Ready-for-production validation

## Notes

- **No API changes required**: All work is frontend-only
- **No database migrations**: All data structures already exist
- **Backward compatible**: Features degrade gracefully if unavailable
- **Git strategy**: Single feature branch for all 5 waves, single PR at end
- **Team coordination**: 5-agent waves, no cross-wave dependencies

---

**Status**: Ready for spec review and implementation planning.
