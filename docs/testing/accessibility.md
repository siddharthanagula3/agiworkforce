# Accessibility Testing Checklist

## Automated Testing

- [ ] Rate of `axe-core` violations is 0.
- [ ] No console warnings related to ARIA usage.
- [ ] Color contrast passes WCAG AA automatically.

## Manual Testing

### Keyboard Navigation

- [ ] Can tab through all interactive elements in logical order?
- [ ] Is the focus indicator always visible?
- [ ] Can you open/close menus and modals with Enter/Space/Esc?
- [ ] No focus traps?

### Screen Reader (VoiceOver / NVDA)

- [ ] Do images have meaningful `alt` text?
- [ ] Are form inputs clearly labeled?
- [ ] Do dynamic updates (e.g., chat messages) announce automatically (`aria-live`)?
- [ ] Is the heading structure (`h1`-`h6`) logical?

### Zoom & Responsive

- [ ] Does the UI support 200% browser zoom without breaking?
- [ ] Is text readable in High Contrast mode?

## Implementation Summary

- **Status**: Ongoing
- **Compliance Goal**: WCAG 2.1 AA
- **Key Focus Areas**: Chat Interface, Settings Panels, Onboarding Flow.
