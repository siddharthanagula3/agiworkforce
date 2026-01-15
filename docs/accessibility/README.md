# Accessibility Documentation

## Overview

This directory contains comprehensive accessibility documentation for AGI Workforce, including standards, testing procedures, and implementation guides.

## Documentation Structure

### Core Documents

1. **[ACCESSIBILITY.md](../../ACCESSIBILITY.md)** - Main accessibility standards and compliance status
   - WCAG 2.1 compliance status
   - Accessibility principles
   - Known issues and roadmap
   - Reporting procedures

2. **[ARIA_PATTERNS.md](./ARIA_PATTERNS.md)** - ARIA implementation patterns
   - Common ARIA patterns
   - Component-specific patterns
   - Live regions
   - Testing ARIA

3. **[KEYBOARD_NAVIGATION.md](./KEYBOARD_NAVIGATION.md)** - Complete keyboard navigation guide
   - Global keyboard shortcuts
   - Context-specific shortcuts
   - Focus management
   - Navigation patterns

4. **[SCREEN_READER_GUIDE.md](./SCREEN_READER_GUIDE.md)** - Screen reader compatibility
   - NVDA (Windows)
   - JAWS (Windows)
   - VoiceOver (macOS/iOS)
   - Narrator (Windows)

5. **[TESTING_CHECKLIST.md](./TESTING_CHECKLIST.md)** - Comprehensive testing checklist
   - Pre-release checklist
   - Detailed testing procedures
   - Automated testing
   - Manual testing

6. **[COLOR_CONTRAST.md](./COLOR_CONTRAST.md)** - Color and contrast guidelines
   - WCAG contrast requirements
   - Color palette documentation
   - Color blindness considerations
   - High contrast mode

7. **[INCLUSIVE_DESIGN.md](./INCLUSIVE_DESIGN.md)** - Inclusive design principles
   - Diverse user needs
   - Visual design guidelines
   - Content strategy
   - Interaction design

## Quick Reference

### For Developers

**Before starting a feature:**

1. Review [ACCESSIBILITY.md](../../ACCESSIBILITY.md) for standards
2. Check [ARIA_PATTERNS.md](./ARIA_PATTERNS.md) for implementation patterns
3. Consult [INCLUSIVE_DESIGN.md](./INCLUSIVE_DESIGN.md) for design principles

**During development:**

1. Use [KEYBOARD_NAVIGATION.md](./KEYBOARD_NAVIGATION.md) to implement keyboard support
2. Reference [COLOR_CONTRAST.md](./COLOR_CONTRAST.md) for color choices
3. Follow [ARIA_PATTERNS.md](./ARIA_PATTERNS.md) for proper ARIA usage

**Before release:**

1. Complete [TESTING_CHECKLIST.md](./TESTING_CHECKLIST.md)
2. Test with [SCREEN_READER_GUIDE.md](./SCREEN_READER_GUIDE.md)
3. Run automated accessibility tests
4. Document any known issues

### For Designers

**Design phase:**

1. Follow [INCLUSIVE_DESIGN.md](./INCLUSIVE_DESIGN.md) principles
2. Ensure [COLOR_CONTRAST.md](./COLOR_CONTRAST.md) requirements met
3. Design keyboard interactions per [KEYBOARD_NAVIGATION.md](./KEYBOARD_NAVIGATION.md)
4. Consider diverse user needs from [ACCESSIBILITY.md](../../ACCESSIBILITY.md)

**Handoff:**

1. Document ARIA requirements from [ARIA_PATTERNS.md](./ARIA_PATTERNS.md)
2. Specify keyboard interactions
3. Note focus management requirements
4. Include accessibility annotations

### For QA/Testers

**Testing workflow:**

1. Use [TESTING_CHECKLIST.md](./TESTING_CHECKLIST.md) as primary guide
2. Test keyboard navigation with [KEYBOARD_NAVIGATION.md](./KEYBOARD_NAVIGATION.md)
3. Test screen readers using [SCREEN_READER_GUIDE.md](./SCREEN_READER_GUIDE.md)
4. Verify color contrast per [COLOR_CONTRAST.md](./COLOR_CONTRAST.md)
5. Report issues following [ACCESSIBILITY.md](../../ACCESSIBILITY.md) procedures

## Testing Tools

### Automated Testing

```bash
# Run all accessibility tests
pnpm test:a11y

# Specific test suites
pnpm test:contrast      # Color contrast
pnpm test:aria          # ARIA validation
pnpm test:keyboard      # Keyboard navigation

# Continuous integration
pa11y-ci --sitemap https://agiworkforce.com/sitemap.xml
```

### Browser Extensions

- **axe DevTools** - Comprehensive automated testing
- **WAVE** - Visual accessibility evaluation
- **ARIA DevTools** - ARIA inspection
- **Lighthouse** - Performance and accessibility audits
- **Stark** - Color contrast and vision simulation

### Screen Readers

- **NVDA** (Windows) - [nvaccess.org](https://www.nvaccess.org/)
- **JAWS** (Windows) - [freedomscientific.com](https://www.freedomscientific.com/)
- **VoiceOver** (macOS/iOS) - Built-in
- **Narrator** (Windows) - Built-in

## Common Patterns

### Button with Icon

```tsx
<button aria-label="Delete item">
  <TrashIcon aria-hidden="true" />
</button>
```

### Form Field

```tsx
<div>
  <label htmlFor="email">Email Address</label>
  <input id="email" type="email" required aria-describedby="email-hint" aria-invalid={hasError} />
  <span id="email-hint">We'll never share your email</span>
  {hasError && (
    <div role="alert" aria-live="assertive">
      Please enter a valid email address
    </div>
  )}
</div>
```

### Modal Dialog

```tsx
<Dialog
  open={isOpen}
  onOpenChange={setIsOpen}
  aria-labelledby="dialog-title"
  aria-describedby="dialog-description"
>
  <DialogContent>
    <DialogHeader>
      <DialogTitle id="dialog-title">Confirm Action</DialogTitle>
      <DialogDescription id="dialog-description">
        Are you sure you want to continue?
      </DialogDescription>
    </DialogHeader>
    {/* Dialog content */}
  </DialogContent>
</Dialog>
```

### Live Region

```tsx
<div role="status" aria-live="polite" aria-atomic="true">
  {statusMessage}
</div>

<div role="alert" aria-live="assertive">
  {errorMessage}
</div>
```

## WCAG 2.1 Level AA Quick Checklist

### Perceivable

- [ ] Text alternatives for non-text content
- [ ] Captions for audio/video
- [ ] Content adaptable to different presentations
- [ ] Color contrast minimum 4.5:1 (text)
- [ ] Color contrast minimum 3:1 (UI components)
- [ ] Text resizable to 200% without loss of function
- [ ] No images of text (except logos)

### Operable

- [ ] All functionality keyboard accessible
- [ ] No keyboard traps
- [ ] Adjustable timing for time limits
- [ ] Content doesn't flash > 3 times per second
- [ ] Skip links provided
- [ ] Descriptive page titles
- [ ] Logical focus order
- [ ] Link purpose clear from text
- [ ] Multiple navigation methods
- [ ] Visible focus indicators
- [ ] Touch target size minimum 44x44px

### Understandable

- [ ] Page language identified
- [ ] Language changes marked up
- [ ] Consistent navigation
- [ ] Consistent identification
- [ ] Error identification clear
- [ ] Labels and instructions provided
- [ ] Error suggestions provided
- [ ] Error prevention for important actions

### Robust

- [ ] Valid HTML markup
- [ ] Name, role, value for custom components
- [ ] Status messages announced

## Resources

### Official Standards

- [WCAG 2.1](https://www.w3.org/WAI/WCAG21/quickref/)
- [WAI-ARIA 1.2](https://www.w3.org/TR/wai-aria-1.2/)
- [ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)

### Learning

- [WebAIM](https://webaim.org/)
- [A11y Project](https://www.a11yproject.com/)
- [Inclusive Components](https://inclusive-components.design/)
- [Deque University](https://dequeuniversity.com/)

### Community

- [A11y Slack](https://web-a11y.slack.com/)
- [WebAIM Discussion List](https://webaim.org/discussion/)
- [Accessibility Reddit](https://www.reddit.com/r/accessibility/)

## Support

### Reporting Issues

**Email:** accessibility@agiworkforce.com

**GitHub:** [Create Issue](https://github.com/agiworkforce/agiworkforce/issues/new?labels=accessibility)

**Include:**

- Description of issue
- Steps to reproduce
- Expected vs actual behavior
- Environment (OS, browser, assistive technology)
- Screenshots/videos if applicable

### Response Times

- **Critical:** 24-48 hours
- **High:** 3-5 business days
- **Medium:** 1-2 weeks
- **Low:** 2-4 weeks

## Contributing

We welcome contributions to improve accessibility:

1. Review existing documentation
2. Identify gaps or improvements
3. Submit pull request with changes
4. Include rationale and references
5. Update relevant checklists

---

## Document Status

| Document               | Status     | Last Updated | Next Review |
| ---------------------- | ---------- | ------------ | ----------- |
| ACCESSIBILITY.md       | ✅ Current | 2026-01-15   | 2026-04-15  |
| ARIA_PATTERNS.md       | ✅ Current | 2026-01-15   | 2026-04-15  |
| KEYBOARD_NAVIGATION.md | ✅ Current | 2026-01-15   | 2026-04-15  |
| SCREEN_READER_GUIDE.md | ✅ Current | 2026-01-15   | 2026-04-15  |
| TESTING_CHECKLIST.md   | ✅ Current | 2026-01-15   | 2026-04-15  |
| COLOR_CONTRAST.md      | ✅ Current | 2026-01-15   | 2026-04-15  |
| INCLUSIVE_DESIGN.md    | ✅ Current | 2026-01-15   | 2026-04-15  |

---

_This README is maintained by the Accessibility Team. For questions or suggestions, contact accessibility@agiworkforce.com_

_Last updated: 2026-01-15_
