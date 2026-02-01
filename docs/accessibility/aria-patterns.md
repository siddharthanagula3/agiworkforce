# ARIA Patterns Documentation

## Overview

This document details the ARIA (Accessible Rich Internet Applications) patterns used throughout AGI Workforce. We follow WAI-ARIA 1.2 specifications and prioritize semantic HTML over ARIA whenever possible.

**Principle:** "No ARIA is better than bad ARIA"

---

## Table of Contents

1. [Implementation Philosophy](#implementation-philosophy)
2. [Common Patterns](#common-patterns)
3. [Component-Specific Patterns](#component-specific-patterns)
4. [Live Regions](#live-regions)
5. [Custom Components](#custom-components)
6. [Testing ARIA](#testing-aria)

---

## Implementation Philosophy

### Semantic HTML First

Always prefer native HTML elements:

```tsx
// ✅ Good: Native button
<button onClick={handleClick}>Submit</button>

// ❌ Bad: Div with ARIA
<div role="button" onClick={handleClick} tabIndex={0}>Submit</div>
```

### When to Use ARIA

Use ARIA only when:

1. Native HTML cannot express the semantics
2. Interactive widgets require additional context
3. Dynamic content needs to be announced
4. Relationships between elements must be explicit

### ARIA Rules

1. **Rule 1**: Use native HTML when possible
2. **Rule 2**: Don't change native semantics unless necessary
3. **Rule 3**: All interactive ARIA controls must be keyboard accessible
4. **Rule 4**: Don't use `role="presentation"` or `aria-hidden="true"` on focusable elements
5. **Rule 5**: All interactive elements must have an accessible name

---

## Common Patterns

### Alert Pattern

**Usage:** Time-sensitive information that requires user attention

```tsx
// Desktop: Alert.tsx
<div role="alert" className="relative w-full rounded-lg border p-4" {...props} />
```

**ARIA Roles:**

- `role="alert"` - Implicit aria-live="assertive"

**Keyboard:** Not interactive (information only)

**Screen Reader:** Immediately announced when rendered

---

### Button Pattern

**Usage:** Trigger actions

```tsx
// Desktop: Button.tsx
<button
  className={buttonVariants({ variant, size, className })}
  disabled={disabled}
  aria-label={ariaLabel}
  {...props}
>
  {children}
</button>
```

**ARIA Attributes:**

- `aria-label` - When button has no visible text (icon-only)
- `aria-pressed` - For toggle buttons (true/false)
- `aria-expanded` - For buttons that expand content (true/false)
- `aria-haspopup` - For buttons that open menus (menu/dialog/listbox)
- `aria-disabled` - Alternative to `disabled` when button needs to stay focusable

**Keyboard:**

- `Enter` or `Space` - Activate
- `Tab` - Navigate to button
- `Shift + Tab` - Navigate away from button

**Example: Toggle Button**

```tsx
<button onClick={toggleSidebar} aria-pressed={sidebarCollapsed} aria-label="Toggle sidebar">
  <Menu size={20} aria-hidden="true" />
</button>
```

---

### Tabs Pattern

**Usage:** Organize content into separate views

```tsx
// Desktop: Tabs.tsx (using Radix UI)
<Tabs value={activeTab} onValueChange={setActiveTab}>
  <TabsList aria-label="Chat settings">
    <TabsTrigger value="general">General</TabsTrigger>
    <TabsTrigger value="advanced">Advanced</TabsTrigger>
  </TabsList>
  <TabsContent value="general">...</TabsContent>
  <TabsContent value="advanced">...</TabsContent>
</Tabs>
```

**ARIA Roles (Automatically applied by Radix UI):**

- `role="tablist"` on TabsList
- `role="tab"` on TabsTrigger
- `role="tabpanel"` on TabsContent
- `aria-selected="true"` on active tab
- `aria-controls` linking tab to panel
- `aria-labelledby` linking panel to tab

**Keyboard:**

- `Arrow Left/Right` - Navigate between tabs
- `Home` - First tab
- `End` - Last tab
- `Tab` - Move focus into tab panel
- `Shift + Tab` - Move focus out of tab panel

**Focus Management:**

- Focus moves to newly selected tab
- Focus enters tab panel on Tab key
- Selected tab is in tab order (tabindex="0")
- Unselected tabs are not in tab order (tabindex="-1")

---

### Dialog (Modal) Pattern

**Usage:** Interrupt workflow to request user input or display critical information

```tsx
// Desktop: Dialog.tsx (using Radix UI)
<Dialog open={isOpen} onOpenChange={setIsOpen}>
  <DialogTrigger asChild>
    <button>Open Settings</button>
  </DialogTrigger>
  <DialogContent aria-describedby="dialog-description">
    <DialogHeader>
      <DialogTitle>Settings</DialogTitle>
      <DialogDescription id="dialog-description">Configure your preferences</DialogDescription>
    </DialogHeader>
    {/* Content */}
  </DialogContent>
</Dialog>
```

**ARIA Roles:**

- `role="dialog"` on content container
- `aria-modal="true"` to indicate modal behavior
- `aria-labelledby` pointing to DialogTitle
- `aria-describedby` pointing to DialogDescription

**Keyboard:**

- `Escape` - Close dialog
- `Tab` - Cycle through focusable elements in dialog
- `Shift + Tab` - Reverse cycle

**Focus Management:**

1. Focus moves to first focusable element when dialog opens
2. Focus is trapped within dialog
3. Background content is inert (aria-hidden="true")
4. Focus returns to trigger element when dialog closes

---

### Combobox (Autocomplete) Pattern

**Usage:** Input with dropdown suggestions

```tsx
// Example: Slash command autocomplete
<div role="combobox" aria-expanded={showAutocomplete} aria-haspopup="listbox">
  <input
    type="text"
    value={content}
    onChange={handleChange}
    aria-autocomplete="list"
    aria-controls="autocomplete-list"
    aria-activedescendant={activeId}
  />
  {showAutocomplete && (
    <ul id="autocomplete-list" role="listbox">
      <li role="option" aria-selected={selected} id={optionId}>
        {suggestion}
      </li>
    </ul>
  )}
</div>
```

**ARIA Attributes:**

- `role="combobox"` on container
- `aria-expanded` - Whether listbox is visible
- `aria-haspopup="listbox"` - Type of popup
- `aria-autocomplete="list"` - Suggests from list
- `aria-controls` - ID of listbox
- `aria-activedescendant` - ID of focused option
- `role="listbox"` on dropdown
- `role="option"` on each item
- `aria-selected` on selected option

**Keyboard:**

- `Arrow Down/Up` - Navigate options
- `Enter` - Select option
- `Escape` - Close listbox
- `Home/End` - First/last option

---

### Checkbox Pattern

**Usage:** Boolean selection

```tsx
// Desktop: Checkbox.tsx (using Radix UI)
<Checkbox
  checked={checked}
  onCheckedChange={onChange}
  aria-label={label}
  aria-describedby={descriptionId}
/>
```

**ARIA Attributes:**

- `role="checkbox"` (automatic via native input or Radix)
- `aria-checked="true|false|mixed"`
- `aria-label` or `aria-labelledby` for accessible name
- `aria-describedby` for additional description

**Keyboard:**

- `Space` - Toggle checked state
- `Tab` - Navigate to/from checkbox

---

### Switch Pattern

**Usage:** On/off toggle

```tsx
// Example: Simple mode toggle
<button
  role="switch"
  aria-checked={isSimpleMode}
  onClick={toggleSimpleMode}
  aria-label="Enable simple mode"
>
  <span aria-hidden="true">{isSimpleMode ? 'On' : 'Off'}</span>
</button>
```

**ARIA Attributes:**

- `role="switch"`
- `aria-checked="true|false"`
- `aria-label` or `aria-labelledby`
- `aria-describedby` for help text

**Visual Requirements:**

- Clear visual indication of on/off state
- Not dependent on color alone

**Keyboard:**

- `Space` - Toggle switch
- `Tab` - Navigate to/from switch

---

### Slider Pattern

**Usage:** Select value from range

```tsx
// Desktop: Slider.tsx (using Radix UI)
<Slider
  value={[value]}
  onValueChange={([v]) => setValue(v)}
  min={0}
  max={100}
  step={1}
  aria-label="Volume"
/>
```

**ARIA Attributes (Radix UI provides):**

- `role="slider"`
- `aria-valuemin` - Minimum value
- `aria-valuemax` - Maximum value
- `aria-valuenow` - Current value
- `aria-valuetext` - Formatted current value
- `aria-label` or `aria-labelledby`
- `aria-orientation="horizontal|vertical"`

**Keyboard:**

- `Arrow Right/Up` - Increase value
- `Arrow Left/Down` - Decrease value
- `Home` - Minimum value
- `End` - Maximum value
- `Page Up/Down` - Large increment/decrement

---

### Progress Bar Pattern

**Usage:** Show progress of operation

```tsx
// Desktop: Progress.tsx
<div
  role="progressbar"
  aria-valuemin={0}
  aria-valuemax={100}
  aria-valuenow={progress}
  aria-label="Upload progress"
>
  <div style={{ width: `${progress}%` }} />
</div>
```

**ARIA Attributes:**

- `role="progressbar"`
- `aria-valuemin` - Minimum value (usually 0)
- `aria-valuemax` - Maximum value (usually 100)
- `aria-valuenow` - Current value (omit for indeterminate)
- `aria-label` or `aria-labelledby`

**For Indeterminate Progress:**

```tsx
<div role="progressbar" aria-label="Loading" aria-busy="true">
  {/* Animated spinner */}
</div>
```

---

### Tooltip Pattern

**Usage:** Provide supplementary information on hover/focus

```tsx
// Desktop: Tooltip.tsx (using Radix UI)
<Tooltip>
  <TooltipTrigger asChild>
    <button aria-label="Help">
      <HelpCircle size={16} />
    </button>
  </TooltipTrigger>
  <TooltipContent>Click to learn more about this feature</TooltipContent>
</Tooltip>
```

**ARIA Attributes:**

- `aria-describedby` on trigger pointing to tooltip
- `role="tooltip"` on content
- `aria-hidden="true"` when tooltip hidden

**Keyboard:**

- `Escape` - Dismiss tooltip
- Focus on trigger shows tooltip
- Mouse hover shows tooltip

**Best Practices:**

- Don't hide essential information in tooltips
- Tooltips should supplement, not replace, visible labels
- Keep tooltip text concise
- Ensure tooltips are dismissible

---

## Component-Specific Patterns

### Chat Input Area

**Current Implementation:** `/apps/desktop/src/components/UnifiedAgenticChat/ChatInputArea.tsx`

```tsx
<textarea
  ref={textareaRef}
  value={content}
  onChange={handleInputChange}
  onKeyDown={handleKeyDown}
  placeholder="Ask me anything..."
  disabled={isInputDisabled}
  aria-label="Chat message input"
  aria-describedby="chat-input-help"
  aria-invalid={!!submitError}
/>;

{
  submitError && (
    <div id="chat-input-error" role="alert" aria-live="assertive">
      {submitError}
    </div>
  );
}

<span id="chat-input-help" className="sr-only">
  Enter to send, Shift+Enter for new line
</span>;
```

**Improvements Needed:**

- Add `aria-describedby` for help text
- Implement `aria-invalid` for error states
- Add `aria-live` region for submission status

---

### Focus Mode Selector

**Current Implementation:** Focus mode buttons in ChatInputArea

```tsx
<button
  onClick={() => setFocusMode(mode.value)}
  aria-pressed={focusMode === mode.value}
  aria-label={`${mode.label} focus mode`}
>
  {mode.label}
</button>
```

**ARIA Pattern:** Toggle button group

- Each button has `aria-pressed` state
- Only one can be active at a time (radio group behavior)
- Visual and programmatic indication of active state

---

### File Attachments

**Current Implementation:** Attachment previews in ChatInputArea

```tsx
<div role="status" aria-live="polite" aria-atomic="true">
  <div className="flex items-center gap-2">
    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
    <span>Processing attachments...</span>
  </div>
</div>;

{
  attachments.map((attachment) => (
    <div key={attachment.id} role="listitem">
      {isImage && <img src={imageUrl} alt={attachment.name} />}
      <button
        onClick={() => removeAttachment(attachment.id)}
        aria-label={`Remove ${attachment.name}`}
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  ));
}
```

**ARIA Pattern:** List with remove buttons

- Attachment list has implicit `role="list"`
- Each item has descriptive remove button
- Processing status announced via live region

---

### Model Selector

**Implementation:** QuickModelSelector component

**ARIA Pattern:** Combobox with listbox popup

```tsx
<Popover open={showModelSelector} onOpenChange={setShowModelSelector}>
  <PopoverTrigger
    aria-haspopup="listbox"
    aria-expanded={showModelSelector}
    aria-label="Select AI model"
  >
    {modelDisplayName}
  </PopoverTrigger>
  <PopoverContent role="listbox" aria-label="Available models">
    {models.map((model) => (
      <button
        role="option"
        aria-selected={model.id === selectedModel}
        onClick={() => selectModel(model.id)}
      >
        {model.name}
      </button>
    ))}
  </PopoverContent>
</Popover>
```

---

### Voice Transcription

**Current Implementation:** Mic button with status indicator

```tsx
<button
  onClick={toggleListening}
  disabled={isInputDisabled || !isVoiceSupported}
  aria-label={isListening ? 'Stop voice recording' : 'Start voice input'}
  aria-pressed={isListening}
>
  {isListening ? <MicOff size={18} /> : <Mic size={18} />}
</button>;

{
  isListening && (
    <div role="status" aria-live="polite" aria-atomic="true">
      <span>Recording...</span>
      {interimTranscript && <span>{interimTranscript}</span>}
    </div>
  );
}
```

**ARIA Pattern:** Toggle button with status

- Button state reflects recording status
- Interim transcript announced via live region
- Clear labeling for current state

---

## Live Regions

### Live Region Types

#### Polite (aria-live="polite")

For non-critical updates that can wait until user is idle:

```tsx
<div aria-live="polite" aria-atomic="true">
  File uploaded successfully
</div>
```

**Use Cases:**

- Form validation success
- Progress updates
- Non-urgent notifications
- Background task completions

#### Assertive (aria-live="assertive")

For critical updates that require immediate attention:

```tsx
<div role="alert" aria-live="assertive">
  Error: Failed to save changes
</div>
```

**Use Cases:**

- Error messages
- Security alerts
- Time-sensitive warnings
- Session expiration notices

#### Off (aria-live="off")

For regions that should never announce (default):

```tsx
<div aria-live="off">{/* Content changes won't be announced */}</div>
```

### Live Region Attributes

**aria-atomic:**

- `true` - Announce entire region content
- `false` - Announce only changed content (default)

```tsx
// Announces entire message
<div aria-live="polite" aria-atomic="true">
  {statusMessage}
</div>

// Announces only new list items
<ul aria-live="polite" aria-atomic="false">
  {messages.map(msg => <li key={msg.id}>{msg.text}</li>)}
</ul>
```

**aria-relevant:**
Specifies what changes should be announced:

- `additions` - New nodes added
- `removals` - Nodes removed
- `text` - Text changes
- `all` - All changes

```tsx
<div aria-live="polite" aria-relevant="additions text">
  {/* Announces new content and text changes */}
</div>
```

### Best Practices

1. **Keep announcements concise** - Screen readers speak updates in full
2. **Don't announce too frequently** - Can overwhelm users
3. **Combine related updates** - Batch changes when possible
4. **Test with real screen readers** - Behavior varies by AT
5. **Provide pause/stop controls** - For long or frequent updates

---

## Custom Components

### AGI Progress Indicator

**Component:** `/apps/desktop/src/components/AGI/ProgressIndicator.tsx`

```tsx
<div
  role="progressbar"
  aria-valuemin={0}
  aria-valuemax={100}
  aria-valuenow={progress}
  aria-label="AGI task progress"
>
  <div className="progress-fill" style={{ width: `${progress}%` }} />
  <span aria-live="polite" aria-atomic="true">
    {progress}% complete, iteration {iteration} of {maxIterations}
  </span>
</div>
```

**ARIA Pattern:** Progress bar with live status updates

---

### Reasoning Accordion

**Component:** `/apps/desktop/src/components/UnifiedAgenticChat/ReasoningAccordion.tsx`

```tsx
<Collapsible open={isOpen} onOpenChange={setIsOpen}>
  <CollapsibleTrigger aria-expanded={isOpen} aria-controls="reasoning-content">
    <span>View Reasoning</span>
    <ChevronDown className={cn(isOpen && 'rotate-180')} aria-hidden="true" />
  </CollapsibleTrigger>
  <CollapsibleContent id="reasoning-content">{reasoningSteps}</CollapsibleContent>
</Collapsible>
```

**ARIA Pattern:** Disclosure widget (accordion)

---

### Terminal Panel

**Component:** `/apps/desktop/src/components/Execution/TerminalPanel.tsx`

```tsx
<div role="log" aria-live="polite" aria-relevant="additions" aria-label="Terminal output">
  {terminalLines.map((line) => (
    <div key={line.id}>{line.text}</div>
  ))}
</div>
```

**ARIA Pattern:** Log region

- New output announced as it appears
- User can navigate through history
- Clear identification as terminal output

---

### Artifact Renderer

**Component:** `/apps/desktop/src/components/UnifiedAgenticChat/ArtifactRenderer.tsx`

```tsx
<div role="region" aria-label={`${artifactType} artifact`}>
  {artifactType === 'code' && (
    <pre role="textbox" aria-readonly="true" aria-label="Code snippet">
      <code>{content}</code>
    </pre>
  )}
  {artifactType === 'spreadsheet' && (
    <table aria-label="Spreadsheet data">{/* Table content */}</table>
  )}
</div>
```

**ARIA Pattern:** Document region with appropriate semantics

---

## Testing ARIA

### Automated Testing

**Tools:**

- axe DevTools
- Pa11y
- Lighthouse

**Command:**

```bash
pnpm test:a11y
```

### Manual Testing

#### Screen Reader Testing

**NVDA (Windows):**

```
1. Start NVDA (Insert + Ctrl + N)
2. Navigate with Tab key
3. Listen for role announcements
4. Test forms mode vs browse mode
5. Verify live region announcements
```

**VoiceOver (macOS):**

```
1. Enable VoiceOver (Cmd + F5)
2. Use VO keys (Ctrl + Option) + arrows
3. Navigate with Tab and VO + arrows
4. Test rotor navigation (VO + U)
5. Verify announcements and feedback
```

#### Keyboard Testing

1. Tab through all interactive elements
2. Verify focus indicators are visible
3. Test all keyboard shortcuts
4. Ensure no keyboard traps
5. Verify logical focus order

#### ARIA Validation

```bash
# Check for common ARIA issues
npm run lint:aria

# Validate ARIA usage
axe --tags wcag2a,wcag2aa,best-practice
```

### Common Issues

**Missing Labels:**

```tsx
// ❌ Bad
<button><Icon /></button>

// ✅ Good
<button aria-label="Delete item">
  <TrashIcon aria-hidden="true" />
</button>
```

**Redundant Roles:**

```tsx
// ❌ Bad
<button role="button">Click me</button>

// ✅ Good
<button>Click me</button>
```

**Incorrect ARIA:**

```tsx
// ❌ Bad
<div role="button" aria-pressed="true">
  Toggle
</div>

// ✅ Good
<button aria-pressed={isPressed}>
  Toggle
</button>
```

**Missing Live Region:**

```tsx
// ❌ Bad
<div>{statusMessage}</div>

// ✅ Good
<div role="status" aria-live="polite">
  {statusMessage}
</div>
```

---

## Resources

**Official Documentation:**

- [WAI-ARIA Authoring Practices Guide (APG)](https://www.w3.org/WAI/ARIA/apg/)
- [ARIA in HTML](https://www.w3.org/TR/html-aria/)
- [Using ARIA](https://www.w3.org/TR/using-aria/)

**Testing:**

- [NVDA Screen Reader](https://www.nvaccess.org/)
- [axe DevTools](https://www.deque.com/axe/devtools/)
- [ARIA Tree](https://chrome.google.com/webstore/detail/aria-tree/bkjfcfmdglnjghdoifjdjpbjfkjicjid)

**Radix UI:**

- [Radix UI Primitives](https://www.radix-ui.com/primitives/docs/overview/accessibility)
- Built-in ARIA support for complex components

---

_Last updated: 2026-01-15_
