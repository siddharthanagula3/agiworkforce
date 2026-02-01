# Inclusive Design Guidelines

## Overview

Inclusive design ensures AGI Workforce is accessible and usable by people with diverse abilities, backgrounds, and contexts. This goes beyond WCAG compliance to create truly inclusive experiences.

**Philosophy:** Design for the margins, benefit the center.

---

## Table of Contents

1. [Inclusive Design Principles](#inclusive-design-principles)
2. [Diverse User Needs](#diverse-user-needs)
3. [Visual Design](#visual-design)
4. [Content Strategy](#content-strategy)
5. [Interaction Design](#interaction-design)
6. [Technical Considerations](#technical-considerations)
7. [Testing with Real Users](#testing-with-real-users)

---

## Inclusive Design Principles

### 1. Recognize Exclusion

Exclusion happens when we solve problems using our own biases.

**Questions to Ask:**

- Who is excluded by this design decision?
- What assumptions are we making about our users?
- Are we designing for ourselves or for our users?
- What barriers are we creating unintentionally?

**Example:**

```tsx
// ❌ Assumes users can see color
<button style={{ color: 'red' }}>Delete</button>

// ✅ Multiple indicators
<button className="destructive">
  <TrashIcon aria-hidden="true" />
  <span>Delete</span>
</button>
```

### 2. Learn from Diversity

Diverse user groups bring unique perspectives and needs.

**User Groups to Consider:**

- Visual: Blind, low vision, color blind
- Auditory: Deaf, hard of hearing
- Motor: Limited dexterity, tremors, paralysis
- Cognitive: Learning disabilities, memory issues, attention disorders
- Temporary: Broken arm, bright sunlight, noisy environment
- Situational: Holding a baby, wearing gloves, using one hand

### 3. Solve for One, Extend to Many

Solutions designed for disability often benefit everyone.

**Examples:**

- **Curb cuts**: Designed for wheelchairs, benefit strollers, luggage, bikes
- **Captions**: Designed for deaf users, benefit language learners, noisy environments
- **Voice commands**: Designed for hands-free, benefit cooking, driving, multitasking
- **Dark mode**: Designed for light sensitivity, benefit everyone in low light

### 4. Provide Equivalent Experiences

Everyone should be able to accomplish the same tasks.

**Not:**

- Separate "accessible" versions
- Feature-limited alternatives
- Different user flows

**Instead:**

- Same features, multiple ways to access
- Flexible interaction methods
- Consistent experience across modalities

```tsx
// ✅ Multiple input methods for same result
<div className="input-group">
  <input type="text" value={message} onChange={handleType} />
  <button onClick={startVoiceInput} aria-label="Voice input">
    <MicIcon />
  </button>
  <button onClick={openFileUpload} aria-label="Attach file">
    <PaperclipIcon />
  </button>
</div>
```

---

## Diverse User Needs

### Visual Disabilities

#### Blindness (Screen Reader Users)

**Needs:**

- Semantic HTML structure
- Proper ARIA labels and roles
- Keyboard navigation
- Text alternatives for images
- Meaningful link text

**Design Considerations:**

```tsx
// ✅ Good: Meaningful structure
<article>
  <header>
    <h2>Article Title</h2>
    <p className="byline">By Author Name</p>
  </header>
  <p>Content...</p>
  <footer>
    <a href="/read-more">Read full article</a>
  </footer>
</article>

// ❌ Bad: Meaningless divs
<div>
  <div class="title">Article Title</div>
  <div>By Author Name</div>
  <div>Content...</div>
  <div><a href="/more">More</a></div>
</div>
```

#### Low Vision

**Needs:**

- High contrast
- Scalable text (up to 200%)
- No loss of content when zooming
- Clear focus indicators
- Sufficient spacing

**Design Considerations:**

```css
/* ✅ Good: Scales well */
.card {
  padding: 1rem; /* Relative units */
  font-size: 1rem;
  line-height: 1.5;
  max-width: 65ch; /* Readable line length */
}

/* Support 200% zoom */
@media (min-width: 320px) {
  html {
    font-size: 100%; /* 16px */
  }
}
```

#### Color Blindness

**Needs:**

- Information not conveyed by color alone
- Sufficient contrast
- Patterns and labels in addition to color
- Clear differentiation between states

**Design Considerations:**

```tsx
// ✅ Good: Multiple indicators
<div className={cn('status-badge', {
  'status-success': status === 'success',
  'status-error': status === 'error',
})}>
  {status === 'success' && <CheckIcon aria-hidden="true" />}
  {status === 'error' && <XIcon aria-hidden="true" />}
  <span>{status}</span>
</div>

// ❌ Bad: Color only
<div style={{ color: status === 'success' ? 'green' : 'red' }}>
  {status}
</div>
```

### Auditory Disabilities

#### Deaf or Hard of Hearing

**Needs:**

- Captions for audio/video
- Visual indicators for sounds
- Text alternatives for audio content
- Visual notifications

**Design Considerations:**

```tsx
// ✅ Good: Visual notification
const NotificationSystem = () => {
  return (
    <>
      {/* Visual notification */}
      <Toast show={hasNotification} type="info">
        <BellIcon aria-hidden="true" />
        <span>New message received</span>
      </Toast>

      {/* Audio notification (optional) */}
      <audio ref={audioRef} src="/notification.mp3" />
    </>
  );
};

// ❌ Bad: Audio only
<audio autoplay src="/alert.mp3" />;
```

### Motor Disabilities

#### Limited Mobility

**Needs:**

- Large touch targets (44x44px minimum)
- No hover-dependent features
- Keyboard accessibility
- Voice control compatibility
- Undo/cancel options

**Design Considerations:**

```tsx
// ✅ Good: Large, well-spaced targets
<button className="touch-target">
  {/* 44px minimum, 8px spacing */}
  <Icon />
  <span>Action</span>
</button>

<style>{`
  .touch-target {
    min-width: 44px;
    min-height: 44px;
    margin: 8px;
    padding: 12px 16px;
  }
`}</style>

// ❌ Bad: Small, cramped buttons
<button style={{ width: '24px', height: '24px', margin: '2px' }}>
  <Icon />
</button>
```

#### Tremors or Limited Precision

**Needs:**

- Forgiving click areas
- Confirmation for critical actions
- Undo functionality
- No time limits
- Avoid hover-dependent UI

**Design Considerations:**

```tsx
// ✅ Good: Confirmation dialog
const DeleteButton = ({ onDelete }) => {
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <>
      <button onClick={() => setShowConfirm(true)}>Delete</button>

      {showConfirm && (
        <ConfirmDialog
          title="Confirm Deletion"
          message="Are you sure you want to delete this item?"
          onConfirm={onDelete}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  );
};

// ❌ Bad: Immediate destructive action
<button onClick={deleteImmediately}>Delete</button>;
```

### Cognitive Disabilities

#### Learning Disabilities

**Needs:**

- Simple, clear language
- Consistent navigation
- Visual hierarchy
- Plenty of white space
- Avoid jargon

**Design Considerations:**

```tsx
// ✅ Good: Clear, simple language
<ErrorMessage>
  <h2>Couldn't save your changes</h2>
  <p>Please check your internet connection and try again.</p>
  <Button onClick={retry}>Try Again</Button>
</ErrorMessage>

// ❌ Bad: Technical jargon
<ErrorMessage>
  Error 503: Service Unavailable.
  The server is temporarily unable to handle the request.
  Status code: HTTP_503_SERVICE_UNAVAILABLE
</ErrorMessage>
```

#### Attention Disorders

**Needs:**

- Minimal distractions
- Clear focus
- Progress indicators
- Ability to pause/resume
- No auto-playing content

**Design Considerations:**

```tsx
// ✅ Good: User-controlled
<section>
  <h2>Video Tutorial</h2>
  <video controls preload="metadata">
    <source src="tutorial.mp4" type="video/mp4" />
    <track kind="captions" src="captions.vtt" />
  </video>
</section>

// ❌ Bad: Auto-play
<video autoplay muted loop>
  <source src="background-video.mp4" />
</video>
```

#### Memory Issues

**Needs:**

- Clear navigation
- Breadcrumbs
- Saved states
- Clear labels
- Contextual help

**Design Considerations:**

```tsx
// ✅ Good: Persistent state
const Form = () => {
  // Auto-save to localStorage
  const [formData, setFormData] = useLocalStorage('form-draft', {});

  return (
    <form>
      <SaveIndicator status="auto-saved" />
      {/* Form fields */}
    </form>
  );
};

// Show where user is
<Breadcrumbs>
  <Link href="/">Home</Link>
  <Link href="/settings">Settings</Link>
  <span aria-current="page">Profile</span>
</Breadcrumbs>;
```

---

## Visual Design

### Typography

#### Readable Font Sizes

```css
/* Minimum sizes */
body {
  font-size: 1rem; /* 16px */
  line-height: 1.5;
}

small {
  font-size: 0.875rem; /* 14px minimum */
}

/* Headings */
h1 {
  font-size: 2.25rem;
} /* 36px */
h2 {
  font-size: 1.875rem;
} /* 30px */
h3 {
  font-size: 1.5rem;
} /* 24px */
h4 {
  font-size: 1.25rem;
} /* 20px */
```

#### Font Families

```css
/* Highly readable fonts */
:root {
  --font-sans: Inter, system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
}

/* Avoid decorative fonts for body text */
```

#### Line Length

```css
/* Optimal reading width */
.content {
  max-width: 65ch; /* 65 characters per line */
}

/* For narrow screens */
@media (max-width: 640px) {
  .content {
    max-width: 100%;
    padding: 0 1rem;
  }
}
```

### Layout

#### White Space

```css
/* Generous spacing */
.card {
  padding: 1.5rem;
  margin-bottom: 1rem;
}

.section {
  padding: 3rem 0;
}

/* Space between interactive elements */
.button-group {
  display: flex;
  gap: 1rem; /* 16px between buttons */
}
```

#### Visual Hierarchy

```css
/* Clear hierarchy */
h1 {
  font-size: 2.25rem;
  font-weight: 700;
  margin-bottom: 1.5rem;
}

h2 {
  font-size: 1.875rem;
  font-weight: 600;
  margin-top: 2rem;
  margin-bottom: 1rem;
}

p {
  margin-bottom: 1rem;
  color: var(--text-secondary);
}
```

### Icons and Graphics

#### Meaningful Icons

```tsx
// ✅ Good: Icon + text
<button>
  <SaveIcon aria-hidden="true" />
  <span>Save Changes</span>
</button>

// ⚠️ Acceptable: Icon only with label
<button aria-label="Save changes">
  <SaveIcon aria-hidden="true" />
</button>

// ❌ Bad: Icon only, no label
<button>
  <SaveIcon />
</button>
```

#### Decorative vs. Informative

```tsx
// Decorative - hidden from screen readers
<img src="decoration.png" alt="" />
<Icon aria-hidden="true" />

// Informative - needs description
<img src="chart.png" alt="Bar chart showing sales increase from $100k to $150k in Q4" />
<Icon aria-label="Warning: Action required" />
```

---

## Content Strategy

### Plain Language

#### Writing Guidelines

1. **Use simple words**
   - ✅ "Use" instead of "Utilize"
   - ✅ "Help" instead of "Facilitate"
   - ✅ "Start" instead of "Initiate"

2. **Keep sentences short**
   - Average 15-20 words
   - One idea per sentence
   - Active voice

3. **Avoid jargon**
   - Explain technical terms
   - Use common words
   - Provide examples

#### Examples

```tsx
// ✅ Good: Plain language
<p>
  We couldn't save your changes because you're not connected to the internet.
  Check your connection and try again.
</p>

// ❌ Bad: Technical jargon
<p>
  Transaction failed due to network timeout. Error code: ERR_NETWORK_TIMEOUT.
  Please verify network connectivity and retry the operation.
</p>
```

### Instructions

#### Step-by-Step

```tsx
// ✅ Good: Clear steps
<ol>
  <li>Click the "New Conversation" button</li>
  <li>Type your message in the text box</li>
  <li>Press Enter to send</li>
</ol>

// ❌ Bad: Vague instructions
<p>
  To create a conversation, use the interface to input text and submit.
</p>
```

### Error Messages

#### Helpful Errors

```tsx
// ✅ Good: Specific, actionable
<Alert type="error">
  <h3>Email address is required</h3>
  <p>Please enter your email address to continue.</p>
</Alert>

// ❌ Bad: Vague, unhelpful
<Alert type="error">
  Invalid input
</Alert>
```

---

## Interaction Design

### Feedback

#### Immediate Feedback

```tsx
// ✅ Good: Clear feedback
const SaveButton = () => {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await save();
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <button onClick={handleSave} disabled={saving}>
      {saving && <Spinner aria-hidden="true" />}
      {saved && <CheckIcon aria-hidden="true" />}
      <span>{saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}</span>
    </button>
  );
};
```

### Error Prevention

#### Confirm Destructive Actions

```tsx
// ✅ Good: Confirmation
const DeleteDialog = ({ onConfirm, onCancel }) => (
  <Dialog>
    <h2>Delete Conversation?</h2>
    <p>This action cannot be undone.</p>
    <ButtonGroup>
      <Button onClick={onCancel}>Cancel</Button>
      <Button variant="destructive" onClick={onConfirm}>
        Delete
      </Button>
    </ButtonGroup>
  </Dialog>
);
```

#### Undo/Redo

```tsx
// ✅ Good: Undo option
const DeletedToast = ({ onUndo }) => (
  <Toast>
    <span>Conversation deleted</span>
    <Button variant="ghost" onClick={onUndo}>
      Undo
    </Button>
  </Toast>
);
```

---

## Technical Considerations

### Progressive Enhancement

Build from a solid foundation:

1. **HTML** - Semantic, accessible structure
2. **CSS** - Visual presentation
3. **JavaScript** - Enhanced interaction

```tsx
// ✅ Good: Works without JS
<form action="/api/search" method="get">
  <input type="search" name="q" required />
  <button type="submit">Search</button>
</form>;

// Enhance with JS
const SearchForm = () => {
  const [results, setResults] = useState([]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    const results = await fetch('/api/search?' + new URLSearchParams(data));
    setResults(await results.json());
  };

  return <form onSubmit={handleSubmit}>{/* Form fields */}</form>;
};
```

### Performance

#### Loading States

```tsx
// ✅ Good: Progressive loading
const ChatInterface = () => {
  return (
    <Suspense fallback={<ChatSkeleton />}>
      <Chat />
    </Suspense>
  );
};

const ChatSkeleton = () => (
  <div role="status" aria-live="polite" aria-busy="true">
    <span className="sr-only">Loading chat...</span>
    <div className="skeleton" />
  </div>
);
```

### Responsive Design

#### Mobile-First

```css
/* Base styles for mobile */
.card {
  padding: 1rem;
  font-size: 1rem;
}

/* Enhance for larger screens */
@media (min-width: 768px) {
  .card {
    padding: 1.5rem;
    font-size: 1.125rem;
  }
}
```

---

## Testing with Real Users

### Recruit Diverse Participants

- People with disabilities
- Various age groups
- Different technical abilities
- Multiple languages/cultures
- Various devices and assistive technologies

### Testing Methods

#### Task-Based Testing

```typescript
const tasks = [
  {
    id: 1,
    description: 'Start a new conversation about planning a project',
    successCriteria: ['User navigates to chat', 'User sends message', 'User receives response'],
  },
  {
    id: 2,
    description: 'Change the AI model to Claude',
    successCriteria: ['User finds model selector', 'User changes model', 'Confirmation shown'],
  },
];
```

#### Think-Aloud Protocol

Ask participants to:

- Verbalize their thoughts
- Explain what they're looking for
- Describe what they see
- Express frustrations
- Suggest improvements

### Document Findings

```typescript
interface TestFinding {
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  affectedUsers: string[];
  reproSteps: string[];
  suggestedFix: string;
  wcagViolation?: string;
}

const findings: TestFinding[] = [
  {
    severity: 'critical',
    description: 'Focus indicator not visible on dark background',
    affectedUsers: ['keyboard users', 'low vision users'],
    reproSteps: ['1. Navigate to chat input', '2. Press Tab', '3. Observe focus indicator'],
    suggestedFix: 'Increase focus ring width to 2px with offset',
    wcagViolation: '2.4.7 Focus Visible',
  },
];
```

---

## Resources

### Guidelines

- [Microsoft Inclusive Design](https://www.microsoft.com/design/inclusive/)
- [Google Material Design Accessibility](https://material.io/design/usability/accessibility.html)
- [Apple Human Interface Guidelines - Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)

### Tools

- [Inclusive Components](https://inclusive-components.design/)
- [A11y Project](https://www.a11yproject.com/)
- [Inclusive Design Principles](https://inclusivedesignprinciples.org/)

### Communities

- [A11y Slack](https://web-a11y.slack.com/)
- [WebAIM Forums](https://webaim.org/discussion/)
- [Accessibility Champions](https://accessibility.blog.gov.uk/)

---

_Last updated: 2026-01-15_
