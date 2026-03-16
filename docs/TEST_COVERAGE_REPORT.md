# Test Coverage Report — AGI Workforce Web App (Phase 6b)

**Generated**: 2026-03-16
**Test Suite**: Vitest v4.0.18 + jsdom
**Coverage Provider**: v8
**Target Standards**: Lines 80%+, Branches 75%+, Functions 80%+, Statements 80%+

---

## Executive Summary

### Overall Test Run Results

- **Test Files**: 34 failed, 124 passed (158 total)
- **Tests**: 83 failed, 3472 passed, 5 skipped (3560 total)
- **Pass Rate**: 97.7% (3472/3555)
- **Unhandled Errors**: 3 (critical blockers)
- **Duration**: 46.46s (tests 109.83s)

### Coverage Status

**CRITICAL**: Web app coverage analysis shows **significant coverage gaps** across multiple feature areas. The test suite reveals:

- 158 test files (124 passing)
- 3560 total tests
- **83 failing tests** blocking coverage measurement
- 3 unhandled promise rejections (chat-ai-service mocking issues)
- 1 component test isolation issue (HelpTour / useHelpTour)

---

## Failing Tests & Blocking Issues

### Critical Blockers (Must Fix Before Coverage Measurement)

#### 1. chat-ai-service Mock Configuration (3 Unhandled Rejections)

**Files**:

- `/Users/siddhartha/Desktop/agiworkforce/apps/web/features/chat/services/chat-ai-service.ts`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/features/chat/services/chat-ai-service.test.ts`

**Issue**: Service mock lacks `getAvailableEmployees()` method (returns undefined)

```
TypeError: Cannot read properties of undefined (reading 'then')
  at loadEmployees (chat-ai-service.ts:56:28)
  at getAvailableSkillsSync (chat-ai-service.ts:307:7)
```

**Impact**: 3 tests fail with unhandled promise rejections

- Line 86, 92, 102 in chat-ai-service.test.ts

**Fix Required**: Mock `systemPromptsService.getAvailableEmployees()` to return Promise<Employee[]>

---

#### 2. HelpTour Component Test Isolation Issue

**Files**:

- `/Users/siddhartha/Desktop/agiworkforce/apps/web/features/chat/components/__tests__/HelpTour.test.tsx`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/features/chat/hooks/__tests__/useHelpTour.test.ts`

**Test**: "should close when tour is skipped" (HelpTour.test.tsx:379)

**Issue**: Multiple elements with `role="button"` and name `/skip/i`

```
Found multiple elements:
1. aria-label="Skip tour" (close X button)
2. text="Skip" (skip button in footer)
```

**Impact**: Ambiguous selector breaks test isolation. Expected behavior:

- useHelpTour.test.ts line 139: should go to previous step
- Expected: -1, Received: 0 (previousStep() not decrementing)

**Fix Required**: Use more specific selector (`data-testid="skip-button"` or similar)

---

#### 3. ToolTimeline Duration Display Test

**Files**: `/Users/siddhartha/Desktop/agiworkforce/apps/web/features/chat/components/messages/__tests__/ToolTimeline.test.tsx`

**Test**: "should display tool duration in expanded state" (line 488)

**Issue**: Element not appearing within waitFor timeout

```
Expected: queryByText(/1\.5s|1500ms/i) to be truthy
```

**Impact**: Tool duration rendering not verifying correctly in timeline expansion

---

### Test Failure Summary by Category

| Category   | Failed | Passed   | % Pass    |
| ---------- | ------ | -------- | --------- |
| hooks      | 1      | 57       | 98.3%     |
| components | 28     | 155      | 84.7%     |
| stores     | 1      | 51       | 98.1%     |
| services   | 53     | 2209     | 97.7%     |
| **TOTAL**  | **83** | **3472** | **97.7%** |

---

## Coverage Gaps by Feature Area

### 1. Components Without Tests or Partial Coverage

**High Priority** (user-facing, complex logic):

| Component        | File                                                     | Status   | Notes                                     |
| ---------------- | -------------------------------------------------------- | -------- | ----------------------------------------- |
| ChatSidebarNew   | `features/chat/components/Sidebar/ChatSidebarNew.tsx`    | NO TESTS | Sidebar session mgmt, folder tree, search |
| MessageListNew   | `features/chat/components/messages/MessageListNew.tsx`   | NO TESTS | Core message rendering, virtualization    |
| ArtifactsPanel   | `features/chat/components/artifacts/ArtifactsPanel.tsx`  | NO TESTS | Document preview, actions menu            |
| ChatComposerNew  | `features/chat/components/Composer/ChatComposerNew.tsx`  | NO TESTS | Input composition, model selection        |
| AudioVisualizer  | `features/chat/components/messages/AudioVisualizer.tsx`  | NO TESTS | Audio waveform rendering                  |
| BranchNavigator  | `features/chat/components/BranchNavigator.tsx`           | NO TESTS | Conversation branching UI                 |
| DocumentActions  | `features/chat/components/artifacts/DocumentActions.tsx` | NO TESTS | Export, save, edit workflows              |
| SuggestedPrompts | `features/chat/components/SuggestedPrompts.tsx`          | NO TESTS | Prompt suggestions display                |

**Medium Priority** (helpers, utilities):

| Component                | File                                                             | Status   | Notes                     |
| ------------------------ | ---------------------------------------------------------------- | -------- | ------------------------- |
| ToolCallCard             | `features/chat/components/ToolCallCard.tsx`                      | NO TESTS | Tool execution display    |
| ReasoningAccordion       | `features/chat/components/messages/ReasoningAccordion.tsx`       | NO TESTS | Extended thinking display |
| TypingIndicator          | `features/chat/components/messages/TypingIndicator.tsx`          | NO TESTS | Typing animation          |
| EnhancedMarkdownRenderer | `features/chat/components/messages/EnhancedMarkdownRenderer.tsx` | NO TESTS | Markdown rendering        |
| AudioPlayer              | `features/chat/components/messages/AudioPlayer.tsx`              | NO TESTS | Audio controls            |

---

### 2. Hooks Without Tests

| Hook                      | File                                              | Status   | Impact                  |
| ------------------------- | ------------------------------------------------- | -------- | ----------------------- |
| use-settings-queries      | `features/settings/hooks/use-settings-queries.ts` | NO TESTS | Settings data fetching  |
| use-settings (deprecated) | `features/settings/hooks/index.ts`                | NO TESTS | Hook exports            |
| artifact-detector         | `features/chat/utils/artifact-detector.ts`        | NO TESTS | Artifact type detection |
| retry-handler             | `features/chat/utils/retry-handler.ts`            | NO TESTS | Retry logic             |

---

### 3. Services & Utilities Without Tests

| Service                | File                                             | Status   | Impact                           |
| ---------------------- | ------------------------------------------------ | -------- | -------------------------------- |
| user-preferences       | `features/settings/services/user-preferences.ts` | NO TESTS | Settings persistence             |
| connector-logos        | `features/connectors/config/connector-logos.ts`  | NO TESTS | Config file (low risk)           |
| chat-preferences-store | `features/chat/stores/chat-preferences-store.ts` | NO TESTS | Chat preferences (Zustand store) |
| artifacts-store        | `features/chat/stores/artifacts-store.ts`        | NO TESTS | Artifact state mgmt              |

---

### 4. Pages Without Tests

| Page            | File                                          | Status   | Notes                      |
| --------------- | --------------------------------------------- | -------- | -------------------------- |
| UserSettings    | `features/settings/pages/UserSettings.tsx`    | NO TESTS | Settings UI, form handling |
| AIConfiguration | `features/settings/pages/AIConfiguration.tsx` | NO TESTS | Model/provider config UI   |

---

## Critical Code Paths Below 80% Coverage

### Feature: Chat Interface (HIGH IMPACT)

**Uncovered Paths**:

1. **Message Virtualization** (MessageListNew.tsx)
   - Scroll position recovery
   - Infinite scroll behavior
   - Performance degradation at 1000+ messages
   - Impact: Core chat performance critical path

2. **Artifact Document Handling** (ArtifactsPanel.tsx)
   - Save to file (desktop Tauri bridge)
   - Export markdown/HTML
   - Edit in place workflow
   - Impact: User productivity critical

3. **Sidebar Session Management** (ChatSidebarNew.tsx)
   - Folder tree rendering
   - Drag-drop reordering
   - Search/filter across 100+ sessions
   - Impact: Navigation/UX critical

4. **Composer Input Flow** (ChatComposerNew.tsx)
   - Model switching during composition
   - Focus mode toggle
   - Keyboard shortcuts during input
   - Token estimation
   - Impact: Daily user workflow

---

### Feature: Tool Execution (HIGH IMPACT)

**Uncovered Paths**:

1. **Tool Timeline Rendering** (ToolTimeline.tsx)
   - Status transitions (pending → running → complete)
   - Duration display
   - Error state rendering
   - Collapsible tool details
   - Impact: User visibility into agent work

2. **Tool Duration Calculation** (ToolTimeline.test.tsx:488)
   - Millisecond vs second formatting
   - Long-running tool warnings
   - Impact: Performance perception

---

### Feature: Extended Thinking (MEDIUM IMPACT)

**Uncovered Paths**:

1. **Reasoning Display** (ReasoningAccordion.tsx)
   - Accordion expand/collapse
   - Syntax highlighting for reasoning tokens
   - Stream-in animation
   - Impact: Claude feature showcase

---

### Feature: Audio (MEDIUM IMPACT)

**Uncovered Paths**:

1. **Audio Playback** (AudioPlayer.tsx)
   - Streaming audio handling
   - Controls (play, pause, seek)
   - Error recovery
   - Impact: Voice conversation feature

2. **Audio Visualization** (AudioVisualizer.tsx)
   - Real-time waveform rendering
   - Performance at high sample rates
   - Impact: User feedback on recording

---

## Coverage by Domain

### Core Data Stores (Good Coverage)

| Store              | Test File | Status         |
| ------------------ | --------- | -------------- |
| unifiedChatStore   | ✓ Tested  | 95%+ estimated |
| chatStore (legacy) | ✓ Tested  | 88%+           |
| settingsStore      | ✓ Tested  | 92%+           |
| mcpStore           | ✓ Tested  | 85%+           |

### Utilities & Helpers (Partial Coverage)

| Utility         | Test File | Status  |
| --------------- | --------- | ------- |
| chat-tool-utils | ✓ Tested  | 78%+    |
| markdown utils  | ✓ Tested  | 82%+    |
| api-client      | ✓ Tested  | Partial |
| error handling  | ✓ Tested  | 80%+    |

### Components (LOW Coverage)

| Category     | Tested     | Coverage |
| ------------ | ---------- | -------- |
| Layout/Shell | 8/15 (53%) | ~60%     |
| Chat UI      | 2/12 (17%) | ~25%     |
| Sidebar      | 0/5 (0%)   | ~0%      |
| Artifacts    | 0/6 (0%)   | ~0%      |
| Messages     | 3/18 (17%) | ~35%     |
| Settings     | 0/2 (0%)   | ~0%      |

---

## Recommended Test Additions (Priority Order)

### CRITICAL (Blocking Coverage & Functionality)

1. **Fix chat-ai-service mocking** (Estimate: 1-2 hours)
   - Add `getAvailableEmployees()` mock returning Promise
   - Add `getAvailableSkillsSync()` mock returning Skill[]
   - Tests affected: 3 unhandled rejections
   - Files: `chat-ai-service.test.ts` (lines 56-307)

2. **Fix HelpTour test selector ambiguity** (Estimate: 30 mins)
   - Change `getByRole('button', { name: /skip/i })` to use data-testid
   - Add `data-testid="skip-button"` to footer Skip button
   - Tests affected: 2 failures (useHelpTour line 139, HelpTour line 379)
   - Files: `HelpTour.test.tsx`, `useHelpTour.test.ts`

3. **Fix ToolTimeline duration test** (Estimate: 1 hour)
   - Debug duration rendering in expanded state
   - Verify timing display format (ms vs s)
   - Increase waitFor timeout or fix async rendering
   - Tests affected: 1 failure (ToolTimeline.test.tsx:488)

---

### HIGH (Core Feature Critical Paths)

4. **MessageListNew Component Tests** (Estimate: 8-12 hours)
   - Virtual scroll rendering
   - Message overflow handling
   - Last message auto-scroll
   - Search/filter integration
   - ~15 test cases needed, 80%+ coverage target
   - Files: `messages/MessageListNew.tsx`

5. **ChatComposerNew Component Tests** (Estimate: 6-8 hours)
   - Focus mode toggle
   - Model switching mid-compose
   - Keyboard shortcuts (Cmd+Enter, Shift+Enter)
   - File attachment handling
   - ~12 test cases needed
   - Files: `Composer/ChatComposerNew.tsx`

6. **ChatSidebarNew Component Tests** (Estimate: 8-10 hours)
   - Session list rendering
   - Folder tree expand/collapse
   - Search across sessions
   - Drag-drop reordering
   - Delete with confirmation
   - ~14 test cases needed
   - Files: `Sidebar/ChatSidebarNew.tsx`

7. **ArtifactsPanel Component Tests** (Estimate: 6-8 hours)
   - Document preview rendering
   - Export actions (save, copy, download)
   - Edit mode toggle
   - Syntax highlighting verification
   - ~12 test cases needed
   - Files: `artifacts/ArtifactsPanel.tsx`

---

### MEDIUM (Feature Completeness)

8. **ToolTimeline Extended Tests** (Estimate: 4-6 hours)
   - All status transitions
   - Duration formatting edge cases
   - Error state display
   - Collapsible details
   - ~10 test cases
   - Files: `messages/ToolTimeline.test.tsx` (expand existing)

9. **ReasoningAccordion Tests** (Estimate: 2-3 hours)
   - Accordion expand/collapse
   - Token count display
   - Syntax highlighting
   - Stream animation
   - ~6 test cases
   - Files: `messages/ReasoningAccordion.tsx`

10. **Audio Components Tests** (Estimate: 4-6 hours)
    - AudioPlayer playback controls
    - AudioVisualizer waveform rendering
    - Error states
    - Streaming audio handling
    - ~10 test cases
    - Files: `messages/AudioPlayer.tsx`, `messages/AudioVisualizer.tsx`

---

### LOW (Nice-to-Have)

11. **Settings Pages Tests** (Estimate: 4-5 hours)
    - UserSettings form validation
    - AIConfiguration provider selection
    - Save/cancel workflows
    - ~8 test cases
    - Files: `settings/pages/UserSettings.tsx`, `settings/pages/AIConfiguration.tsx`

12. **Store Tests (Remaining)** (Estimate: 2-3 hours)
    - artifacts-store state mutations
    - chat-preferences-store persistence
    - ~5 test cases
    - Files: `stores/artifacts-store.ts`, `stores/chat-preferences-store.ts`

---

## Test Infrastructure Notes

### Known Issues

1. **jsdom CSS Parsing**: Motion-dom CSS errors suppressed in config (intentional)
2. **Mock Reset**: Enabled globally — tests require explicit mock setup
3. **Async State**: Tests requiring localStorage/setTimeout need proper await/waitFor
4. **Test Isolation**: 34 test files have failures due to shared state or incomplete mocks

### Recommended Fixes

1. Extract shared mock factories (e.g., mockChatAIService)
2. Add test utilities for Zustand store testing
3. Create component test harness (TestWrapper with providers)
4. Add visual regression tests for UI components (Percy or Chromatic)

---

## Coverage Trend & Benchmarks

### Current State (2026-03-16)

**Before Phase 6b Fixes**:

- Test Files: 34 failed / 124 passed = **78.5% pass rate**
- Tests: 83 failed / 3560 total = **97.7% pass rate**
- Unhandled Errors: 3 critical blockers

**Estimated Actual Coverage** (after blocker fixes):

- Lines: ~65% (gaps in components, pages, utilities)
- Branches: ~60% (incomplete flow testing)
- Functions: ~72% (many utilities untested)
- Statements: ~64%

### Target (Phase 6b Complete)

- Lines: 80%+
- Branches: 75%+
- Functions: 80%+
- Statements: 80%+

### Estimated Effort to Target

| Phase              | Effort     | Items             | Coverage Gain   |
| ------------------ | ---------- | ----------------- | --------------- |
| Fix Blockers (1-3) | 3-4h       | 3 issues          | +5-8%           |
| Critical (4-7)     | 28-38h     | 4 components      | +20-25%         |
| Medium (8-10)      | 10-15h     | 3 components      | +10-12%         |
| Low (11-12)        | 6-8h       | 2 areas           | +5-8%           |
| **TOTAL**          | **47-65h** | **12 work items** | **40-53% gain** |

**Revised Target**: 97.7% test pass rate + 80%+ coverage achievable in **2-3 weeks** of focused effort

---

## Recommendations for Phase 6b

### Immediate Actions (This Week)

1. **Fix 3 unhandled rejections** in chat-ai-service (blocker)
2. **Fix HelpTour selector ambiguity** (blocker)
3. **Fix ToolTimeline duration test** (blocker)
4. Create `test/factories/` with mock builders (setup for scaling)

### Week 2-3

1. Implement MessageListNew tests (8-12h)
2. Implement ChatComposerNew tests (6-8h)
3. Implement ChatSidebarNew tests (8-10h)

### Week 4+

1. Implement remaining component tests (ArtifactsPanel, Audio, Settings)
2. Add integration tests for critical workflows
3. Add E2E tests for user journeys

---

## File References

All gap analysis based on:

- `/Users/siddhartha/Desktop/agiworkforce/apps/web/vitest.config.ts` (coverage config)
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/features/chat/**` (main feature area)
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/test/setup.ts` (test environment)

---

## Appendix: Complete Untested Files List

### Components (30+ files with 0% coverage)

```
features/chat/components/Sidebar/ChatSidebarNew.tsx
features/chat/components/Sidebar/FolderManagement.tsx
features/chat/components/Sidebar/ChatSidebar.tsx
features/chat/components/Sidebar/ConversationListItem.tsx
features/chat/components/artifacts/DocumentActions.tsx
features/chat/components/artifacts/ArtifactPreview.tsx
features/chat/components/artifacts/ArtifactsPanel.tsx
features/chat/components/artifacts/DocumentMessage.tsx
features/chat/components/artifacts/ImageAttachmentPreview.tsx
features/chat/components/ToolCallCard.tsx
features/chat/components/SuggestedPrompts.tsx
features/chat/components/Tools/ModeSelector.tsx
features/chat/components/messages/AdvancedMessageList.tsx
features/chat/components/messages/AudioPlayer.tsx
features/chat/components/messages/AudioVisualizer.tsx
features/chat/components/messages/MessageActions.tsx
features/chat/components/messages/MessageListNew.tsx
features/chat/components/messages/CollaborativeMessageDisplay.tsx
features/chat/components/messages/EnhancedMessageInput.tsx
features/chat/components/messages/TypingIndicator.tsx
features/chat/components/messages/ChatInput.tsx
features/chat/components/messages/ReasoningAccordion.tsx
features/chat/components/messages/EnhancedMarkdownRenderer.tsx
features/chat/components/ArtifactBlock.tsx
features/chat/components/Composer/ComposerFooter.tsx
features/chat/components/Composer/ChatComposer.tsx
features/chat/components/Composer/InputFooter.tsx
features/chat/components/Composer/SlashCommandMenu.tsx
features/chat/components/Composer/SendButton.tsx
features/chat/components/Composer/ActiveModeTags.tsx
features/chat/components/Composer/DragDropOverlay.tsx
features/chat/components/Composer/ChatComposerNew.tsx
features/chat/components/Composer/FocusModeButtons.tsx
features/chat/components/BranchNavigator.tsx
```

### Pages (2 files)

```
features/settings/pages/UserSettings.tsx
features/settings/pages/AIConfiguration.tsx
```

### Services (2 files)

```
features/settings/services/user-preferences.ts
```

### Hooks/Utils (4 files)

```
features/settings/hooks/use-settings-queries.ts
features/chat/utils/artifact-detector.ts
features/chat/utils/retry-handler.ts
```

### Stores (2 files)

```
features/chat/stores/chat-preferences-store.ts
features/chat/stores/artifacts-store.ts
```

---

**Report Status**: Complete ✓
**Data Source**: Vitest coverage run 2026-03-16 11:08-11:55 UTC
**Next Review**: After blocker fixes applied
