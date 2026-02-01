# Screen Reader Compatibility Guide

## Overview

This guide provides comprehensive documentation for using AGI Workforce with screen readers, including compatibility information, best practices, and troubleshooting tips.

**Supported Screen Readers:**

- NVDA (Windows) - Primary
- JAWS (Windows) - Primary
- VoiceOver (macOS/iOS) - Primary
- Narrator (Windows) - Basic
- TalkBack (Android) - Basic

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [NVDA (Windows)](#nvda-windows)
3. [JAWS (Windows)](#jaws-windows)
4. [VoiceOver (macOS)](#voiceover-macos)
5. [VoiceOver (iOS)](#voiceover-ios)
6. [Narrator (Windows)](#narrator-windows)
7. [Content Announcement Patterns](#content-announcement-patterns)
8. [Troubleshooting](#troubleshooting)

---

## Getting Started

### Initial Setup

1. **Enable Screen Reader**
   - Ensure your screen reader is running before opening AGI Workforce
   - Configure verbosity settings to your preference
   - Test basic navigation in browser first

2. **Browser Recommendations**
   - NVDA: Firefox or Chrome
   - JAWS: Chrome or Edge
   - VoiceOver: Safari
   - Narrator: Edge

3. **First Visit**
   - Use skip links to navigate to main content
   - Explore page structure with heading navigation
   - Set up preferences in Settings

### Page Structure

AGI Workforce uses semantic HTML and ARIA landmarks:

```
Banner (Header)
  - Site logo and navigation
Navigation (Primary)
  - Main menu items
Main (Content)
  - Chat interface
  - Code editor
  - Terminal
Complementary (Sidebar)
  - Conversation history
  - Context panels
Contentinfo (Footer)
  - Links and information
```

---

## NVDA (Windows)

### Installation

1. Download from [nvaccess.org](https://www.nvaccess.org/)
2. Run installer
3. Restart computer
4. NVDA starts automatically on login

### Essential Commands

| Command          | Action      |
| ---------------- | ----------- |
| `Ctrl + Alt + N` | Start NVDA  |
| `Insert + Q`     | Quit NVDA   |
| `Insert + Space` | NVDA menu   |
| `Insert + F1`    | Help        |
| `Ctrl`           | Stop speech |

### Navigation

#### Browse Mode (Default)

| Command       | Action                 |
| ------------- | ---------------------- |
| `Arrow Keys`  | Read by line/character |
| `Tab`         | Next link/control      |
| `Shift + Tab` | Previous link/control  |
| `H`           | Next heading           |
| `Shift + H`   | Previous heading       |
| `1-6`         | Heading levels         |
| `D`           | Landmark (next)        |
| `Shift + D`   | Landmark (previous)    |
| `F`           | Form field             |
| `B`           | Button                 |
| `L`           | List                   |
| `I`           | List item              |
| `K`           | Link                   |
| `T`           | Table                  |
| `E`           | Edit field             |
| `C`           | Combo box              |
| `R`           | Radio button           |
| `X`           | Checkbox               |

#### Focus Mode (Forms)

NVDA automatically switches to focus mode in forms and interactive widgets.

| Command          | Action                   |
| ---------------- | ------------------------ |
| `Insert + Space` | Toggle browse/focus mode |
| `Tab`            | Next form field          |
| `Shift + Tab`    | Previous form field      |
| `Space`          | Activate button/checkbox |
| `Enter`          | Submit form/activate     |
| `Arrow Keys`     | Navigate select/radio    |

### AGI Workforce Specific

#### Chat Interface

```
NVDA: "Chat interface region"
NVDA: "Message input, edit, blank"
[Type message]
NVDA: "Send button"
[Press Enter or activate button]
NVDA: "Sending message"
NVDA: "Status: AI is thinking..."
NVDA: "New message from AI Assistant"
[Content is read automatically]
```

#### Model Selector

```
NVDA: "Select AI model, button, collapsed"
[Press Enter or Space]
NVDA: "Select AI model, button, expanded"
NVDA: "Available models listbox"
NVDA: "GPT-5.2 option 1 of 5"
[Arrow keys to navigate]
NVDA: "Claude Sonnet option 2 of 5"
[Press Enter to select]
NVDA: "Selected Claude Sonnet"
```

#### Code Blocks

```
NVDA: "Code region"
NVDA: "Python code 15 lines"
[Read with arrow keys or NVDA+C to copy]
NVDA: "Copy code button"
[Activate to copy]
NVDA: "Code copied to clipboard"
```

### NVDA Configuration

#### Recommended Settings

1. **Speech > Settings**
   - Rate: Medium-Fast
   - Pitch: Medium
   - Inflection: 50

2. **Keyboard > Settings**
   - Speak typed characters: Yes
   - Speak typed words: Yes
   - Speak command keys: No

3. **Browse Mode > Settings**
   - Automatic focus mode: On (for web apps)
   - Automatic pass-through: On

4. **Document Formatting**
   - Report headings: Yes
   - Report lists: Yes
   - Report tables: Yes
   - Report links: Yes
   - Report buttons: Yes
   - Report landmarks: Yes

---

## JAWS (Windows)

### Installation

1. Purchase/download from [freedomscientific.com](https://www.freedomscientific.com/)
2. Run installer
3. Activate license
4. Restart computer

### Essential Commands

| Command          | Action       |
| ---------------- | ------------ |
| `Ctrl + Alt + J` | Start JAWS   |
| `Insert + F4`    | Exit JAWS    |
| `Insert + J`     | JAWS menu    |
| `Insert + F1`    | Context help |
| `Ctrl`           | Stop speech  |

### Navigation

#### Virtual Cursor Mode

| Command             | Action            |
| ------------------- | ----------------- |
| `Arrow Keys`        | Read content      |
| `Tab`               | Next link/control |
| `H`                 | Next heading      |
| `Shift + H`         | Previous heading  |
| `R`                 | Landmark/region   |
| `F`                 | Form field        |
| `B`                 | Button            |
| `L`                 | List              |
| `I`                 | List item         |
| `Insert + F5`       | Form fields list  |
| `Insert + F6`       | Headings list     |
| `Insert + F7`       | Links list        |
| `Insert + Ctrl + ;` | Landmarks list    |

#### Forms Mode

| Command       | Action                           |
| ------------- | -------------------------------- |
| `Enter`       | Forms mode (auto-enabled)        |
| `Num Pad +`   | Virtual cursor (exit forms mode) |
| `Tab`         | Next field                       |
| `Shift + Tab` | Previous field                   |
| `Space`       | Select/toggle                    |
| `Arrow Keys`  | Navigate options                 |

### AGI Workforce Specific

#### Chat Interface

```
JAWS: "Chat application region"
JAWS: "Type in edit"
[Type message]
JAWS: "Send button"
[Press Enter]
JAWS: "Message sent"
JAWS: "Live region: AI Assistant is typing"
JAWS: "New message"
[Auto-read or navigate with arrows]
```

#### Terminal Panel

```
JAWS: "Terminal output region"
JAWS: "$ npm install"
[Command executes]
JAWS: "Live region: Installing packages..."
[Output appears]
JAWS: "Log region: Installation complete"
```

### JAWS Configuration

#### Recommended Settings

1. **Basics > Verbosity**
   - Verbosity level: Intermediate
   - Punctuation level: Most
   - Reading speed: 55-65

2. **Web/HTML/PDFs**
   - Forms mode: Auto forms mode
   - Virtual HTML features: On
   - List items: Announce

3. **Sounds**
   - Sound scheme: Eloquence
   - Use sound effects: Yes

---

## VoiceOver (macOS)

### Activation

| Command              | Action                  |
| -------------------- | ----------------------- |
| `Cmd + F5`           | Toggle VoiceOver        |
| `Ctrl + Option (VO)` | VoiceOver modifier keys |
| `VO + H`             | Help menu               |

### Essential Commands

| Command             | Action             |
| ------------------- | ------------------ |
| `VO + A`            | Read all           |
| `VO + Arrow Keys`   | Navigate           |
| `VO + Space`        | Activate           |
| `VO + Shift + Down` | Interact with item |
| `VO + Shift + Up`   | Stop interacting   |
| `Ctrl`              | Stop speech        |
| `VO + U`            | Rotor (web spots)  |
| `VO + Cmd + H`      | Next heading       |
| `VO + Cmd + J`      | Next form control  |
| `VO + Cmd + L`      | Next link          |

### Quick Nav (Web Pages)

Enable with `Left + Right Arrow` together.

| Command      | Action           |
| ------------ | ---------------- |
| `H`          | Next heading     |
| `L`          | Next link        |
| `F`          | Next form field  |
| `B`          | Next button      |
| `T`          | Next table       |
| `Arrow Keys` | Navigate content |

### AGI Workforce Specific

#### Chat Interface

```
VO: "Chat interface region"
VO: "Message input text field"
[Type message]
VO: "Send button"
[VO + Space to activate]
VO: "Message sent"
VO: "AI Assistant is thinking"
[New message appears]
VO: "Message from AI Assistant"
[Navigate with VO + arrow keys]
```

#### Sidebar Navigation

```
VO: "Conversations list"
VO: "You are currently on a list. To interact with items, press VO+Shift+Down"
[Press VO + Shift + Down]
VO: "In list"
VO: "Project Planning, button"
[VO + Space to select]
VO: "Selected Project Planning conversation"
```

### VoiceOver Configuration

#### Rotor Settings

Customize rotor with Settings > Accessibility > VoiceOver > Rotor:

- Headings
- Links
- Form Controls
- Landmarks
- Buttons
- Lists

#### Verbosity

Configure in VoiceOver Utility > Verbosity:

- Text: High verbosity
- Hints: Speak hints after delay
- Punctuation: Most

---

## VoiceOver (iOS)

### Activation

Settings > Accessibility > VoiceOver > On

**Triple-click shortcut:** Settings > Accessibility > Accessibility Shortcut

### Gestures

| Gesture                     | Action                 |
| --------------------------- | ---------------------- |
| `Single tap`                | Select item            |
| `Double tap`                | Activate               |
| `Swipe right`               | Next item              |
| `Swipe left`                | Previous item          |
| `Swipe up`                  | Increment              |
| `Swipe down`                | Decrement              |
| `Two-finger tap`            | Pause/resume speech    |
| `Two-finger swipe up`       | Read all               |
| `Two-finger swipe down`     | Read from current      |
| `Three-finger swipe`        | Scroll                 |
| `Rotor (two-finger rotate)` | Change navigation mode |

### AGI Workforce (iOS)

#### Chat Interface

```
VO: "Message input text field"
[Double tap to activate]
[Type with on-screen keyboard]
VO: "Send button"
[Double tap]
VO: "Message sent"
[New message appears]
VO: "Message from AI"
[Swipe right to read content]
```

#### Rotor Navigation

```
[Two-finger rotate for rotor]
VO: "Headings"
[Swipe up/down to navigate headings]
VO: "Welcome heading level 1"
VO: "Chat heading level 2"
```

---

## Narrator (Windows)

### Activation

| Command              | Action          |
| -------------------- | --------------- |
| `Ctrl + Win + Enter` | Toggle Narrator |
| `Narrator + Esc`     | Exit Narrator   |
| `Narrator + 1`       | Verbosity level |
| `Ctrl`               | Stop reading    |

**Note:** Narrator key is Caps Lock or Insert.

### Navigation

#### Scan Mode

| Command      | Action            |
| ------------ | ----------------- |
| `Arrow Keys` | Navigate          |
| `Tab`        | Next link/control |
| `H`          | Next heading      |
| `D`          | Landmark          |
| `F`          | Form field        |
| `Enter`      | Activate          |
| `Space`      | Toggle scan mode  |

### AGI Workforce Specific

```
Narrator: "Chat application"
Narrator: "Edit message field"
[Type message]
Narrator: "Send button"
[Press Enter or Space]
Narrator: "Sending"
[New message]
Narrator: "AI response"
```

### Narrator Settings

Settings > Ease of Access > Narrator:

- Voice: Select preferred
- Speed: Medium-Fast
- Pitch: Medium
- Verbosity: Level 3-4

---

## Content Announcement Patterns

### Status Messages (Polite)

Non-urgent updates announced when user is idle:

```html
<div aria-live="polite" aria-atomic="true">File uploaded successfully</div>
```

**Announcement:**

```
SR: "File uploaded successfully"
```

### Alerts (Assertive)

Critical messages announced immediately:

```html
<div role="alert" aria-live="assertive">Error: Connection lost</div>
```

**Announcement:**

```
SR: "Alert: Error: Connection lost"
```

### Progress Updates

```html
<div
  role="progressbar"
  aria-valuemin="0"
  aria-valuemax="100"
  aria-valuenow="45"
  aria-label="Upload progress"
></div>
```

**Announcement:**

```
SR: "Upload progress progress bar 45 percent"
```

### Dynamic Content

#### Loading States

```html
<div role="status" aria-live="polite" aria-busy="true">
  <span class="sr-only">Loading content...</span>
</div>
```

**Announcement:**

```
SR: "Loading content"
[Content loads]
SR: "Content loaded"
```

#### Chat Messages

```html
<div role="log" aria-live="polite" aria-relevant="additions">
  <div class="message">New message content</div>
</div>
```

**Announcement:**

```
SR: "New message from AI Assistant: [content]"
```

### Form Validation

#### Success

```html
<div role="status" aria-live="polite">Settings saved successfully</div>
```

**Announcement:**

```
SR: "Settings saved successfully"
```

#### Error

```html
<div role="alert" aria-live="assertive">
  <span>Error: Email address is required</span>
</div>
```

**Announcement:**

```
SR: "Alert: Error: Email address is required"
```

---

## Troubleshooting

### Screen Reader Not Announcing

**Problem:** Live regions not being announced

**Solutions:**

1. Verify `aria-live` is set correctly
2. Check if content is actually changing
3. Ensure aria-atomic is appropriate
4. Try toggling screen reader off and on
5. Test in different browser

### Confusing Announcements

**Problem:** Screen reader saying unexpected things

**Solutions:**

1. Check for redundant ARIA
2. Verify labels are clear
3. Review ARIA role usage
4. Test with multiple screen readers
5. Simplify ARIA implementation

### Cannot Navigate to Content

**Problem:** Content not reachable with screen reader

**Solutions:**

1. Verify content is not `aria-hidden`
2. Check tabindex values
3. Ensure proper focus management
4. Test keyboard navigation
5. Review landmark structure

### Forms Mode Issues

**Problem:** Screen reader not entering forms mode

**Solutions:**

1. Verify proper form semantics
2. Check for role conflicts
3. Manually toggle modes
4. Review form field labels
5. Test with native HTML controls

### Performance Issues

**Problem:** Screen reader responding slowly

**Solutions:**

1. Reduce live region updates
2. Use `aria-atomic="false"` when possible
3. Batch content changes
4. Optimize aria-relevant
5. Test on different hardware

---

## Best Practices

### For Users

1. **Learn your screen reader** - Take time to learn keyboard shortcuts
2. **Explore the interface** - Use landmark and heading navigation
3. **Provide feedback** - Report accessibility issues
4. **Customize settings** - Adjust verbosity and speech rate
5. **Use browse mode** - For reading content
6. **Use focus mode** - For forms and controls

### For Developers

1. **Test with real screen readers** - Don't rely on automated tools alone
2. **Use semantic HTML first** - Before adding ARIA
3. **Provide clear labels** - For all interactive elements
4. **Announce changes** - Use live regions appropriately
5. **Maintain focus** - Ensure logical focus management
6. **Test keyboard navigation** - Before testing with screen reader

---

## Resources

### Screen Reader Software

- **NVDA:** [nvaccess.org](https://www.nvaccess.org/) (Free)
- **JAWS:** [freedomscientific.com](https://www.freedomscientific.com/) (Paid)
- **VoiceOver:** Built into macOS/iOS
- **Narrator:** Built into Windows

### Learning Resources

- [WebAIM Screen Reader Testing](https://webaim.org/articles/screenreader_testing/)
- [NVDA User Guide](https://www.nvaccess.org/files/nvda/documentation/userGuide.html)
- [JAWS Training](https://www.freedomscientific.com/training/)
- [VoiceOver User Guide](https://support.apple.com/guide/voiceover/welcome/mac)

### Support

- **Email:** accessibility@agiworkforce.com
- **Issue Tracker:** [GitHub Issues](https://github.com/agiworkforce/agiworkforce/issues)

---

_Last updated: 2026-01-15_
