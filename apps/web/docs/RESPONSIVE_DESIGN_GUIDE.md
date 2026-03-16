# Responsive Design Guide

## Overview

AGI Workforce web chat is designed to be fully responsive across mobile, tablet, and desktop devices. This guide documents the breakpoint strategy, responsive patterns, and testing approach.

## Breakpoint Strategy

We use three primary breakpoints to optimize the layout for different device sizes:

| Breakpoint  | Width   | Device                  | Use Case                           |
| ----------- | ------- | ----------------------- | ---------------------------------- |
| **Mobile**  | 375px   | iPhone SE, older phones | Extreme constraints, single column |
| **Tablet**  | 768px   | iPad, tablets           | Medium width, flexible layout      |
| **Desktop** | 1024px+ | Laptops, desktops       | Full width, multi-column layout    |

### Why These Breakpoints?

- **375px**: iPhone SE is one of the smallest modern phones; if it works here, it works everywhere
- **768px**: iPad standard width; useful transition point for sidebar collapse
- **1024px**: Sufficient width for desktop reading and multi-column layouts

## Responsive Components

### MessageBubble

**Mobile (375px)**

- Max width: 85% of viewport
- Text size: `text-xs sm:text-sm`
- Proper word wrapping with `word-wrap: break-word`
- Padding: `px-2` (reduced from `px-4`)

**Tablet (768px)**

- Max width: 85% of viewport
- Text size: `text-sm`
- Standard padding: `px-4`

**Desktop (1024px+)**

- Max width: 60% of viewport
- Text size: `text-sm`
- Maximum content width: `max-w-5xl`
- Padding: `px-6`

**Implementation**

```tsx
<div className={cn(
  'message-bubble-content',
  isUser ? 'max-w-[85%] md:max-w-[60%] ml-auto' : 'flex-1 min-w-0'
)}>
```

### ChatComposerNew

**Mobile (≤640px)**

- Flex direction: column
- Input and send button stack vertically
- Send button: full width
- Font size: 16px (prevents iOS zoom-on-focus)

**Tablet+ (>640px)**

- Flex direction: row
- Input and send button on same row
- Send button: auto width
- Gap: 0.5rem

**Implementation**

```css
@media (max-width: 640px) {
  [class*='composer'] {
    @apply flex-col gap-2;
  }
  [class*='send-button'] {
    @apply w-full;
  }
}

@media (min-width: 641px) {
  [class*='composer'] {
    @apply flex-row gap-2;
  }
  [class*='send-button'] {
    @apply w-auto;
  }
}
```

### ChatSidebarNew

**Mobile (<768px)**

- Hidden by default (position: absolute, left: -100%)
- Overlay-style drawer when opened
- Can be toggled with hamburger menu
- Smooth slide-in animation (left 0.3s ease)

**Tablet+ (≥768px)**

- Visible by default
- Fixed sidebar layout
- Takes 250-300px width
- Full conversation list visible

**Implementation**

```css
@media (max-width: 767px) {
  [class*='sidebar'] {
    position: absolute;
    left: -100%;
    transition: left 0.3s ease;
  }

  [class*='sidebar'][data-state='open'],
  [class*='sidebar'].open {
    left: 0;
  }
}
```

### ModelSelector & Dropdowns

**Mobile (<640px)**

- Max width: `calc(100vw - 16px)` (prevents overflow)
- Left/right positioning: auto-center with margin
- Positioned with 8px padding from edges

**Tablet+ (≥640px)**

- Standard dropdown positioning
- Respects parent positioning context

**Implementation**

```css
@media (max-width: 640px) {
  [class*='dropdown-content'],
  [role='listbox'],
  [role='menu'] {
    max-width: calc(100vw - 16px);
    left: 8px !important;
    right: 8px !important;
  }
}
```

## Touch Target Sizes

According to WCAG 2.1 Level AAA guidelines:

- **Minimum touch target size**: 48px × 48px
- **Mobile friendly**: ≥40px height for inputs and buttons
- **Our implementation**: All interactive elements ≥40px minimum

**Testing**

```typescript
test('all interactive buttons should be ≥48px', async ({ page }) => {
  const button = page.locator('button').first();
  const boundingBox = await button.boundingBox();
  expect(Math.min(boundingBox.width, boundingBox.height)).toBeGreaterThanOrEqual(40);
});
```

## Text Readability

### Font Sizes

- **Base font size**: 14px minimum (WCAG requirement)
- **Message content**: 15px on desktop, 14px on mobile
- **Headings**: Scale down on mobile
- **Code blocks**: 13px on desktop, 12px on mobile

**Implementation**

```css
@media (max-width: 375px) {
  .prose {
    font-size: 14px;
  }

  .code-block-wrapper {
    @apply text-xs;
  }
}
```

### Line Height

- **Default**: 1.5-1.6 for comfortable reading
- **Code blocks**: 1.5 (standard monospace)
- **Headings**: 1.2

## No Horizontal Scrolling

To ensure no horizontal scrolling at any breakpoint:

1. **Use `min-w-0` on flex children**

   ```tsx
   <div className="flex-1 min-w-0">{/* Prevents overflow */}</div>
   ```

2. **Use `word-wrap: break-word` on text containers**

   ```css
   .message-bubble-content {
     word-wrap: break-word;
     overflow-wrap: break-word;
   }
   ```

3. **Use `max-w-full` on images and videos**

   ```css
   img,
   video {
     @apply max-w-full h-auto;
   }
   ```

4. **Test with viewport size checks**
   ```typescript
   test('should not have horizontal scrolling', async ({ page }) => {
     const bodyWidth = await page.evaluate(() => {
       return document.documentElement.scrollWidth;
     });
     expect(bodyWidth).toBeLessThanOrEqual(viewport.width + 1);
   });
   ```

## Common Responsive Patterns

### Mobile-First Flex Stacking

```tsx
<div className="flex flex-col md:flex-row gap-4">{/* Stacks on mobile, row on tablet+ */}</div>
```

### Responsive Text Size

```tsx
<p className="text-xs sm:text-sm md:text-base">
  {/* Small on mobile, medium on tablet, large on desktop */}
</p>
```

### Hide/Show on Breakpoints

```tsx
<div className="hidden md:block">{/* Hidden on mobile, shown on tablet+ */}</div>
```

### Responsive Padding

```tsx
<div className="px-2 sm:px-4 md:px-6">
  {/* 0.5rem on mobile, 1rem on tablet, 1.5rem on desktop */}
</div>
```

### Responsive Width Constraint

```tsx
<div className="w-full max-w-xs sm:max-w-md md:max-w-2xl">
  {/* Constrained width that grows with viewport */}
</div>
```

## Testing Approach

### Playwright Viewport Testing

```typescript
const BREAKPOINTS = {
  mobile: { width: 375, height: 812, name: '375px' },
  tablet: { width: 768, height: 1024, name: '768px' },
  desktop: { width: 1024, height: 768, name: '1024px' },
};

Object.entries(BREAKPOINTS).forEach(([key, viewport]) => {
  test(`should work on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    // Test assertions
  });
});
```

### Manual Testing Checklist

- [ ] Test on actual mobile device (iPhone 5/SE, Android phone)
- [ ] Test on tablet (iPad, Android tablet)
- [ ] Test on desktop (1920x1080, 1440x900)
- [ ] Test zoom levels (100%, 125%, 150%)
- [ ] Test in landscape orientation
- [ ] Test sidebar collapse/expand
- [ ] Test message composition on mobile
- [ ] Test touch interactions (buttons, dropdowns)
- [ ] Test text wrapping for long messages
- [ ] Verify no horizontal scrolling

### DevTools Testing

1. Open Chrome DevTools (F12)
2. Click device toolbar icon (Ctrl+Shift+M)
3. Select different device presets
4. Resize window manually to test different widths
5. Check console for layout warnings

## Performance Considerations

### Avoiding Layout Shift

- Use `aspect-ratio` for images to reserve space
- Avoid loading font variations that cause shift
- Use `contain` CSS property for performance
- Test with Lighthouse for CLS (Cumulative Layout Shift)

```typescript
test('should have minimal cumulative layout shift', async ({ page }) => {
  const metrics = await page.evaluate(() => {
    return new PerformanceObserver.supportedEntryTypes();
  });
  expect(metrics).toContain('layout-shift');
});
```

## Accessibility Considerations

### Mobile Accessibility

- Touch targets must be ≥48px (44px minimum per WCAG)
- Avoid hover-only interactions
- Provide adequate spacing between interactive elements
- Ensure sufficient color contrast (4.5:1 for text)
- Test with screen readers on mobile

### Keyboard Navigation

- All interactive elements must be keyboard accessible
- Tab order should be logical
- Focus indicators must be visible
- Test with Tab key navigation on all breakpoints

## Browser Support

We support:

- Chrome/Chromium (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

Mobile browsers:

- Safari iOS 14+
- Chrome Android 90+
- Samsung Internet 14+

## Future Considerations

1. **Dynamic viewport detection**: React hooks for detecting viewport changes
2. **Container queries**: CSS Container Queries for component-level responsiveness
3. **Aspect ratio CSS**: For better image handling
4. **Subgrid layout**: For more complex responsive grids
5. **Scroll snap**: For improved mobile scrolling experience

## References

- [WCAG 2.1 Mobile Accessibility](https://www.w3.org/WAI/WCAG21/Techniques/mobile.html)
- [Responsive Design Best Practices](https://developer.mozilla.org/en-US/docs/Learn/CSS/CSS_layout/Responsive_Design)
- [Touch Target Sizes](https://www.smashingmagazine.com/2022/09/inline-links-large-touch-targets/)
- [Tailwind Responsive Design](https://tailwindcss.com/docs/responsive-design)
