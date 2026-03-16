# Accessibility Library (a11y)

WCAG 2.1 Level AA compliant utilities and components for AGI Workforce web application.

## Quick Start

Import utilities directly from the a11y library:

```typescript
import {
  // Color contrast
  getContrast,
  isAACompliant,
  getContrastReport,

  // ARIA helpers
  ARIA,
  ROLES,
  KEYS,
  isActivationKey,
  isCloseKey,

  // Keyboard navigation hooks
  useKeyboardNavigation,
  useFocusTrap,
  useTypeahead,

  // Components
  SkipLinks,
} from '@/lib/a11y';
```

## Modules

### 1. `contrast.ts` — Color Contrast Verification

Utilities for checking color contrast ratios against WCAG standards.

#### Functions

**`getLuminance(color: string): number`**

- Calculates relative luminance using WCAG formula
- Input: hex color (e.g., `#ffffff`)
- Returns: luminance value (0-1)

```typescript
const luminance = getLuminance('#ffffff'); // 1.0
```

**`getContrast(color1: string, color2: string): number`**

- Calculates contrast ratio between two colors
- Returns: ratio (1-21)

```typescript
const ratio = getContrast('#ffffff', '#000000'); // 21.0
```

**`isAACompliant(color1: string, color2: string, isLargeText?: boolean): boolean`**

- Checks WCAG AA compliance
- Large text (18pt+ or 14pt+ bold) requires 3:1
- Normal text requires 4.5:1

```typescript
isAACompliant('#ffffff', '#000000', false); // true (exceeds 4.5:1)
isAACompliant('#ffffff', '#999999', true); // true (exceeds 3:1)
```

**`isAAACompliant(color1: string, color2: string, isLargeText?: boolean): boolean`**

- Checks stricter WCAG AAA compliance
- Large text requires 4.5:1
- Normal text requires 7:1

**`getContrastReport(color1: string, color2: string): object`**

- Returns detailed contrast analysis

```typescript
const report = getContrastReport('#da7756', '#1f2121');
// {
//   ratio: 5.2,
//   wcag: {
//     aa: true,
//     aaa: false,
//     aaLargeText: true,
//     aaaLargeText: true
//   },
//   description: "5.20:1 contrast ratio (AA)"
// }
```

### 2. `aria.ts` — ARIA Helpers

Comprehensive ARIA utilities for accessible component development.

#### ARIA Object

Provides typed helpers for common ARIA attributes:

```typescript
// Labels
<button {...ARIA.label('Close modal')}>×</button>

// State
<div {...ARIA.expanded(isOpen)} />
<div {...ARIA.checked(isChecked)} />
<div {...ARIA.disabled(isDisabled)} />

// Interactive
<div {...ARIA.hasPopup('menu')} />
<div {...ARIA.selected(isSelected)} />

// Regions
<div {...ARIA.live('polite')} />
<div {...ARIA.live('assertive')} />

// Forms
<input {...ARIA.required(true)} />
<input {...ARIA.error(hasError, 'error-message-id')} />

// Navigation
<div {...ARIA.current(isCurrentPage)} />
```

#### ROLES Object

Pre-defined ARIA roles for semantic components:

```typescript
import { ROLES } from '@/lib/a11y';

// All role constants
ROLES.navigation;
ROLES.main;
ROLES.tab;
ROLES.listbox;
ROLES.menu;
ROLES.dialog;
ROLES.progressBar;
// ... and many more
```

#### KEYS Object

Keyboard event keys for consistent handling:

```typescript
import { KEYS, isActivationKey, isCloseKey } from '@/lib/a11y';

function handleKeyDown(event: React.KeyboardEvent) {
  if (isActivationKey(event)) {
    // Handle Enter or Space
  }
  if (isCloseKey(event)) {
    // Handle Escape
  }
}
```

### 3. `useKeyboardNavigation.ts` — Keyboard Navigation Hook

React hook for managing keyboard navigation in lists and menus.

#### `useKeyboardNavigation(options)`

Manages arrow key navigation, item selection, and activation.

```typescript
import { useKeyboardNavigation } from '@/lib/a11y';

function MenuComponent({ items }) {
  const { selectedIndex, handleKeyDown } = useKeyboardNavigation({
    items,
    onSelect: (item, index) => setSelected(item),
    onActivate: (item, index) => handleClick(item),
    direction: 'vertical',
    loop: true,
  });

  return (
    <ul onKeyDown={handleKeyDown} role="menu">
      {items.map((item, idx) => (
        <li
          key={idx}
          role="menuitem"
          aria-selected={idx === selectedIndex}
        >
          {item.label}
        </li>
      ))}
    </ul>
  );
}
```

**Options:**

- `items` (any[]) - Items to navigate through
- `onSelect` ((item, index) => void) - Called when selection changes
- `onActivate` ((item, index) => void) - Called when Enter/Space pressed
- `onCancel` (() => void) - Called when Escape pressed
- `direction` ('vertical' | 'horizontal') - Navigation direction
- `loop` (boolean) - Allow wrapping from last to first

**Returns:**

- `selectedIndex` - Current selection index
- `setSelectedIndex` - Manually set selection
- `moveSelection` - Programmatically move selection
- `handleKeyDown` - Attach to element for keyboard handling

#### `useFocusTrap(containerRef, isActive)`

Ensures focus stays within a modal or dropdown.

```typescript
import { useFocusTrap } from '@/lib/a11y';

function Modal({ isOpen }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(containerRef, isOpen);

  return (
    <div ref={containerRef} role="dialog" hidden={!isOpen}>
      {/* Modal content */}
    </div>
  );
}
```

#### `useTypeahead(items, getItemKey)`

Character search support for lists.

```typescript
import { useTypeahead } from '@/lib/a11y';

function Combobox({ items }) {
  const { searchQuery, handleCharacterKey } = useTypeahead(
    items,
    (item) => item.name
  );

  return (
    <div onKeyDown={handleCharacterKey}>
      {/* Items matching searchQuery */}
    </div>
  );
}
```

### 4. Components

#### `SkipLinks`

Skip links component for keyboard navigation.

```typescript
import { SkipLinks } from '@/lib/a11y';

export function Layout() {
  return (
    <>
      <SkipLinks />
      <nav>Navigation</nav>
      <main id="main-content">Content</main>
    </>
  );
}
```

## Accessibility Standards

### WCAG 2.1 Level AA

Target compliance level for all components.

| Criterion          | Requirement                           |
| ------------------ | ------------------------------------- |
| **Perceivable**    | Users can perceive content via senses |
| **Operable**       | Users can navigate and interact       |
| **Understandable** | Content is clear and predictable      |
| **Robust**         | Works with assistive technologies     |

### Color Contrast Requirements

| Text Type          | AA    | AAA   |
| ------------------ | ----- | ----- |
| Normal text        | 4.5:1 | 7:1   |
| Large text (18pt+) | 3:1   | 4.5:1 |
| Graphics & UI      | 3:1   | —     |

### Keyboard Navigation

All interactive elements must be:

- Reachable via Tab/Shift+Tab
- Operable via Enter/Space
- Closeable via Escape
- Navigable via Arrow keys (for lists/menus)

### Screen Reader Support

All content must be:

- Announced with proper semantic HTML
- Labeled with descriptive text or aria-label
- Grouped with proper landmark roles
- Updated with aria-live regions for dynamic content

## Best Practices

### Component Development

1. **Use semantic HTML first:**

   ```tsx
   // Good
   <button>Click me</button>
   <a href="/page">Link</a>
   <nav>Navigation</nav>

   // Avoid
   <div role="button" onClick={...}>Click me</div>
   <div role="link" onClick={...}>Link</div>
   ```

2. **Provide alternative text:**

   ```tsx
   <img src="chart.png" alt="Sales increased 15% in Q1" />
   <Icon aria-label="Close" />
   ```

3. **Use the a11y library:**

   ```tsx
   import { ARIA, useKeyboardNavigation } from '@/lib/a11y';

   <button {...ARIA.label('Open menu')}>Menu</button>;
   ```

4. **Test keyboard navigation:**
   - Use Tab to navigate
   - Verify focus order is logical
   - Ensure focus indicators are visible

5. **Verify color contrast:**

   ```typescript
   import { getContrastReport } from '@/lib/a11y';

   const report = getContrastReport('#foreground', '#background');
   if (!report.wcag.aa) {
     console.warn('Colors do not meet WCAG AA');
   }
   ```

### Testing

Run the accessibility audit:

```bash
pnpm a11y:audit
```

Run keyboard navigation E2E tests:

```bash
pnpm test:e2e a11y-keyboard.spec.ts
```

## Common Patterns

### Accessible Button

```tsx
<button {...ARIA.label('Close dialog')} onClick={handleClose} className="focus-visible:ring-2">
  ×
</button>
```

### Accessible Dropdown

```tsx
function Dropdown({ options, value, onChange }) {
  const { selectedIndex, handleKeyDown } = useKeyboardNavigation({
    items: options,
    onSelect: (item, idx) => setSelectedIndex(idx),
    onActivate: (item) => onChange(item),
  });

  return (
    <div>
      <button
        {...ARIA.expanded(isOpen)}
        {...ARIA.hasPopup('listbox')}
        onClick={() => setIsOpen(!isOpen)}
      >
        {value?.label}
      </button>

      {isOpen && (
        <ul role="listbox" onKeyDown={handleKeyDown}>
          {options.map((option, idx) => (
            <li
              key={idx}
              role="option"
              {...ARIA.selected(idx === selectedIndex)}
              onClick={() => onChange(option)}
            >
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

### Accessible Modal

```tsx
function Modal({ isOpen, onClose, children }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(containerRef, isOpen);

  return (
    isOpen && (
      <div ref={containerRef} role="dialog" {...ARIA.modal(true)} aria-label="Modal dialog">
        {children}
        <button onClick={onClose}>Close</button>
      </div>
    )
  );
}
```

## Resources

- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [Accessible Rich Internet Applications (ARIA)](https://www.w3.org/WAI/ARIA/apg/)
- [Web Accessibility Evaluation Tool (WAVE)](https://wave.webaim.org/)
- [WebAIM Resources](https://webaim.org/)
- [Radix UI (Accessible Components)](https://www.radix-ui.com/)
- [React Accessibility](https://react.dev/learn/accessibility)

## Troubleshooting

### Focus Indicator Not Visible

Ensure global focus styles are loaded:

```css
*:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}
```

### Keyboard Navigation Not Working

1. Verify `handleKeyDown` is attached to correct element
2. Check that `preventDefault()` is called for arrow keys
3. Ensure container has `tabindex` or is a semantic container

### Screen Reader Not Announcing Content

1. Check that HTML is semantic (`<nav>`, `<main>`, `<button>`)
2. Add `aria-live` regions for dynamic content
3. Verify images have descriptive `alt` text
4. Check for duplicate IDs in `aria-labelledby`

---

**Version:** 1.0
**Last Updated:** March 16, 2026
**Maintainer:** AGI Workforce Team
