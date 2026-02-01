# Accessibility Testing Checklist

## Overview

This comprehensive checklist ensures all accessibility requirements are met before releasing features. Use this for manual testing, code reviews, and QA processes.

**Testing Levels:**

- 🔴 Critical: Must pass before release
- 🟡 Important: Should pass, document if not
- 🟢 Nice-to-have: Enhance user experience

---

## Quick Pre-Release Checklist

Essential checks before any release:

- [ ] No automated accessibility errors (axe, Pa11y)
- [ ] All interactive elements keyboard accessible
- [ ] Focus indicators visible on all elements
- [ ] Color contrast meets WCAG AA (4.5:1 for text)
- [ ] All images have alt text or aria-label
- [ ] Forms have proper labels
- [ ] Page has logical heading structure
- [ ] Tested with at least one screen reader
- [ ] No keyboard traps
- [ ] Errors are announced and identified clearly

---

## Detailed Testing Checklist

### 1. Keyboard Accessibility 🔴

#### Navigation

- [ ] **Tab key** navigates to all interactive elements
- [ ] **Shift + Tab** navigates backwards through elements
- [ ] **Tab order** follows visual layout and logical flow
- [ ] **Arrow keys** work for navigating lists, menus, tabs
- [ ] **Home/End keys** work where applicable (lists, inputs)
- [ ] **Page Up/Down** works in scrollable areas
- [ ] **Skip links** provided and functional (skip to main, skip to nav)
- [ ] **Escape key** closes modals and dismisses overlays
- [ ] **Enter key** activates buttons and links
- [ ] **Space key** activates buttons and toggles checkboxes/switches

#### Focus Management

- [ ] **Focus indicators** visible on all interactive elements
- [ ] **Focus indicators** have sufficient contrast (3:1 minimum)
- [ ] **Focus order** is logical and predictable
- [ ] **Focus visible** on all states (hover, active, focus)
- [ ] **Focus not obscured** by other elements (z-index issues)
- [ ] **Focus restoration** works when closing modals
- [ ] **Focus trapping** works correctly in modals
- [ ] **No keyboard traps** - can always navigate away
- [ ] **Autofocus** used appropriately (modals, forms)
- [ ] **Skip to content** link works and is visible on focus

#### Interactive Elements

- [ ] All **buttons** activate with Enter and Space
- [ ] All **links** activate with Enter
- [ ] All **checkboxes** toggle with Space
- [ ] All **radio buttons** navigate with Arrow keys
- [ ] All **select dropdowns** open and navigate correctly
- [ ] All **custom components** have keyboard support
- [ ] **Sliders** adjust with Arrow/Home/End/PageUp/PageDown
- [ ] **Tabs** navigate with Arrow keys
- [ ] **Accordions** expand/collapse with Enter/Space
- [ ] **Tooltips** show on focus and dismiss with Escape

#### Keyboard Shortcuts

- [ ] **All shortcuts documented** in help/documentation
- [ ] **Shortcuts discoverable** (? key or Cmd/Ctrl+/)
- [ ] **No conflicts** with browser/OS shortcuts
- [ ] **Shortcuts customizable** in settings
- [ ] **Shortcuts work** in all relevant contexts
- [ ] **Single-key shortcuts** can be turned off or require modifier
- [ ] **Shortcut conflicts** detected and reported to user

### 2. Screen Reader Compatibility 🔴

#### NVDA (Windows)

- [ ] **Tested with NVDA** in Firefox and Chrome
- [ ] All **interactive elements announced** correctly
- [ ] **Form fields** have proper labels
- [ ] **Buttons** identified with role and label
- [ ] **Links** have descriptive text
- [ ] **Headings** announced with level
- [ ] **Lists** announced as lists
- [ ] **Landmarks** announced correctly
- [ ] **Live regions** announce updates appropriately
- [ ] **Focus mode** switches automatically in forms
- [ ] **Browse mode** allows reading all content
- [ ] **Tables** navigate correctly with table commands

#### JAWS (Windows)

- [ ] **Tested with JAWS** in Chrome or Edge
- [ ] **Forms mode** activates automatically
- [ ] **Virtual cursor** works in all content areas
- [ ] **ARIA roles** announced correctly
- [ ] **Dynamic content** announced via live regions
- [ ] **Status messages** announced politely
- [ ] **Alerts** announced assertively
- [ ] **Progress updates** announced appropriately

#### VoiceOver (macOS)

- [ ] **Tested with VoiceOver** in Safari
- [ ] **Quick Nav** works (Left+Right arrow)
- [ ] **Rotor** includes relevant items (headings, links, etc.)
- [ ] **Interact** (VO+Shift+Down) works for groups
- [ ] **Form controls** announced and functional
- [ ] **Tables** navigate correctly
- [ ] **Custom components** have appropriate roles

#### General Screen Reader Tests

- [ ] **Page title** announced on page load
- [ ] **Landmark navigation** works (D key in NVDA)
- [ ] **Heading navigation** works (H key)
- [ ] **Link list** accessible (Insert+F7 in JAWS)
- [ ] **Form fields list** accessible (Insert+F5 in JAWS)
- [ ] **Descriptive link text** (not "click here")
- [ ] **Unique page/panel titles** for navigation
- [ ] **Error messages** associated with fields
- [ ] **Instructions** associated with fields
- [ ] **Required fields** identified programmatically

### 3. Visual Accessibility 🔴

#### Color Contrast

- [ ] **Body text** meets 4.5:1 ratio (WCAG AA)
- [ ] **Large text** meets 3:1 ratio (18pt or 14pt bold)
- [ ] **UI components** meet 3:1 ratio (buttons, borders)
- [ ] **Focus indicators** meet 3:1 ratio
- [ ] **Link text** meets 4.5:1 ratio
- [ ] **Placeholder text** meets 4.5:1 ratio
- [ ] **Disabled text** meets 3:1 ratio
- [ ] **Icons** (informative) meet 3:1 ratio
- [ ] **Charts/graphs** use color + pattern/label
- [ ] **Error states** don't rely on color alone

#### Color Independence

- [ ] **Information not conveyed by color alone**
- [ ] **Links distinguishable** without color (underline, icon)
- [ ] **Form validation** uses icons + text, not just color
- [ ] **Charts** use patterns, labels, or texture
- [ ] **Status indicators** use icons + text
- [ ] **Tested with color blindness simulators**:
  - [ ] Protanopia (red-blind)
  - [ ] Deuteranopia (green-blind)
  - [ ] Tritanopia (blue-blind)
  - [ ] Achromatopsia (no color vision)

#### Typography

- [ ] **Font size** minimum 14px (0.875rem)
- [ ] **Line height** minimum 1.5 for body text
- [ ] **Paragraph spacing** at least 1.5x font size
- [ ] **Letter spacing** adjustable without breaking layout
- [ ] **Text resizable** to 200% without loss of content/function
- [ ] **Content reflows** at 400% zoom without horizontal scroll
- [ ] **Text in images** avoided when possible
- [ ] **Font stack** includes system fonts as fallback

#### Visual Indicators

- [ ] **Focus indicators** visible and clear (2px+ outline)
- [ ] **Hover states** provide visual feedback
- [ ] **Active states** provide visual feedback
- [ ] **Disabled states** clear and consistent
- [ ] **Selected states** clear and persistent
- [ ] **Loading indicators** visible and announced
- [ ] **Error indicators** visible and announced
- [ ] **Required field indicators** visible and announced

### 4. Content and Structure 🔴

#### Semantic HTML

- [ ] **HTML5 landmarks** used (`<header>`, `<nav>`, `<main>`, `<aside>`, `<footer>`)
- [ ] **Headings** in logical order (h1 → h2 → h3, no skipping)
- [ ] **Only one h1** per page/view
- [ ] **Lists** use proper markup (`<ul>`, `<ol>`, `<dl>`)
- [ ] **Tables** used for tabular data only
- [ ] **Forms** use semantic elements (`<form>`, `<label>`, `<fieldset>`)
- [ ] **Buttons** use `<button>` not `<div role="button">`
- [ ] **Links** use `<a>` for navigation
- [ ] **Paragraphs** use `<p>` tags
- [ ] **Strong/emphasis** use `<strong>`/`<em>` not `<b>`/`<i>`

#### Heading Structure

- [ ] **Logical hierarchy** maintained
- [ ] **Headings describe** their sections accurately
- [ ] **Headings unique** within their context
- [ ] **Visually hidden headings** for screen reader navigation where needed
- [ ] **No empty headings**
- [ ] **Heading levels don't skip** (h2 after h1, not h3)

#### Links

- [ ] **Link text descriptive** ("Read more about X" not "Read more")
- [ ] **Link purpose** clear from link text alone
- [ ] **External links** indicated (icon + aria-label)
- [ ] **Download links** indicate file type and size
- [ ] **Links visually distinct** from body text
- [ ] **Link visited states** visually distinct
- [ ] **Skip links** provided for navigation bypass

#### Images

- [ ] **Decorative images** have `alt=""` or `aria-hidden="true"`
- [ ] **Informative images** have descriptive alt text
- [ ] **Complex images** have long description or caption
- [ ] **Icons** have `aria-label` or `aria-labelledby`
- [ ] **SVG icons** have `aria-hidden="true"` when decorative
- [ ] **Background images** not used for content
- [ ] **Image maps** have alt text on areas

### 5. Forms 🔴

#### Form Structure

- [ ] **All inputs have labels** (visible or aria-label)
- [ ] **Label associated** with input (for/id or wrapping)
- [ ] **Related fields grouped** with `<fieldset>` and `<legend>`
- [ ] **Form organized** in logical sections
- [ ] **Tab order** follows visual flow
- [ ] **Autofocus** used appropriately (not multiple)
- [ ] **Autocomplete attributes** set for common fields

#### Form Labels

- [ ] **Labels visible** and positioned correctly
- [ ] **Labels clear and concise**
- [ ] **Labels always visible** (not disappearing placeholders)
- [ ] **Required indicators** in label or programmatic
- [ ] **Optional indicators** if most fields required
- [ ] **Placeholder text** supplementary, not replacement
- [ ] **Help text** associated with field (`aria-describedby`)

#### Form Validation

- [ ] **Required fields** identified with `required` or `aria-required`
- [ ] **Validation on submit** or after field blur
- [ ] **Error messages clear** and actionable
- [ ] **Errors associated** with fields (`aria-describedby`)
- [ ] **Error summary** at top of form
- [ ] **Focus moved** to first error or summary
- [ ] **Inline validation** doesn't interrupt typing
- [ ] **Success messages** confirmed
- [ ] **Errors announced** to screen readers (aria-live)

#### Form Controls

- [ ] **Buttons clearly labeled** with purpose
- [ ] **Submit button** identified as submit
- [ ] **Cancel/reset** clearly labeled
- [ ] **Checkboxes** have labels and state announced
- [ ] **Radio buttons** have labels and state announced
- [ ] **Select dropdowns** have labels
- [ ] **Textareas** have labels
- [ ] **Date pickers** keyboard accessible
- [ ] **File uploads** keyboard accessible
- [ ] **Custom controls** have proper ARIA

### 6. Dynamic Content 🟡

#### Live Regions

- [ ] **Status messages** use `aria-live="polite"`
- [ ] **Alerts** use `role="alert"` or `aria-live="assertive"`
- [ ] **Chat messages** use `role="log"` or `aria-live="polite"`
- [ ] **Loading states** announced
- [ ] **Progress updates** announced
- [ ] **Content changes** announced appropriately
- [ ] **Live regions** not overused (not overwhelming)
- [ ] **aria-atomic** set correctly (true/false)
- [ ] **aria-relevant** set when needed

#### Modals and Dialogs

- [ ] **Focus moved** to modal on open
- [ ] **Focus trapped** within modal
- [ ] **Focus returned** to trigger on close
- [ ] **Escape key** closes modal
- [ ] **Background inert** (`aria-hidden="true"`)
- [ ] **Modal purpose** clear from heading/label
- [ ] **role="dialog"** or `role="alertdialog"` set
- [ ] **aria-modal="true"** set
- [ ] **aria-labelledby** points to title
- [ ] **aria-describedby** points to description

#### Single Page Apps

- [ ] **Route changes** announced to screen readers
- [ ] **Page title** updates on route change
- [ ] **Focus managed** on route change
- [ ] **Loading states** communicated
- [ ] **Browser back/forward** work correctly
- [ ] **Deep links** work
- [ ] **Focus not lost** on content updates

### 7. Multimedia 🟡

#### Video

- [ ] **Captions** provided for all video with audio
- [ ] **Audio description** provided or alternative
- [ ] **Transcript** provided
- [ ] **Player controls** keyboard accessible
- [ ] **Player controls** labeled appropriately
- [ ] **Autoplay disabled** or user-controlled
- [ ] **No flashing** content (< 3 times per second)

#### Audio

- [ ] **Transcript** provided
- [ ] **Player controls** keyboard accessible
- [ ] **Player controls** labeled appropriately
- [ ] **Autoplay disabled** or user-controlled
- [ ] **Visual indicator** when audio playing

#### Animations

- [ ] **Respects `prefers-reduced-motion`**
- [ ] **Animations pauseable** if > 5 seconds
- [ ] **No auto-playing** animations > 5 seconds
- [ ] **No parallax** or complex animations for reduced motion
- [ ] **Critical info** not conveyed by animation alone

### 8. Mobile Accessibility 🟡

#### Touch Targets

- [ ] **Minimum size** 44x44 CSS pixels
- [ ] **Adequate spacing** between targets (8px+)
- [ ] **Large enough** for touch interaction
- [ ] **Not overlapping** with other targets

#### Mobile Screen Readers

- [ ] **Tested with VoiceOver** (iOS)
- [ ] **Tested with TalkBack** (Android)
- [ ] **Swipe gestures** work correctly
- [ ] **Double-tap to activate** works
- [ ] **Labels clear** without visual context
- [ ] **Rotor navigation** works (iOS)

#### Responsive Design

- [ ] **Content reflows** on small screens
- [ ] **No horizontal scrolling** (except data tables)
- [ ] **Zoom up to 400%** without loss of content
- [ ] **Orientation works** (portrait and landscape)
- [ ] **Touch and pointer** alternatives provided
- [ ] **No motion-based** input required

### 9. Tables 🟡

#### Data Tables

- [ ] **`<th>` headers** for all columns/rows
- [ ] **`scope` attribute** set (col/row)
- [ ] **`<caption>`** describes table
- [ ] **Complex tables** use `headers` or `id` association
- [ ] **Summary** provided for complex tables
- [ ] **Responsive** on small screens
- [ ] **Navigate with screen reader** table commands

### 10. Custom Components 🟡

#### ARIA Implementation

- [ ] **Semantic HTML used** when possible (before ARIA)
- [ ] **ARIA roles** appropriate for component type
- [ ] **ARIA states** update correctly (aria-expanded, etc.)
- [ ] **ARIA properties** set correctly (aria-haspopup, etc.)
- [ ] **aria-label or aria-labelledby** provides name
- [ ] **aria-describedby** provides description
- [ ] **aria-live** used for dynamic updates
- [ ] **No conflicting** ARIA and native semantics
- [ ] **Keyboard support** matches ARIA pattern
- [ ] **Tested with multiple** screen readers

#### Common Patterns

- [ ] **Accordion** follows disclosure pattern
- [ ] **Tabs** follow tabs pattern
- [ ] **Combobox** follows combobox pattern
- [ ] **Modal** follows dialog pattern
- [ ] **Tooltip** follows tooltip pattern
- [ ] **Menu** follows menu pattern
- [ ] **Slider** follows slider pattern
- [ ] **Progress bar** follows progressbar pattern

### 11. Documentation 🟢

#### User Documentation

- [ ] **Keyboard shortcuts** documented
- [ ] **Accessibility features** documented
- [ ] **Screen reader instructions** provided
- [ ] **Alternative formats** available
- [ ] **Contact info** for accessibility issues

#### Developer Documentation

- [ ] **ARIA patterns** documented
- [ ] **Component accessibility** documented
- [ ] **Testing procedures** documented
- [ ] **Known issues** documented
- [ ] **Remediation plans** documented

---

## Testing Tools

### Automated Testing

**Browser Extensions:**

- [ ] [axe DevTools](https://www.deque.com/axe/devtools/) - Comprehensive testing
- [ ] [WAVE](https://wave.webaim.org/extension/) - Visual feedback
- [ ] [Lighthouse](https://developers.google.com/web/tools/lighthouse) - Chrome DevTools

**Command Line:**

```bash
# Run automated tests
pnpm test:a11y

# Pa11y CI
pa11y-ci --sitemap https://agiworkforce.com/sitemap.xml

# axe CLI
axe https://agiworkforce.com --tags wcag2a,wcag2aa
```

### Manual Testing

**Screen Readers:**

- [ ] NVDA + Firefox (Windows)
- [ ] JAWS + Chrome (Windows)
- [ ] VoiceOver + Safari (macOS)
- [ ] VoiceOver + Safari (iOS)
- [ ] TalkBack + Chrome (Android)

**Keyboard Testing:**

- [ ] Unplug mouse
- [ ] Navigate entire application
- [ ] Test all interactive elements
- [ ] Verify focus indicators
- [ ] Test all shortcuts

**Visual Testing:**

- [ ] Contrast checker (WebAIM, Stark)
- [ ] Color blindness simulator (Toptal, Chrome DevTools)
- [ ] Zoom to 200% and 400%
- [ ] Windows High Contrast Mode
- [ ] Dark mode / Light mode

### User Testing

- [ ] Recruit users with disabilities
- [ ] Test with assistive technology users
- [ ] Conduct task-based tests
- [ ] Record findings
- [ ] Prioritize issues
- [ ] Implement fixes
- [ ] Re-test with users

---

## Issue Severity Ratings

### Critical (Must Fix Before Release)

- Blocks keyboard users from essential features
- Prevents screen reader users from accessing content
- Color contrast fails WCAG AA on important elements
- Form cannot be submitted
- Modal traps keyboard focus permanently

### High (Fix Soon)

- Makes features difficult to use with keyboard
- Screen reader announcements unclear or missing
- Color contrast fails on some elements
- Some interactive elements not keyboard accessible
- Focus indicators weak or missing

### Medium (Plan to Fix)

- Keyboard shortcuts conflict
- ARIA implementation could be improved
- Live regions too verbose or not announcing
- Tables lack proper headers
- Images missing alt text (non-critical)

### Low (Nice to Have)

- Enhancements to existing accessibility
- Additional keyboard shortcuts
- Improved screen reader verbosity
- Better mobile touch targets
- Documentation improvements

---

## Sign-Off Checklist

Before marking a feature as complete:

- [ ] All Critical accessibility issues resolved
- [ ] Automated tests passing (0 violations)
- [ ] Manual keyboard testing complete
- [ ] Screen reader testing complete (at least NVDA or VoiceOver)
- [ ] Visual accessibility verified (contrast, zoom)
- [ ] User testing conducted (if applicable)
- [ ] Documentation updated
- [ ] Known issues documented
- [ ] Team reviewed findings
- [ ] Accessibility champion approved

---

## Resources

- [WCAG 2.1 Quick Reference](https://www.w3.org/WAI/WCAG21/quickref/)
- [WebAIM Checklist](https://webaim.org/standards/wcag/checklist)
- [A11y Project Checklist](https://www.a11yproject.com/checklist/)
- [GOV.UK Accessibility Testing](https://www.gov.uk/service-manual/helping-people-to-use-your-service/testing-for-accessibility)

---

_Last updated: 2026-01-15_
