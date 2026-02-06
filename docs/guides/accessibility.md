# Accessibility Guide

This guide covers the design principles, implementation standards (ARIA), and color contrast requirements for AGI Workforce.

## Inclusive Design Principles

1.  **perceivable**: Information and user interface components must be presentable to users in ways they can perceive.
2.  **Operable**: User interface components and navigation must be operable.
3.  **Understandable**: Information and the operation of user interface must be understandable.
4.  **Robust**: Content must be robust enough that it can be interpreted reliably by a wide variety of user agents, including assistive technologies.

## Color Contrast

We adhere to **WCAG 2.1 Level AA** standards:

- **Normal Text**: 4.5:1 minimum contrast ratio.
- **Large Text** (18pt+ or 14pt+ bold): 3:1 minimum contrast ratio.
- **UI Components & Graphics**: 3:1 minimum contrast ratio against adjacent colors.

## Keyboard Navigation

All interactive elements must be usable without a mouse.

- **Tab Order**: Must follow the visual flow (Left-to-Right, Top-to-Bottom).
- **Focus Ring**: Visible focus indicator on all active elements.
- **Shortcuts**: Common actions should have keyboard equivalents (see `docs/features/keyboard-shortcuts.md`).
- **No Traps**: Keyboard focus should never get "stuck" in a component.

## ARIA Patterns

Use semantic HTML (`<button>`, `<input>`, `<nav>`) whenever possible. Use ARIA only when semantic HTML is insufficient.

### Common Patterns

- **Modals**: Use `role="dialog"`, `aria-modal="true"`. Trap focus within the modal.
- **Alerts**: Use `role="alert"` for live region updates (e.g., error messages).
- **Tabs**: Use `role="tablist"`, `role="tab"`, and `role="tabpanel"`.

## Screen Reader Support

We target compatibility with **NVDA** (Windows) and **VoiceOver** (macOS). Ensure all images have `alt` text and inputs have associated labels (`aria-label` or `<label>`).
