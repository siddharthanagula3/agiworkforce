# Coverage Gaps Priority Matrix & Test Specifications

**Purpose**: Detailed specifications for test implementation priority
**Updated**: 2026-03-16
**For Phase 6b Implementation**

---

## Priority Tier Definitions

### CRITICAL (P0) — Blocking Release

- **Deadline**: This sprint
- **Rationale**: Unhandled errors, test infrastructure broken
- **Effort**: 3-4 hours
- **Coverage Impact**: +5-8%
- **Items**: 3

### HIGH (P1) — Core Features

- **Deadline**: Next 1-2 weeks
- **Rationale**: User-facing, critical workflows, high impact
- **Effort**: 28-38 hours
- **Coverage Impact**: +20-25%
- **Items**: 4 components + utilities

### MEDIUM (P2) — Feature Completeness

- **Deadline**: 2-3 weeks
- **Rationale**: Important features, medium impact
- **Effort**: 10-15 hours
- **Coverage Impact**: +10-12%
- **Items**: 3 areas

### LOW (P3) — Nice-to-Have

- **Deadline**: 3-4 weeks
- **Rationale**: Completeness, utilities, edge cases
- **Effort**: 6-8 hours
- **Coverage Impact**: +5-8%
- **Items**: 2 areas

---

## CRITICAL (P0) — Fix Blocking Issues

### Issue #1: chat-ai-service Mock Configuration

**Location**: `/Users/siddhartha/Desktop/agiworkforce/apps/web/features/chat/services/chat-ai-service.test.ts`

**Problem**:

```
Unhandled rejection: Cannot read properties of undefined (reading 'then')
  at loadEmployees (chat-ai-service.ts:56:28)
  at getAvailableSkillsSync (chat-ai-service.ts:307:7)

Affects lines: 86, 92, 102
```

**Root Cause**: `systemPromptsService.getAvailableEmployees()` returns undefined instead of Promise<Employee[]>

**Current Mock Setup**:

```typescript
// BROKEN: Missing getAvailableEmployees
vi.mock('features/chat/services/system-prompts-service', () => ({
  systemPromptsService: {
    // getAvailableEmployees is undefined!
  },
}));
```

**Required Fix**:

```typescript
vi.mock('features/chat/services/system-prompts-service', () => ({
  systemPromptsService: {
    getAvailableEmployees: vi.fn(() =>
      Promise.resolve([
        { id: 'emp1', name: 'Analyst', category: 'professional' },
        { id: 'emp2', name: 'Developer', category: 'technical' },
      ]),
    ),
    getAvailableSkills: vi.fn(() =>
      Promise.resolve([{ id: 'skill1', name: 'Python', category: 'coding' }]),
    ),
  },
}));
```

**Test Cases to Verify**:

```typescript
describe('chat-ai-service mocking', () => {
  it('should resolve getAvailableEmployees promise', async () => {
    const service = chatAIService;
    // Should not throw when calling loadEmployees
    expect(() => service.getAvailableSkillsSync()).not.toThrow();
  });
});
```

**Acceptance Criteria**:

- [ ] No unhandled promise rejections
- [ ] Tests 86, 92, 102 pass
- [ ] Mock returns realistic employee/skill data

**Estimated Time**: 30 minutes

---

### Issue #2: HelpTour Selector Ambiguity

**Location**:

- `/Users/siddhartha/Desktop/agiworkforce/apps/web/features/chat/components/__tests__/HelpTour.test.tsx` (line 379)
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/features/chat/hooks/__tests__/useHelpTour.test.ts` (line 139)

**Problem**:

```
TestingLibraryElementError: Found multiple elements with role="button" and name="/skip/i"
1. aria-label="Skip tour" (close button with X icon)
2. text="Skip" (skip button in footer)
```

**Current Code**:

```typescript
// HelpTour.test.tsx:379
const skipButton = screen.getByRole('button', { name: /skip/i });
// Ambiguous: matches both X button AND Skip button
```

**Required Fix**:

1. In `HelpTour.tsx`, add `data-testid` to footer Skip button:

```typescript
<button
  data-testid="skip-button"
  className="..."
  onClick={onSkip}
>
  Skip
</button>
```

2. In test, use specific selector:

```typescript
const skipButton = screen.getByTestId('skip-button');
// or for close button:
const closeButton = screen.getByLabelText('Skip tour');
```

**Test Cases to Fix**:

```typescript
describe('HelpTour Component > Edge Cases', () => {
  it('should close when tour is skipped', async () => {
    render(<HelpTour />);

    await waitFor(() => {
      // Use specific selector
      const skipButton = screen.getByTestId('skip-button');
      expect(skipButton).toBeInTheDocument();
    });

    const skipButton = screen.getByTestId('skip-button');
    await user.click(skipButton);

    expect(screen.queryByTestId('help-tour')).not.toBeInTheDocument();
  });
});
```

**Related Hook Test Fix** (`useHelpTour.test.ts:139`):

```typescript
describe('useHelpTour Hook > Tour Navigation', () => {
  it('should go to previous step', () => {
    const { result } = renderHook(() => useHelpTour());
    const { act } = renderHookUtils;

    // Setup: move to step 2
    act(() => result.current.nextStep());
    const stepBeforeGoing = result.current.currentStep; // Should be 1

    // Go back
    act(() => result.current.previousStep());

    // Should decrement by 1
    expect(result.current.currentStep).toBe(stepBeforeGoing - 1);
  });
});
```

**Acceptance Criteria**:

- [ ] HelpTour.test.tsx skip button test passes
- [ ] useHelpTour.test.ts previousStep test passes
- [ ] Both tests use specific selectors (data-testid or aria-label)
- [ ] No ambiguous queries

**Estimated Time**: 45 minutes

---

### Issue #3: ToolTimeline Duration Display Test

**Location**: `/Users/siddhartha/Desktop/agiworkforce/apps/web/features/chat/components/messages/__tests__/ToolTimeline.test.tsx` (line 488)

**Problem**:

```
Timeout: expected queryByText(/1\.5s|1500ms/i) to be truthy after waitFor
```

**Root Cause**: Duration not rendering in expanded state, or format mismatch

**Current Test** (failing):

```typescript
it('should display tool duration in expanded state', async () => {
  render(<ToolTimeline />);

  const header = screen.getByText(/Tool Call/);
  await user.click(header);

  // This fails — duration not found
  await waitFor(() => {
    expect(screen.queryByText(/1\.5s|1500ms/i)).toBeTruthy();
  });
});
```

**Investigation Required**:

1. Check ToolTimeline component for duration formatting:

```typescript
// Likely location: features/chat/components/messages/ToolTimeline.tsx
const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};
```

2. Verify duration is passed to component:

```typescript
<ToolTimeline
  duration={1500}  // ms
  isExpanded={isExpanded}
/>
```

3. Check rendering logic in expanded state:

```typescript
{isExpanded && duration && (
  <div className="text-sm text-muted-foreground">
    {formatDuration(duration)}
  </div>
)}
```

**Required Fix**:

Option A — Fix async rendering:

```typescript
it('should display tool duration in expanded state', async () => {
  const { rerender } = render(
    <ToolTimeline duration={1500} isExpanded={false} />
  );

  const header = screen.getByRole('button');
  await user.click(header);

  // Component state changes, wait for render
  rerender(<ToolTimeline duration={1500} isExpanded={true} />);

  // Now duration should be visible
  expect(screen.getByText(/1\.5s/)).toBeInTheDocument();
});
```

Option B — Increase waitFor timeout:

```typescript
await waitFor(
  () => {
    expect(screen.queryByText(/1\.5s|1500ms/i)).toBeTruthy();
  },
  { timeout: 3000 }, // Increase from default 1000ms
);
```

**Test Cases to Add**:

```typescript
describe('ToolTimeline > Duration Display', () => {
  it('should format duration in seconds for values >= 1000ms', () => {
    render(<ToolTimeline duration={1500} isExpanded={true} />);
    expect(screen.getByText('1.5s')).toBeInTheDocument();
  });

  it('should format duration in milliseconds for values < 1000ms', () => {
    render(<ToolTimeline duration={500} isExpanded={true} />);
    expect(screen.getByText('500ms')).toBeInTheDocument();
  });

  it('should not display duration when collapsed', () => {
    render(<ToolTimeline duration={1500} isExpanded={false} />);
    expect(screen.queryByText(/1\.5s|1500ms/i)).not.toBeInTheDocument();
  });
});
```

**Acceptance Criteria**:

- [ ] Duration displays correctly when expanded
- [ ] Format is "1.5s" for >= 1000ms, "500ms" for < 1000ms
- [ ] Duration hidden when collapsed
- [ ] Test passes reliably (no flaky timeouts)

**Estimated Time**: 1-1.5 hours

---

## HIGH (P1) — Core Feature Components

### P1.1: MessageListNew Component Tests

**File**: `/Users/siddhartha/Desktop/agiworkforce/apps/web/features/chat/components/messages/MessageListNew.tsx`

**Current Status**: 0% coverage, untested, critical UI component

**Feature Scope**:

- Virtual scroll rendering (1000+ messages)
- Incremental message loading
- Auto-scroll to latest
- Search/filter integration
- Error boundary
- Loading states

**Test Specifications**:

```typescript
describe('MessageListNew Component', () => {
  describe('Rendering', () => {
    it('should render messages in virtual scrolled container', () => {
      const messages = Array(50).fill(null).map((_, i) => ({
        id: `msg-${i}`,
        content: `Message ${i}`,
        role: 'user',
        createdAt: new Date()
      }));

      render(<MessageListNew messages={messages} />);

      // Only visible messages should be in DOM
      const visibleMessages = screen.getAllByRole('article');
      expect(visibleMessages.length).toBeLessThan(messages.length);
    });

    it('should render all message types (user, assistant, system)', () => {
      const messages = [
        { id: '1', role: 'user', content: 'User message' },
        { id: '2', role: 'assistant', content: 'Assistant message' },
        { id: '3', role: 'system', content: 'System message' }
      ];

      render(<MessageListNew messages={messages} />);

      expect(screen.getByText('User message')).toBeInTheDocument();
      expect(screen.getByText('Assistant message')).toBeInTheDocument();
      expect(screen.getByText('System message')).toBeInTheDocument();
    });

    it('should display loading state when messages are loading', () => {
      render(<MessageListNew messages={[]} isLoading={true} />);
      expect(screen.getByTestId('message-list-skeleton')).toBeInTheDocument();
    });
  });

  describe('Scrolling Behavior', () => {
    it('should auto-scroll to latest message on new message', async () => {
      const messages = [{ id: '1', content: 'First' }];
      const { rerender } = render(<MessageListNew messages={messages} />);

      // Add new message
      const newMessages = [...messages, { id: '2', content: 'Second' }];
      rerender(<MessageListNew messages={newMessages} />);

      // Last message should be in viewport
      const lastMessage = screen.getByText('Second');
      expect(lastMessage).toBeInTheDocument();
    });

    it('should prevent auto-scroll when user has scrolled up', () => {
      // Simulate user scrolling up
      // Add new message
      // Should NOT auto-scroll
    });

    it('should restore scroll position on re-render', async () => {
      // Scroll to middle, unmount, remount
      // Should restore position
    });
  });

  describe('Error Handling', () => {
    it('should display error message when message render fails', () => {
      const messages = [{ id: '1', content: undefined }]; // Invalid
      render(<MessageListNew messages={messages} />);
      expect(screen.getByText(/error|failed/i)).toBeInTheDocument();
    });

    it('should recover gracefully from rendering errors', () => {
      // Boundary test
    });
  });

  describe('Performance', () => {
    it('should handle 1000+ messages without jank', () => {
      const messages = Array(1000).fill(null).map((_, i) => ({
        id: `msg-${i}`,
        content: `Message ${i}`
      }));

      render(<MessageListNew messages={messages} />);

      // Only visible subset in DOM
      const visibleMessages = screen.getAllByRole('article');
      expect(visibleMessages.length).toBeLessThan(100); // Virtualization working
    });
  });
});
```

**Acceptance Criteria**:

- [ ] 15+ test cases passing
- [ ] Coverage >= 80% (lines, functions, branches)
- [ ] Virtual scroll test verifies <100 DOM nodes for 1000 messages
- [ ] Auto-scroll behavior tested and working
- [ ] Error boundaries tested

**Estimated Effort**: 8-12 hours

**Files to Create**:

- `/apps/web/features/chat/components/messages/__tests__/MessageListNew.test.tsx` (500-700 lines)

---

### P1.2: ChatComposerNew Component Tests

**File**: `/Users/siddhartha/Desktop/agiworkforce/apps/web/features/chat/components/Composer/ChatComposerNew.tsx`

**Current Status**: 0% coverage, untested, critical UI component

**Feature Scope**:

- Text input and submission
- Model selector integration
- Focus mode toggle
- Keyboard shortcuts (Cmd+Enter, Shift+Enter, etc.)
- File attachment handling
- Token estimation
- Disabled states

**Test Specifications**:

```typescript
describe('ChatComposerNew Component', () => {
  describe('Input & Submission', () => {
    it('should submit message on Cmd+Enter (Mac)', async () => {
      const onSubmit = vi.fn();
      render(<ChatComposerNew onSubmit={onSubmit} />);

      const input = screen.getByPlaceholderText(/type a message/i);
      await user.click(input);
      await user.keyboard('Hello{Meta>+Enter}');

      expect(onSubmit).toHaveBeenCalledWith({ content: 'Hello' });
    });

    it('should submit message on Ctrl+Enter (Windows)', async () => {
      const onSubmit = vi.fn();
      render(<ChatComposerNew onSubmit={onSubmit} />);

      const input = screen.getByPlaceholderText(/type a message/i);
      await user.keyboard('Hello{Control>+Enter}');

      expect(onSubmit).toHaveBeenCalledWith({ content: 'Hello' });
    });

    it('should insert newline on Shift+Enter', async () => {
      render(<ChatComposerNew />);

      const input = screen.getByPlaceholderText(/type a message/i);
      await user.click(input);
      await user.keyboard('Line1{Shift>+Enter}Line2');

      expect(input).toHaveValue('Line1\nLine2');
    });

    it('should disable submit when input is empty', () => {
      render(<ChatComposerNew />);

      const submitButton = screen.getByRole('button', { name: /send|submit/i });
      expect(submitButton).toBeDisabled();
    });

    it('should enable submit when input has content', async () => {
      render(<ChatComposerNew />);

      const input = screen.getByPlaceholderText(/type a message/i);
      await user.type(input, 'Some message');

      const submitButton = screen.getByRole('button', { name: /send|submit/i });
      expect(submitButton).not.toBeDisabled();
    });
  });

  describe('Model Selection', () => {
    it('should display current model in selector', () => {
      const models = [
        { id: 'claude-opus', name: 'Claude Opus' },
        { id: 'claude-sonnet', name: 'Claude Sonnet' }
      ];

      render(
        <ChatComposerNew
          selectedModel={models[0]}
          availableModels={models}
        />
      );

      expect(screen.getByText('Claude Opus')).toBeInTheDocument();
    });

    it('should switch model without losing input', async () => {
      const models = [
        { id: 'claude-opus', name: 'Claude Opus' },
        { id: 'claude-sonnet', name: 'Claude Sonnet' }
      ];

      const { rerender } = render(
        <ChatComposerNew
          selectedModel={models[0]}
          availableModels={models}
        />
      );

      const input = screen.getByPlaceholderText(/type a message/i);
      await user.type(input, 'My message');

      // Switch model
      rerender(
        <ChatComposerNew
          selectedModel={models[1]}
          availableModels={models}
        />
      );

      // Input should be preserved
      expect(input).toHaveValue('My message');
    });
  });

  describe('Focus Mode', () => {
    it('should toggle focus mode', async () => {
      render(<ChatComposerNew />);

      const focusButton = screen.getByRole('button', { name: /focus/i });
      await user.click(focusButton);

      // Visual state should change
      expect(focusButton).toHaveAttribute('data-active', 'true');
    });

    it('should clear input after submission in focus mode', async () => {
      const onSubmit = vi.fn();
      render(
        <ChatComposerNew
          onSubmit={onSubmit}
          focusMode={true}
        />
      );

      const input = screen.getByPlaceholderText(/type a message/i);
      await user.type(input, 'Message');

      const submitButton = screen.getByRole('button', { name: /send/i });
      await user.click(submitButton);

      expect(input).toHaveValue('');
    });
  });

  describe('File Attachments', () => {
    it('should display file attachment input', () => {
      render(<ChatComposerNew />);

      const attachButton = screen.getByRole('button', { name: /attach|file|upload/i });
      expect(attachButton).toBeInTheDocument();
    });

    it('should show preview of attached files', async () => {
      render(<ChatComposerNew />);

      const fileInput = screen.getByLabelText(/attach file/i);
      const file = new File(['content'], 'test.txt', { type: 'text/plain' });

      await user.upload(fileInput, file);

      expect(screen.getByText('test.txt')).toBeInTheDocument();
    });

    it('should remove attachment when clicking delete', async () => {
      render(<ChatComposerNew />);

      const fileInput = screen.getByLabelText(/attach file/i);
      const file = new File(['content'], 'test.txt', { type: 'text/plain' });
      await user.upload(fileInput, file);

      const removeButton = screen.getByRole('button', { name: /remove|delete/i });
      await user.click(removeButton);

      expect(screen.queryByText('test.txt')).not.toBeInTheDocument();
    });
  });

  describe('Token Estimation', () => {
    it('should display token count for input', async () => {
      render(<ChatComposerNew showTokenCount={true} />);

      const input = screen.getByPlaceholderText(/type a message/i);
      await user.type(input, 'This is a test message');

      // Should show approximate token count
      expect(screen.getByText(/tokens?:/i)).toBeInTheDocument();
    });

    it('should warn when approaching token limit', async () => {
      render(
        <ChatComposerNew
          showTokenCount={true}
          tokenLimit={100}
        />
      );

      const input = screen.getByPlaceholderText(/type a message/i);

      // Type content that exceeds 80% of limit
      const longContent = 'word '.repeat(90);
      await user.type(input, longContent);

      // Should display warning
      expect(screen.getByText(/exceeding|limit/i)).toBeInTheDocument();
    });
  });
});
```

**Acceptance Criteria**:

- [ ] 12+ test cases passing
- [ ] Coverage >= 80%
- [ ] All keyboard shortcuts tested
- [ ] Model switching tested
- [ ] Focus mode toggle verified
- [ ] Token estimation tested

**Estimated Effort**: 6-8 hours

**Files to Create**:

- `/apps/web/features/chat/components/Composer/__tests__/ChatComposerNew.test.tsx` (400-500 lines)

---

### P1.3: ChatSidebarNew Component Tests

**File**: `/Users/siddhartha/Desktop/agiworkforce/apps/web/features/chat/components/Sidebar/ChatSidebarNew.tsx`

**Current Status**: 0% coverage, untested, critical navigation component

**Feature Scope**:

- Session list rendering
- Folder tree expansion
- Search/filter
- Drag-drop reordering
- Delete with confirmation
- Responsive layout

**Test Specifications**: [Similar structure to above, 14+ tests]

**Estimated Effort**: 8-10 hours

---

### P1.4: ArtifactsPanel Component Tests

**File**: `/Users/siddhartha/Desktop/agiworkforce/apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx`

**Current Status**: 0% coverage, untested, user productivity feature

**Feature Scope**:

- Document preview
- Export/save actions
- Edit mode toggle
- Syntax highlighting

**Test Specifications**: [Similar structure, 12+ tests]

**Estimated Effort**: 6-8 hours

---

## MEDIUM (P2) — Feature Completeness

### P2.1: ToolTimeline Extended Tests (6-8 hours)

### P2.2: ReasoningAccordion Tests (2-3 hours)

### P2.3: Audio Components Tests (4-6 hours)

---

## Summary: Implementation Order

**Week 1**:

1. Fix 3 critical issues (3-4h) ← START HERE
2. Begin MessageListNew tests (4-6h of 8-12h)

**Week 2**:

1. Complete MessageListNew (remaining 2-4h)
2. ChatComposerNew tests (6-8h)
3. Start ChatSidebarNew (4-5h of 8-10h)

**Week 3**:

1. Complete ChatSidebarNew (remaining 3-5h)
2. ArtifactsPanel tests (6-8h)
3. Begin Medium priority (P2) tests

**Week 4+**:

1. Remaining P2 & P3 items
2. Integration & E2E tests
3. Coverage validation

---

**Target**: 80%+ coverage by end of Phase 6b ✓
