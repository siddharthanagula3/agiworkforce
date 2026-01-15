# Keyboard Navigation Guide

## Overview

AGI Workforce is fully keyboard accessible. This guide documents all keyboard shortcuts, navigation patterns, and focus management strategies to ensure users can navigate and operate the application without a mouse.

**Target:** 100% keyboard accessibility for all features

---

## Table of Contents

1. [Global Keyboard Shortcuts](#global-keyboard-shortcuts)
2. [Context-Specific Shortcuts](#context-specific-shortcuts)
3. [Focus Management](#focus-management)
4. [Navigation Patterns](#navigation-patterns)
5. [Form Interactions](#form-interactions)
6. [Modal and Dialog Navigation](#modal-and-dialog-navigation)
7. [Customizing Shortcuts](#customizing-shortcuts)
8. [Troubleshooting](#troubleshooting)

---

## Global Keyboard Shortcuts

### Application-Wide

| Shortcut                 | Action                         | Context            |
| ------------------------ | ------------------------------ | ------------------ |
| `Cmd/Ctrl + K`           | Open command palette           | Always available   |
| `Cmd/Ctrl + /`           | Toggle sidebar                 | Always available   |
| `Cmd/Ctrl + \`           | Toggle sidecar                 | When available     |
| `Cmd/Ctrl + ,`           | Open settings                  | Always available   |
| `Cmd/Ctrl + N`           | New conversation               | Chat mode          |
| `Cmd/Ctrl + W`           | Close current tab/conversation | When applicable    |
| `Cmd/Ctrl + T`           | New tab                        | When applicable    |
| `Cmd/Ctrl + Tab`         | Next tab                       | When multiple tabs |
| `Cmd/Ctrl + Shift + Tab` | Previous tab                   | When multiple tabs |
| `Cmd/Ctrl + 1-9`         | Switch to tab 1-9              | When multiple tabs |
| `Escape`                 | Close modal/dismiss overlay    | When modal open    |
| `F1`                     | Open help                      | Always available   |
| `?`                      | Show keyboard shortcuts        | Always available   |

### Accessibility Shortcuts

| Shortcut          | Action                    | Notes               |
| ----------------- | ------------------------- | ------------------- |
| `Tab`             | Navigate forward          | Standard            |
| `Shift + Tab`     | Navigate backward         | Standard            |
| `Enter`           | Activate element          | Buttons, links      |
| `Space`           | Activate button/toggle    | Buttons, checkboxes |
| `Arrow Keys`      | Navigate within component | Lists, menus, tabs  |
| `Home`            | First item                | Lists, inputs       |
| `End`             | Last item                 | Lists, inputs       |
| `Page Up/Down`    | Scroll or jump            | Context-dependent   |
| `Cmd/Ctrl + Home` | Top of page               | Scrollable areas    |
| `Cmd/Ctrl + End`  | Bottom of page            | Scrollable areas    |

---

## Context-Specific Shortcuts

### Chat Interface

| Shortcut               | Action                   | Notes                   |
| ---------------------- | ------------------------ | ----------------------- |
| `Enter`                | Send message             | When input focused      |
| `Shift + Enter`        | New line                 | In message input        |
| `Tab`                  | Accept inline suggestion | When suggestion visible |
| `Escape`               | Dismiss suggestion       | When suggestion visible |
| `Alt + P`              | Open model picker        | In chat view            |
| `Cmd/Ctrl + E`         | Edit last message        | After sending           |
| `Arrow Up`             | Navigate message history | When input empty        |
| `Arrow Down`           | Navigate message history | When navigating history |
| `Cmd/Ctrl + F`         | Search conversation      | In chat view            |
| `Cmd/Ctrl + Shift + C` | Copy code block          | When code block focused |

### Code Editor

| Shortcut              | Action            | Notes          |
| --------------------- | ----------------- | -------------- |
| `Cmd/Ctrl + S`        | Save file         | Editor focused |
| `Cmd/Ctrl + F`        | Find              | Editor focused |
| `Cmd/Ctrl + H`        | Find and replace  | Editor focused |
| `Cmd/Ctrl + G`        | Go to line        | Editor focused |
| `Cmd/Ctrl + /`        | Toggle comment    | Editor focused |
| `Cmd/Ctrl + ]`        | Indent            | Editor focused |
| `Cmd/Ctrl + [`        | Outdent           | Editor focused |
| `Tab`                 | Indent selection  | Text selected  |
| `Shift + Tab`         | Outdent selection | Text selected  |
| `Cmd/Ctrl + D`        | Duplicate line    | Editor focused |
| `Alt + Arrow Up/Down` | Move line up/down | Editor focused |

### Terminal

| Shortcut        | Action            | Notes                   |
| --------------- | ----------------- | ----------------------- |
| `Cmd/Ctrl + C`  | Interrupt process | Terminal focused        |
| `Cmd/Ctrl + V`  | Paste             | Terminal focused        |
| `Cmd/Ctrl + L`  | Clear terminal    | Terminal focused        |
| `Cmd/Ctrl + K`  | Clear scrollback  | Terminal focused        |
| `Ctrl + R`      | Reverse search    | Terminal focused (bash) |
| `Arrow Up/Down` | Command history   | Terminal focused        |
| `Tab`           | Autocomplete      | Terminal focused        |

### File Browser

| Shortcut           | Action           | Notes             |
| ------------------ | ---------------- | ----------------- |
| `Enter`            | Open file/folder | Item focused      |
| `Space`            | Select item      | Item focused      |
| `Arrow Keys`       | Navigate items   | Tree focused      |
| `Arrow Right`      | Expand folder    | Folder focused    |
| `Arrow Left`       | Collapse folder  | Folder focused    |
| `Cmd/Ctrl + A`     | Select all       | File list focused |
| `Cmd/Ctrl + Click` | Multi-select     | With mouse        |
| `Shift + Click`    | Range select     | With mouse        |
| `Delete/Backspace` | Delete selected  | Items selected    |
| `F2`               | Rename           | Item focused      |

### Settings

| Shortcut        | Action            | Notes            |
| --------------- | ----------------- | ---------------- |
| `Arrow Up/Down` | Navigate sections | Settings focused |
| `Enter`         | Select section    | Section focused  |
| `Space`         | Toggle setting    | Toggle focused   |
| `Escape`        | Close settings    | Settings open    |
| `Tab`           | Navigate controls | Settings focused |

---

## Focus Management

### Focus Indicators

All interactive elements have visible focus indicators:

```css
/* Focus ring style */
.focusable:focus-visible {
  outline: 2px solid var(--focus-ring-color);
  outline-offset: 2px;
  border-radius: 4px;
}
```

**Visual Properties:**

- Color: Blue-500 (`#3b82f6`)
- Width: 2px
- Offset: 2px
- Style: Solid
- Contrast ratio: 5.2:1 (exceeds 3:1 minimum)

### Focus Order

Focus order follows:

1. **Visual layout** - Top to bottom, left to right (LTR)
2. **Logical flow** - Matches DOM order
3. **User expectations** - Common patterns respected

**Example: Chat Interface**

```
1. Sidebar toggle button
2. Conversation list
3. Chat message input
4. Send button
5. Attachment button
6. Voice input button
7. Model selector
8. Message history (when present)
```

### Focus Trapping

Modals and dialogs trap focus:

```typescript
// Focus trap implementation
const handleKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'Tab') {
    const focusableElements = modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    if (event.shiftKey) {
      // Shift + Tab
      if (document.activeElement === firstElement) {
        lastElement.focus();
        event.preventDefault();
      }
    } else {
      // Tab
      if (document.activeElement === lastElement) {
        firstElement.focus();
        event.preventDefault();
      }
    }
  }
};
```

### Focus Restoration

When closing modals/overlays:

```typescript
// Store focus origin
const triggerElement = document.activeElement as HTMLElement;

// Open modal
openModal();

// On close, restore focus
const closeModal = () => {
  modal.close();
  triggerElement?.focus();
};
```

**Focus Restoration Scenarios:**

- Closing dialogs → Returns to trigger button
- Dismissing dropdowns → Returns to trigger button
- Closing sidebars → Returns to last focused element in main content
- Closing search → Returns to search trigger or last focused element

---

## Navigation Patterns

### Skip Links

Skip links are provided at the top of the page:

```html
<a href="#main-content" class="skip-link"> Skip to main content </a>
<a href="#navigation" class="skip-link"> Skip to navigation </a>
<a href="#sidebar" class="skip-link"> Skip to sidebar </a>
```

**Visual Treatment:**

- Hidden by default
- Visible on focus
- First in tab order
- High contrast
- Positioned absolutely

```css
.skip-link {
  position: absolute;
  top: -40px;
  left: 0;
  background: var(--background);
  color: var(--foreground);
  padding: 8px 16px;
  text-decoration: none;
  border-radius: 0 0 4px 0;
  z-index: 9999;
}

.skip-link:focus {
  top: 0;
}
```

### Landmark Navigation

Screen reader users can navigate by landmarks:

```html
<header role="banner">
  <!-- Site header -->
</header>

<nav role="navigation" aria-label="Main navigation">
  <!-- Primary navigation -->
</nav>

<main role="main" id="main-content">
  <!-- Main content -->
</main>

<aside role="complementary" aria-label="Chat sidebar">
  <!-- Sidebar content -->
</aside>

<footer role="contentinfo">
  <!-- Footer -->
</footer>
```

### Heading Navigation

Proper heading hierarchy for navigation:

```html
<h1>AGI Workforce</h1>
<h2>Chat</h2>
<h3>Conversation: Project Planning</h3>
<h4>Message from AI Assistant</h4>
<h2>Settings</h2>
<h3>General</h3>
<h3>Appearance</h3>
<h3>Keyboard Shortcuts</h3>
```

**Rules:**

- One `<h1>` per page
- No skipping levels
- Descriptive headings
- Logical hierarchy

---

## Form Interactions

### Text Inputs

| Shortcut                      | Action                    |
| ----------------------------- | ------------------------- |
| `Tab`                         | Next field                |
| `Shift + Tab`                 | Previous field            |
| `Enter`                       | Submit form (single-line) |
| `Cmd/Ctrl + A`                | Select all text           |
| `Cmd/Ctrl + C/X/V`            | Copy/Cut/Paste            |
| `Home/End`                    | Start/End of line         |
| `Cmd/Ctrl + Home/End`         | Start/End of input        |
| `Arrow Left/Right`            | Move cursor               |
| `Cmd/Ctrl + Arrow Left/Right` | Move by word              |

### Select/Dropdown

| Shortcut          | Action                  |
| ----------------- | ----------------------- |
| `Space`           | Open dropdown           |
| `Enter`           | Open dropdown or select |
| `Arrow Up/Down`   | Navigate options        |
| `Home/End`        | First/Last option       |
| `Type characters` | Jump to matching option |
| `Escape`          | Close dropdown          |

### Checkboxes

| Shortcut      | Action               |
| ------------- | -------------------- |
| `Space`       | Toggle checked state |
| `Tab`         | Next checkbox        |
| `Shift + Tab` | Previous checkbox    |

### Radio Buttons

| Shortcut      | Action               |
| ------------- | -------------------- |
| `Arrow Keys`  | Select option        |
| `Tab`         | Next radio group     |
| `Shift + Tab` | Previous radio group |

**Note:** Arrow keys navigate within the same group, Tab moves between groups.

### Sliders

| Shortcut          | Action                 |
| ----------------- | ---------------------- |
| `Arrow Right/Up`  | Increase value         |
| `Arrow Left/Down` | Decrease value         |
| `Home`            | Minimum value          |
| `End`             | Maximum value          |
| `Page Up`         | Increase by large step |
| `Page Down`       | Decrease by large step |

---

## Modal and Dialog Navigation

### Opening Modals

```typescript
// Focus management when opening
const openModal = () => {
  // Store trigger element
  const trigger = document.activeElement as HTMLElement;

  // Open modal
  setModalOpen(true);

  // Move focus to first focusable element
  requestAnimationFrame(() => {
    const firstFocusable = modal.querySelector('[data-autofocus]') as HTMLElement;
    firstFocusable?.focus();
  });
};
```

### Closing Modals

| Shortcut        | Action                     |
| --------------- | -------------------------- |
| `Escape`        | Close modal                |
| `Click outside` | Close modal (configurable) |
| `Close button`  | Close modal                |

### Navigating Within Modal

| Shortcut      | Action                    |
| ------------- | ------------------------- |
| `Tab`         | Next element in modal     |
| `Shift + Tab` | Previous element in modal |
| `Enter`       | Activate button           |
| `Space`       | Activate button/toggle    |

**Focus Trap:**

- Tab cycles through modal elements only
- Cannot tab to background content
- Background is inert (`aria-hidden="true"`)

---

## Customizing Shortcuts

### Settings Interface

Navigate to Settings > Keyboard Shortcuts to customize:

```tsx
<KeyboardShortcutSettings>
  <ShortcutRow
    action="Open Command Palette"
    defaultShortcut="Cmd+K"
    currentShortcut={customShortcuts['command-palette']}
    onEdit={(newShortcut) => updateShortcut('command-palette', newShortcut)}
  />
</KeyboardShortcutSettings>
```

### Programmatic API

```typescript
import { registerKeyboardShortcut } from '@/lib/shortcuts';

// Register custom shortcut
registerKeyboardShortcut({
  id: 'my-action',
  keys: 'Cmd+Shift+P',
  description: 'My custom action',
  handler: () => {
    // Handle action
  },
  scope: 'global', // 'global' | 'editor' | 'chat'
});
```

### Conflict Resolution

When shortcuts conflict:

1. **Scope-specific** overrides global
2. **User-defined** overrides defaults
3. **Warning displayed** in settings
4. **Suggestion provided** for alternative

---

## Troubleshooting

### Focus Not Visible

**Problem:** Focus indicator not showing

**Solutions:**

1. Check `:focus-visible` support
2. Verify custom CSS not overriding
3. Test with different browsers
4. Enable focus debugging:
   ```javascript
   // Add to browser console
   document.addEventListener(
     'focus',
     (e) => {
       console.log('Focus on:', e.target);
     },
     true,
   );
   ```

### Keyboard Trap

**Problem:** Cannot tab out of component

**Solutions:**

1. Check for `tabIndex="-1"` on container
2. Verify no JavaScript preventing default Tab behavior
3. Test with screen reader
4. Report issue with details

### Shortcut Not Working

**Problem:** Keyboard shortcut doesn't trigger action

**Checklist:**

1. ✓ Is shortcut enabled in settings?
2. ✓ Any conflicts with browser/OS shortcuts?
3. ✓ Is focus in correct context?
4. ✓ Check browser console for errors
5. ✓ Try resetting to default shortcuts

### Skip Links Not Working

**Problem:** Skip links don't navigate

**Solutions:**

1. Verify target IDs exist
2. Check if links are focusable
3. Test with screen reader
4. Verify JavaScript not interfering

---

## Testing Keyboard Accessibility

### Manual Test Checklist

- [ ] Tab through all interactive elements
- [ ] Verify focus indicators visible on all elements
- [ ] No keyboard traps detected
- [ ] All functionality accessible via keyboard
- [ ] Shortcuts work as documented
- [ ] Modal focus trapping works correctly
- [ ] Focus restoration works when closing modals
- [ ] Skip links navigate correctly
- [ ] Form submission works with Enter key
- [ ] Dropdowns open and navigate with keyboard
- [ ] Sliders adjust with arrow keys
- [ ] Custom keyboard shortcuts can be configured

### Automated Testing

```bash
# Run keyboard accessibility tests
pnpm test:keyboard

# Check for common issues
pnpm lint:a11y --keyboard-only
```

### Screen Reader Testing

Test keyboard navigation with:

- NVDA + Firefox (Windows)
- JAWS + Chrome (Windows)
- VoiceOver + Safari (macOS)

---

## Resources

- [WebAIM: Keyboard Accessibility](https://webaim.org/techniques/keyboard/)
- [W3C: Keyboard Interface](https://www.w3.org/WAI/WCAG21/Understanding/keyboard.html)
- [MDN: Keyboard-navigable JavaScript widgets](https://developer.mozilla.org/en-US/docs/Web/Accessibility/Keyboard-navigable_JavaScript_widgets)

---

_Last updated: 2026-01-15_
