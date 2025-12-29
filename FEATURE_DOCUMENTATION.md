# AGI Workforce - Chat-Centric Interface Features

## Overview

This document describes the new chat-centric interface features implemented for AGI Workforce, including inline panels, slash commands, and intelligent prompt suggestions.

---

## 1. Inline Panels

Inline panels display command outputs directly within chat messages, replacing the old sidecar-based architecture.

### Supported Panel Types

#### 1.1 Terminal Inline Panel

Displays shell command execution results with stdout, stderr, exit codes, and execution metadata.

**Features:**

- Command display with syntax highlighting
- STDOUT section (syntax highlighted, scrollable)
- STDERR section (red-themed, error focused)
- Exit code badge (green for success, red for error)
- Working directory display
- Duration and status metadata
- Copy command and output buttons

**Triggered by:** `/terminal <command>`

#### 1.2 Browser Inline Panel

Shows browser automation results including screenshots, page metadata, and action history.

**Features:**

- Page URL and title display
- Screenshot capture with zoom
- Loading states with skeleton
- Action timeline (clicks, navigation events)
- "Open in Browser" external link
- Error state display
- Action history with timestamps

**Triggered by:** `/browser <url>`

#### 1.3 Code Inline Panel

Displays code file contents inline with language detection and syntax highlighting.

**Features:**

- File path header with language badge
- Syntax highlighting (Monaco editor)
- Line number display
- Language auto-detection from file extension
- Modified status indicator
- Copy code button
- Line count footer

**Triggered by:** `/code <file_path>`

#### 1.4 Database Inline Panel

Shows database query results in a table format with pagination and metadata.

**Features:**

- SQL query display with syntax highlighting
- Result table with virtualized rows
- Pagination (50 rows per page)
- Row count and execution time display
- Column headers with formatting
- Null/boolean/undefined value formatting
- CSV export functionality
- Error display with query information

**Triggered by:** `/database <sql_query>`

### Panel Interactions

**Expand/Collapse:**

- Click on the panel header to toggle collapse/expand state
- Animated transitions with Framer Motion

**Close Panel:**

- Click the X button to remove the panel (removes from message)

**Copy Actions:**

- Each panel type has context-specific copy buttons
- Success toast notification on copy

---

## 2. Slash Commands

Slash commands are special commands that start with `/` and trigger inline panel outputs.

### Command Syntax

```
/command <arguments>
```

### Available Commands

| Command     | Syntax                  | Example                         | Description                                      |
| ----------- | ----------------------- | ------------------------------- | ------------------------------------------------ |
| `/browser`  | `/browser <url>`        | `/browser https://google.com`   | Automate browser actions and capture screenshots |
| `/terminal` | `/terminal <command>`   | `/terminal ls -la`              | Execute shell commands                           |
| `/code`     | `/code <file_path>`     | `/code src/main.ts`             | Open and display code files                      |
| `/database` | `/database <sql_query>` | `/database SELECT * FROM users` | Run database queries                             |

### Slash Command Autocomplete

**How it works:**

1. Type `/` to start a slash command
2. Autocomplete dropdown appears showing available commands
3. Use **Arrow Up/Down** to navigate suggestions
4. Press **Enter** to select a command
5. Press **Escape** to dismiss autocomplete

**Autocomplete Features:**

- Icon for each command
- Description of what the command does
- Example usage
- Keyboard navigation (↑↓ arrows)
- Mouse selection available

### Error Handling

If a slash command execution fails:

1. Error message is displayed in the inline panel
2. Error details shown in red
3. User can retry or use a different command

---

## 3. Prompt Suggestions (Gemini CLI Style)

Intelligent inline suggestions appear as "ghost text" as you type, matching Gemini CLI's behavior.

### How Prompt Suggestions Work

As you type, the system analyzes your input and shows the first matching suggestion as **grayed-out italic text** inside the input field:

```
explain [grayed-out suggestion text here]
         ↑ This is the inline ghost text
```

### Accepting Suggestions

1. **Tab Key:** Accept and append suggestion to input
2. **Escape Key:** Dismiss the suggestion without accepting

### Suggestion Patterns

The system recognizes these common prompt patterns:

#### 3.1 Help Pattern

**Triggers:** `help with <topic>`
**Suggestions:**

- `help me <topic> step by step` - Detailed step-by-step guidance
- `help me <topic> with examples` - Include practical examples
- `help me debug <topic>` - Focus on troubleshooting

#### 3.2 Write Pattern

**Triggers:** `write a <type> for <subject>`
**Suggestions:**

- `write a <type> with comments` - Include explanatory comments
- `write a <type> following best practices` - Industry standards
- `write a <type> with error handling` - Include error handling

#### 3.3 Explain Pattern

**Triggers:** `explain <topic>`
**Suggestions:**

- `explain <topic> like I'm 5` - Simplify for beginners
- `explain <topic> with examples` - Practical examples
- `explain <topic> in detail` - Deep dive explanation

#### 3.4 How To Pattern

**Triggers:** `how to <task>`
**Suggestions:**

- `how to <task> in Python` - Python solution
- `how to <task> in JavaScript` - JavaScript solution
- `how to <task> step by step` - Detailed walkthrough

#### 3.5 Create Pattern

**Triggers:** `create a <thing>`
**Suggestions:**

- `create a <thing> with tests` - Include test cases
- `create a <thing> from scratch` - Start from zero
- `create a <thing> with documentation` - Include documentation

#### 3.6 Fix Pattern

**Triggers:** `fix <issue>`
**Suggestions:**

- `fix <issue> and explain the issue` - Fix and explain root cause
- `fix <issue> without breaking tests` - Ensure tests still pass
- `fix <issue> with a better approach` - Find optimal solution

#### 3.7 Optimize Pattern

**Triggers:** `optimize <thing>`
**Suggestions:**

- `optimize <thing> for performance` - Focus on speed
- `optimize <thing> for readability` - Make it clearer
- `optimize <thing> for memory usage` - Reduce memory footprint

#### 3.8 Refactor Pattern

**Triggers:** `refactor <code>`
**Suggestions:**

- `refactor <code> to be more modular` - Break into smaller pieces
- `refactor <code> using design patterns` - Apply design patterns
- `refactor <code> for better testing` - Improve testability

### Fallback Suggestions

When input doesn't match specific patterns, general suggestions appear:

- ` with examples` - Add practical examples
- ` step by step` - Break into steps
- ` with code` - Include code samples
- ` in detail` - Deep dive explanation
- ` for beginners` - Simplify for learning
- ` for production` - Production-ready solution

### Suggestion Behavior

- Suggestions **only appear** when not typing a slash command (`/`)
- **First matching suggestion** is shown as ghost text
- Appears only when input length > 0
- Suggestions are **non-intrusive** - doesn't interfere with typing
- Dismisses automatically when you press Escape
- Accepts automatically when you press Tab

### Accessibility

- **ARIA labels** for screen readers
- **Keyboard navigation** with Tab and Escape
- **Title attributes** providing description on hover
- Clear visual distinction (gray italic text)

---

## 4. Keyboard Shortcuts

### Chat Input

| Shortcut                           | Action                           |
| ---------------------------------- | -------------------------------- |
| **Tab**                            | Accept inline prompt suggestion  |
| **Escape**                         | Dismiss inline prompt suggestion |
| **Enter**                          | Send message                     |
| **Shift+Enter**                    | Add newline without sending      |
| **↑ / ↓** (in slash autocomplete)  | Navigate command suggestions     |
| **Enter** (in slash autocomplete)  | Select command                   |
| **Escape** (in slash autocomplete) | Close autocomplete               |

---

## 5. Usage Examples

### Example 1: Run Terminal Command

```
User: /terminal npm run build
→ Terminal inline panel appears showing:
  - Command: npm run build
  - Working directory: /workspace
  - STDOUT: [build output]
  - Exit code: 0 (success badge)
  - Duration: 2345ms
```

### Example 2: Browse Website

```
User: /browser https://google.com
→ Browser inline panel appears showing:
  - URL: https://google.com
  - Title: Google
  - Screenshot: [page screenshot]
  - Actions: [clicks and navigation events]
```

### Example 3: View Code File

```
User: /code src/main.tsx
→ Code inline panel appears showing:
  - File: src/main.tsx
  - Language: TypeScript
  - Content: [file code with syntax highlighting]
  - Lines: 150
```

### Example 4: Query Database

```
User: /database SELECT * FROM users LIMIT 10
→ Database inline panel appears showing:
  - Query: SELECT * FROM users LIMIT 10
  - Results: [table with 10 rows]
  - Row count: 1,250 total rows
  - Execution time: 45ms
```

### Example 5: Prompt Suggestions

```
User: explain
→ Ghost text appears: " with examples"
→ User presses Tab
→ Input becomes: "explain with examples"

User: write a function
→ Ghost text appears: " for this task with comments"
→ User presses Tab
→ Input becomes: "write a function for this task with comments"
```

---

## 6. Implementation Details

### Architecture

```
ChatInputArea.tsx
├── useSlashCommands hook (parsing)
├── useSlashCommandAutocomplete hook (suggestions)
├── usePromptSuggestions hook (continuation suggestions)
└── Inline ghost text rendering

UnifiedAgenticChat/index.tsx
├── Slash command handler routing
├── Panel creation and management
└── Message updates

MessageBubble.tsx
├── InlinePanelRenderer
├── TerminalInlinePanel
├── BrowserInlinePanel
├── CodeInlinePanel
└── DatabaseInlinePanel

Handlers (slashCommandHandlers.ts)
├── executeTerminalCommand
├── executeBrowserCommand
├── executeCodeCommand
└── executeDatabaseCommand
```

### State Management

- **Slash command autocomplete:** Dropdown index tracking
- **Inline suggestions:** Current suggestion text
- **Inline panels:** Message-associated panels array
- **Panel collapse:** Per-panel toggle state

### Performance Considerations

- Inline panels use Framer Motion for smooth animations
- Large outputs (database results) use virtualization
- Ghost text is non-interactive (pointer-events: none)
- Suggestions computed with useMemo
- Components memoized to prevent unnecessary re-renders

---

## 7. Accessibility

### Features

- ✅ ARIA labels and roles for screen readers
- ✅ Keyboard-navigable autocomplete
- ✅ Tab key support for suggestions
- ✅ Semantic HTML structure
- ✅ Color-coded status badges (with text fallback)
- ✅ High contrast text for visibility

### Keyboard Navigation

All features are fully keyboard accessible:

- Type `/` + arrow keys to select commands
- Tab to accept suggestions
- Escape to dismiss overlays
- Enter to send messages

---

## 8. Configuration

### Environment Variables

None required - features work out of the box.

### Tauri Commands Required

The application expects these Tauri backend commands:

```rust
// In your Tauri backend
execute_shell_command(command: string) -> { stdout, stderr, exit_code, cwd, duration_ms }
browser_automation_execute(request: BrowserRequest) -> { url, title, screenshot, actions }
file_read(path: string) -> { content, language }
db_execute_query(sql: string) -> { columns, rows, rowCount }
```

---

## 9. Future Enhancements

Potential improvements:

- [ ] Custom slash commands registration
- [ ] Suggestion ranking by context
- [ ] Command history with Ctrl+R search
- [ ] Bulk operations from panels
- [ ] Export panel results to file
- [ ] Panel result caching
- [ ] Suggestion learning from user behavior

---

## 10. Troubleshooting

### Suggestions Not Appearing

**Problem:** Inline suggestions not showing
**Solution:**

- Verify you're not typing a slash command (starts with `/`)
- Check that input length > 0
- Try typing one of the recognized patterns (explain, help, write, etc.)

### Slash Commands Failing

**Problem:** Command execution fails with error
**Solution:**

- Check Tauri backend has required command implementations
- Verify command arguments are correct
- Check system permissions (terminal, file access)
- Review error message in the panel

### Panel Not Rendering

**Problem:** Inline panel doesn't appear
**Solution:**

- Verify message has `inlinePanels` array populated
- Check browser console for errors
- Try refreshing the application
- Check that panel handler is wired up in `index.tsx`

---

## 11. Related Files

### Core Components

- `ChatInputArea.tsx` - Input with slash command autocomplete
- `UnifiedAgenticChat/index.tsx` - Main chat component
- `MessageBubble.tsx` - Message rendering with panels
- `InlinePanels/InlinePanelRenderer.tsx` - Panel type router

### Hooks

- `useSlashCommands.ts` - Command parsing
- `useSlashCommandAutocomplete.ts` - Autocomplete suggestions
- `usePromptSuggestions.ts` - Continuation suggestions

### Handlers

- `slashCommandHandlers.ts` - Command execution logic

### Store

- `unifiedChatStore.ts` - Message and panel state management

---

## 12. Version History

### v1.0.0 (Current)

- ✅ Inline panels (terminal, browser, code, database)
- ✅ Slash commands system
- ✅ Gemini CLI-style prompt suggestions
- ✅ Full keyboard navigation
- ✅ Accessibility support
- ✅ TypeScript strict mode

---

**Last Updated:** 2025-12-28
**Status:** Production Ready
