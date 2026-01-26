# AGI Workforce Design System

**Version 1.0.0** | Last Updated: January 15, 2026

Comprehensive design system documentation for AGI Workforce desktop and web applications, featuring a premium agentic workspace aesthetic with Claude-inspired interactions.

---

## Table of Contents

1. [Overview](#overview)
2. [Design Principles](#design-principles)
3. [Color System](#color-system)
4. [Typography](#typography)
5. [Spacing & Layout](#spacing--layout)
6. [Radix UI Components](#radix-ui-components)
7. [Tailwind CSS v4 Customization](#tailwind-css-v4-customization)
8. [Icon System](#icon-system)
9. [Component Library Catalog](#component-library-catalog)
10. [Accessibility Standards](#accessibility-standards)
11. [Animation & Interaction Guidelines](#animation--interaction-guidelines)
12. [Responsive Design Breakpoints](#responsive-design-breakpoints)

---

## Overview

The AGI Workforce design system is built on modern web technologies with a focus on:

- **Premium aesthetics** inspired by Claude Desktop and Perplexity
- **Dark-first design** with cream light mode
- **Glassmorphism** and floating elements
- **Smooth spring animations** using physics-based timing
- **Accessible components** (WCAG 2.1 AA compliant)

### Technology Stack

- **Tailwind CSS v4** - CSS-first configuration
- **Radix UI** - Unstyled, accessible component primitives
- **React 19** - Ref-as-prop pattern (no forwardRef)
- **Lucide React** - Icon library
- **Class Variance Authority (CVA)** - Component variants

---

## Design Principles

### 1. Clarity Over Complexity

Every interface element should have a clear purpose. Avoid decorative elements that don't serve user needs.

### 2. Consistency Builds Trust

Maintain consistent patterns across all components and interactions. Users should feel at home anywhere in the app.

### 3. Performance is a Feature

Fast, responsive interfaces with optimized animations. Use GPU-accelerated transforms and opacity changes.

### 4. Accessibility is Non-Negotiable

Every component must be keyboard navigable, screen reader friendly, and support reduced motion preferences.

### 5. Progressive Enhancement

Start with a functional baseline, then layer in enhancements for capable browsers.

---

## Color System

### Brand Colors

#### Terra Cotta (Primary)

Warm, earthy primary color inspired by natural clay tones.

```css
--color-terra-cotta: #da7756;
--color-terra-cotta-50: #f9e8e1; /* Lightest tint */
--color-terra-cotta-100: #f5d4c8;
--color-terra-cotta-200: #ecad96;
--color-terra-cotta-300: #e38664;
--color-terra-cotta-400: #da7332;
--color-terra-cotta-500: #da7756; /* Base */
--color-terra-cotta-600: #bd5d3a; /* Buttons, hover states */
--color-terra-cotta-700: #743924;
--color-terra-cotta-800: #4d2618;
--color-terra-cotta-900: #27130c; /* Darkest shade */
```

**Usage:**

```tsx
<button className="bg-terra-cotta-600 hover:bg-terra-cotta-700">Primary Action</button>
```

#### Teal (Secondary)

Cool, professional accent for web interactions and links.

```css
--color-teal: #21808d;
--color-teal-50: #8fd9e3;
--color-teal-100: #7dd3df;
--color-teal-200: #5ac7d7;
--color-teal-300: #3ab5c5;
--color-teal-400: #2d9ba8;
--color-teal-500: #21808d; /* Base */
--color-teal-600: #196068;
--color-teal-700: #124043;
--color-teal-800: #0a201e;
--color-teal-900: #000000;
```

**Usage:**

```tsx
<a className="text-teal-500 hover:text-teal-400 underline-offset-4">Learn more</a>
```

#### Warm Peach (Accent)

Soft, inviting accent for highlights and notifications.

```css
--color-warm-peach: #f5c1a9;
--color-warm-peach-50: #ffffff;
--color-warm-peach-100: #fef9f6;
--color-warm-peach-200: #fce8dd;
--color-warm-peach-300: #fad7c4;
--color-warm-peach-400: #f7c9b6;
--color-warm-peach-500: #f5c1a9; /* Base */
--color-warm-peach-600: #f0a481;
--color-warm-peach-700: #eb8759;
--color-warm-peach-800: #e66a31;
--color-warm-peach-900: #c64f14;
```

### Neutral Colors

#### Light Mode (Cream)

```css
--color-cream-50: #fcfcf9; /* Backgrounds */
--color-cream-100: #f9f9f6; /* Cards, elevated surfaces */
--color-cream-200: #f5f5f2; /* Borders, dividers */
```

#### Dark Mode (Charcoal)

```css
--color-charcoal-900: #1f2121; /* Primary background */
--color-charcoal-800: #2a2c2c; /* Cards, elevated surfaces */
--color-charcoal-700: #363838; /* Hover states, borders */
```

### Semantic Colors

#### Agent Status Colors

Visual feedback for AI agent states.

```css
--color-agent-thinking: #a855f7; /* Purple - Processing */
--color-agent-active: #3b82f6; /* Blue - Executing */
--color-agent-success: #10b981; /* Emerald - Complete */
--color-agent-error: #ef4444; /* Red - Failed */
--color-agent-warning: #f59e0b; /* Amber - Attention needed */
```

**Usage:**

```tsx
<div className="border-l-4 border-agent-thinking bg-agent-thinking/10">
  <p className="text-agent-thinking">Agent is thinking...</p>
</div>
```

#### Surface Colors

Glassmorphism and floating elements.

```css
--color-surface-floating: rgba(255, 255, 255, 0.08);
--color-surface-floating-hover: rgba(255, 255, 255, 0.12);
--color-surface-base: #0f0f0f;
--color-surface-elevated: #1a1a1a;
--color-surface-overlay: #242424;
--color-surface-hover: #2e2e2e;
```

### System Colors (HSL)

Based on Radix UI's design tokens.

```css
/* Light Mode */
:root {
  --background: 39 33% 98%;
  --foreground: 222.2 84% 4.9%;
  --card: 0 0% 100%;
  --card-foreground: 222.2 84% 4.9%;
  --popover: 0 0% 100%;
  --popover-foreground: 222.2 84% 4.9%;
  --primary: 221.2 83.2% 53.3%;
  --primary-foreground: 210 40% 98%;
  --secondary: 210 40% 96.1%;
  --secondary-foreground: 222.2 47.4% 11.2%;
  --muted: 210 40% 96.1%;
  --muted-foreground: 215.4 16.3% 46.9%;
  --accent: 210 40% 96.1%;
  --accent-foreground: 222.2 47.4% 11.2%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 210 40% 98%;
  --border: 214.3 31.8% 91.4%;
  --input: 214.3 31.8% 91.4%;
  --ring: 221.2 83.2% 53.3%;
}

/* Dark Mode */
.dark {
  --background: 120 2% 13%;
  --foreground: 210 40% 98%;
  --card: 222.2 84% 4.9%;
  --card-foreground: 210 40% 98%;
  --popover: 222.2 84% 4.9%;
  --popover-foreground: 210 40% 98%;
  --primary: 217.2 91.2% 59.8%;
  --primary-foreground: 222.2 47.4% 11.2%;
  --secondary: 217.2 32.6% 17.5%;
  --secondary-foreground: 210 40% 98%;
  --muted: 217.2 32.6% 17.5%;
  --muted-foreground: 215 20.2% 65.1%;
  --accent: 217.2 32.6% 17.5%;
  --accent-foreground: 210 40% 98%;
  --destructive: 0 62.8% 30.6%;
  --destructive-foreground: 210 40% 98%;
  --border: 217.2 32.6% 17.5%;
  --input: 217.2 32.6% 17.5%;
  --ring: 224.3 76.3% 48%;
}
```

**Usage:**

```tsx
<div className="bg-background text-foreground border border-border">
  Content adapts to light/dark mode automatically
</div>
```

### Color Usage Guidelines

#### Do's

- Use terra cotta for primary actions (CTAs, submit buttons)
- Use teal for secondary actions and links
- Use warm peach for highlights and success states
- Maintain 4.5:1 contrast ratio minimum for text
- Use semantic colors consistently (success=green, error=red)

#### Don'ts

- Don't use pure black (#000000) or pure white (#FFFFFF)
- Don't mix warm and cool colors in the same component
- Don't use more than 3 colors in a single interface
- Don't override system colors for decorative purposes

---

## Typography

### Font Families

#### Sans-Serif (UI)

Premium font stack prioritizing FK Grotesk.

```css
--font-sans:
  'FK Grotesk', 'Inter', 'Söhne', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
```

**Usage:**

```tsx
<p className="font-sans text-base">Body text content</p>
```

#### Monospace (Code)

Developer-friendly monospace stack.

```css
--font-mono: 'Berkeley Mono', 'Söhne Mono', 'Monaco', 'Cascadia Code', 'Consolas', monospace;
```

**Usage:**

```tsx
<code className="font-mono text-sm">const value = 42;</code>
```

### Font Sizes

```css
/* Tailwind default scale */
text-xs:   12px    /* Metadata, labels */
text-sm:   14px    /* Base UI text */
text-base: 15px    /* Body text, chat messages */
text-lg:   18px    /* Section headings */
text-xl:   20px    /* Card titles */
text-2xl:  24px    /* Page headings */
text-3xl:  30px    /* Hero headings */
text-4xl:  36px    /* Display headings */
```

**Usage:**

```tsx
<h1 className="text-3xl font-semibold">Page Title</h1>
<p className="text-base leading-relaxed">Body paragraph</p>
<span className="text-xs text-muted-foreground">Metadata</span>
```

### Font Weights

```css
font-normal:    400  /* Body text */
font-medium:    500  /* Emphasis */
font-semibold:  600  /* Headings, buttons */
font-bold:      700  /* Strong emphasis (use sparingly) */
```

### Line Heights

```css
leading-none:     1.0   /* Tight headings */
leading-tight:    1.25  /* Compact text */
leading-normal:   1.5   /* Default */
leading-relaxed:  1.6   /* Body text */
leading-loose:    2.0   /* Spacious layouts */

/* Custom */
leading-chat:     1.6   /* Chat messages */
```

**Usage:**

```tsx
<p className="text-base leading-relaxed">
  Comfortable reading for long-form content with optimal line spacing.
</p>
```

### Letter Spacing

```css
tracking-tighter: -0.05em  /* Display headings */
tracking-tight:   -0.025em /* Headings */
tracking-normal:   0em      /* Default */
tracking-wide:     0.025em  /* Labels */
tracking-wider:    0.05em   /* Small caps */
tracking-widest:   0.1em    /* Uppercase labels */
```

### Text Styles

#### Headings

```tsx
<h1 className="text-3xl font-semibold tracking-tight">
  Primary Heading
</h1>
<h2 className="text-2xl font-semibold">Section Heading</h2>
<h3 className="text-xl font-medium">Subsection Heading</h3>
```

#### Body Text

```tsx
<p className="text-base leading-relaxed text-foreground">
  Standard paragraph text with comfortable line height.
</p>
<p className="text-sm text-muted-foreground">
  Secondary information or captions.
</p>
```

#### Labels & Metadata

```tsx
<label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
  Form Label
</label>
<span className="text-xs text-muted-foreground letter-spacing-wide">
  12 minutes ago
</span>
```

#### Code & Technical

```tsx
<code className="font-mono text-[13px] bg-muted px-1.5 py-0.5 rounded-md">
  inline code
</code>
<pre className="font-mono text-sm leading-relaxed">
  <code>const block = 'code';</code>
</pre>
```

### Typography Best Practices

#### Do's

- Use 15px (text-base) for chat messages and reading content
- Set line-height to 1.6 for body text
- Use font-semibold (600) for buttons and headings
- Enable font-feature-settings: 'rlig' 1, 'calt' 1 for ligatures

#### Don'ts

- Don't use more than 3 font weights on a page
- Don't set line-height below 1.4 for body text
- Don't use ALL CAPS without tracking-wide
- Don't mix monospace fonts with sans-serif in UI elements

---

## Spacing & Layout

### Spacing Scale

Tailwind's default 4px-based scale.

```css
0:    0px
0.5:  2px
1:    4px
1.5:  6px
2:    8px
2.5:  10px
3:    12px
4:    16px    /* Standard component padding */
5:    20px
6:    24px    /* Card padding */
8:    32px
10:   40px
12:   48px    /* Section spacing */
16:   64px
20:   80px
24:   96px
32:   128px
```

**Usage:**

```tsx
<div className="p-4">Standard padding</div>
<div className="gap-2">8px gap</div>
<div className="mt-6 mb-12">Vertical rhythm</div>
```

### Component Spacing

#### Cards

```tsx
<div className="p-6 rounded-xl border border-border">
  <h3 className="mb-4">Card Title</h3>
  <p>Card content with 24px padding</p>
</div>
```

#### Forms

```tsx
<form className="space-y-4">
  <div className="space-y-2">
    <label>Field Label</label>
    <input className="px-3 py-2" />
  </div>
</form>
```

#### Lists

```tsx
<ul className="space-y-2">
  <li className="p-3">List item with 8px vertical gap</li>
</ul>
```

### Border Radius

```css
--radius-sm: 6px /* Small elements (chips, badges) */ --radius-md: 8px /* Default inputs, buttons */
  --radius-lg: 12px /* Standard (Claude Desktop style) */ --radius-xl: 16px /* Large cards */
  --radius-2xl: 24px /* Feature cards */ --radius-3xl: 32px /* Hero sections */;
```

**Usage:**

```tsx
<button className="rounded-lg">Button with 12px radius</button>
<div className="rounded-2xl">Card with 24px radius</div>
<div className="rounded-full">Circular (pill shape)</div>
```

### Container & Max Width

```css
container:    100%
max-w-sm:     384px   /* 24rem */
max-w-md:     448px   /* 28rem */
max-w-lg:     512px   /* 32rem */
max-w-xl:     576px   /* 36rem */
max-w-2xl:    672px   /* 42rem */
max-w-3xl:    768px   /* 48rem - Chat message width */
max-w-4xl:    896px   /* 56rem */
max-w-5xl:    1024px  /* 64rem */
```

**Usage:**

```tsx
<div className="max-w-3xl mx-auto">Chat messages centered with 768px max width</div>
```

### Layout Patterns

#### Centered Content

```tsx
<div className="flex items-center justify-center min-h-screen">
  <div className="max-w-md w-full">Centered modal</div>
</div>
```

#### Two-Column Layout

```tsx
<div className="grid grid-cols-2 gap-6">
  <aside>Sidebar</aside>
  <main>Main content</main>
</div>
```

#### Floating Input (Claude Style)

```tsx
<div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-3xl px-4">
  <div
    className="bg-white/90 dark:bg-charcoal-800/90 backdrop-blur-xl
                  rounded-2xl shadow-floating-input border border-gray-200
                  dark:border-gray-700"
  >
    <textarea />
  </div>
</div>
```

---

## Radix UI Components

Radix UI provides unstyled, accessible primitives. We style them with Tailwind classes.

### Dialog (Modal)

**Composition:**

- `Dialog` - Root component
- `DialogTrigger` - Opens the dialog
- `DialogPortal` - Portal for overlay and content
- `DialogOverlay` - Backdrop
- `DialogContent` - Modal content
- `DialogTitle` - Accessible title
- `DialogDescription` - Accessible description
- `DialogClose` - Close button

**Implementation:**

```tsx
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/Dialog';

function MyDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button>Open Dialog</button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dialog Title</DialogTitle>
          <DialogDescription>This is an accessible dialog description.</DialogDescription>
        </DialogHeader>
        <div>Dialog content goes here</div>
      </DialogContent>
    </Dialog>
  );
}
```

**Styling:**

- Overlay: `bg-black/80` with fade-in animation
- Content: `rounded-lg border shadow-lg` with zoom-in animation
- Max width: `max-w-lg` (512px)
- Padding: `p-6` (24px)

**Accessibility:**

- Traps focus within dialog
- Closes on Escape key
- Returns focus to trigger on close
- ARIA attributes automatically applied

### Dropdown Menu

**Composition:**

- `DropdownMenu` - Root
- `DropdownMenuTrigger` - Opens menu
- `DropdownMenuContent` - Menu container
- `DropdownMenuItem` - Individual item
- `DropdownMenuSeparator` - Visual divider
- `DropdownMenuCheckboxItem` - Checkbox item
- `DropdownMenuRadioGroup` - Radio group

**Implementation:**

```tsx
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';

function MyDropdown() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button>Open Menu</button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem>Profile</DropdownMenuItem>
        <DropdownMenuItem>Settings</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive">Logout</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

**Styling:**

- Content: `rounded-md border shadow-md`
- Items: `px-2 py-1.5` with hover state
- Min width: `min-w-[8rem]`
- Animation: Slide and fade in from position

**Accessibility:**

- Keyboard navigation (Arrow keys, Home, End)
- Type-ahead support
- Closes on Escape or outside click

### Tooltip

**Implementation:**

```tsx
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/Tooltip';

function MyTooltip() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button>Hover me</button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Helpful tooltip text</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
```

**Styling:**

- Background: `bg-popover` with border
- Padding: `px-3 py-1.5`
- Arrow: Automatic positioning
- Animation: Fade and slide in

**Accessibility:**

- Shows on hover and focus
- Dismissible with Escape key
- Screen reader accessible

### Accordion

**Implementation:**

```tsx
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/Accordion';

function MyAccordion() {
  return (
    <Accordion type="single" collapsible>
      <AccordionItem value="item-1">
        <AccordionTrigger>Section 1</AccordionTrigger>
        <AccordionContent>Section 1 content with smooth animation</AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2">
        <AccordionTrigger>Section 2</AccordionTrigger>
        <AccordionContent>Section 2 content</AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
```

**Animations:**

```css
@keyframes accordion-down {
  from {
    height: 0;
  }
  to {
    height: var(--radix-accordion-content-height);
  }
}

@keyframes accordion-up {
  from {
    height: var(--radix-accordion-content-height);
  }
  to {
    height: 0;
  }
}
```

### Popover

**Implementation:**

```tsx
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover';

function MyPopover() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button>Open Popover</button>
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom">
        <div className="space-y-2">
          <h4 className="font-medium">Popover Title</h4>
          <p className="text-sm">Content goes here</p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

**Positioning:**

- `side`: top, right, bottom (default), left
- `align`: start, center (default), end
- `sideOffset`: Distance from trigger (default: 4px)

### Select

**Implementation:**

```tsx
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';

function MySelect() {
  return (
    <Select>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="Select option" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="option1">Option 1</SelectItem>
        <SelectItem value="option2">Option 2</SelectItem>
        <SelectItem value="option3">Option 3</SelectItem>
      </SelectContent>
    </Select>
  );
}
```

**Features:**

- Native-like feel with smooth animations
- Keyboard navigation
- Search/filter support
- Custom styling per item

---

## Tailwind CSS v4 Customization

### CSS-First Configuration

Tailwind CSS v4 uses CSS-based configuration instead of JavaScript.

**File: `apps/desktop/src/styles/globals.css`**

```css
@import 'tailwindcss';

/* Content detection */
@source "../**/*.{js,ts,jsx,tsx}";
@source "../../index.html";

/* Theme configuration */
@theme {
  /* Colors */
  --color-terra-cotta: #da7756;
  --color-teal: #21808d;

  /* Typography */
  --font-sans: 'FK Grotesk', 'Inter', 'Söhne', -apple-system;
  --font-mono: 'Berkeley Mono', 'Söhne Mono', 'Monaco';

  /* Border radius */
  --radius-lg: 12px;
  --radius-xl: 16px;

  /* Shadows */
  --shadow-floating-input: 0 8px 32px -4px rgba(0, 0, 0, 0.08);

  /* Animations */
  --animate-fade-in: fade-in 0.2s ease-out;
}

/* Plugins */
@plugin "tailwindcss-animate";
```

### Custom Utilities

```css
@layer components {
  .floating-input {
    @apply fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-3xl px-4;
    z-index: 40;
  }

  .glass-card {
    @apply bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl
           border border-white/20 dark:border-gray-700/50;
    box-shadow:
      0 8px 32px rgba(0, 0, 0, 0.08),
      inset 0 1px 0 rgba(255, 255, 255, 0.1);
  }

  .message-bubble {
    animation: messageIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }
}

@keyframes messageIn {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

### Migrating from v3 to v4

**Before (v3):**

```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        brand: '#da7756',
      },
    },
  },
};
```

**After (v4):**

```css
/* globals.css */
@theme {
  --color-brand: #da7756;
}
```

### Using Custom Classes

```tsx
<div className="glass-card p-6">
  <p>Glassmorphism card with backdrop blur</p>
</div>

<div className="floating-input">
  <textarea className="w-full" />
</div>

<div className="message-bubble">
  <p>Message with slide-up animation</p>
</div>
```

---

## Icon System

### Lucide React

Primary icon library for AGI Workforce.

**Installation:**

```bash
pnpm add lucide-react
```

**Usage:**

```tsx
import { Home, Settings, User, ChevronRight } from 'lucide-react';

function IconExample() {
  return (
    <div className="flex items-center gap-2">
      <Home className="h-5 w-5" />
      <Settings className="h-5 w-5 text-muted-foreground" />
      <User className="h-6 w-6 text-primary" />
      <ChevronRight className="h-4 w-4" />
    </div>
  );
}
```

### Icon Sizing

```tsx
/* Extra small - 12px */
<Icon className="h-3 w-3" />

/* Small - 16px */
<Icon className="h-4 w-4" />

/* Default - 20px */
<Icon className="h-5 w-5" />

/* Medium - 24px */
<Icon className="h-6 w-6" />

/* Large - 32px */
<Icon className="h-8 w-8" />
```

### Icon Colors

```tsx
/* Inherit from parent */
<Icon className="h-5 w-5" />

/* Muted (secondary) */
<Icon className="h-5 w-5 text-muted-foreground" />

/* Primary */
<Icon className="h-5 w-5 text-primary" />

/* Destructive */
<Icon className="h-5 w-5 text-destructive" />

/* Custom */
<Icon className="h-5 w-5 text-teal-500" />
```

### Icon with Text

```tsx
<button className="flex items-center gap-2">
  <Home className="h-4 w-4" />
  <span>Home</span>
</button>

<a className="inline-flex items-center gap-1 text-sm">
  <span>Learn more</span>
  <ChevronRight className="h-4 w-4" />
</a>
```

### Animated Icons

```tsx
import { Loader2 } from 'lucide-react';

<Loader2 className="h-4 w-4 animate-spin" />;
```

### Common Icons

| Icon         | Component          | Usage              |
| ------------ | ------------------ | ------------------ |
| Home         | `<Home />`         | Navigation         |
| Settings     | `<Settings />`     | Preferences        |
| User         | `<User />`         | Profile            |
| Search       | `<Search />`       | Search input       |
| X            | `<X />`            | Close buttons      |
| Check        | `<Check />`        | Success state      |
| AlertCircle  | `<AlertCircle />`  | Error/warning      |
| Info         | `<Info />`         | Information        |
| ChevronRight | `<ChevronRight />` | Breadcrumbs, next  |
| ChevronDown  | `<ChevronDown />`  | Dropdown indicator |
| Plus         | `<Plus />`         | Add actions        |
| Trash2       | `<Trash2 />`       | Delete             |
| Edit         | `<Edit />`         | Edit actions       |
| Download     | `<Download />`     | Download           |
| Upload       | `<Upload />`       | Upload             |
| Copy         | `<Copy />`         | Copy to clipboard  |
| ExternalLink | `<ExternalLink />` | External links     |
| Loader2      | `<Loader2 />`      | Loading spinner    |

---

## Component Library Catalog

### Button

**Variants:** default, destructive, outline, secondary, ghost, link

**Sizes:** xs, sm, default, lg, icon

```tsx
import { Button } from '@/components/ui/Button';

<Button variant="default" size="default">
  Primary Button
</Button>

<Button variant="destructive" size="sm">
  Delete
</Button>

<Button variant="outline" size="lg">
  Outline Button
</Button>

<Button variant="ghost" size="icon">
  <Settings className="h-4 w-4" />
</Button>
```

**With Icon:**

```tsx
<Button>
  <Plus className="h-4 w-4" />
  Add Item
</Button>
```

**As Child (Polymorphic):**

```tsx
<Button asChild>
  <a href="/home">Go Home</a>
</Button>
```

### Badge

**Variants:** default, secondary, destructive, outline

```tsx
import { Badge } from '@/components/ui/Badge';

<Badge variant="default">Active</Badge>
<Badge variant="secondary">Pending</Badge>
<Badge variant="destructive">Error</Badge>
<Badge variant="outline">Draft</Badge>
```

### Input

```tsx
import { Input } from '@/components/ui/Input';

<Input type="text" placeholder="Enter text" />
<Input type="email" placeholder="Email address" />
<Input type="password" placeholder="Password" />
<Input disabled placeholder="Disabled input" />
```

**With Label:**

```tsx
<div className="space-y-2">
  <Label htmlFor="email">Email</Label>
  <Input id="email" type="email" />
</div>
```

### Textarea

```tsx
import { Textarea } from '@/components/ui/Textarea';

<Textarea placeholder="Type your message..." />
<Textarea rows={5} placeholder="Multi-line input" />
```

### Select

```tsx
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';

<Select>
  <SelectTrigger className="w-[180px]">
    <SelectValue placeholder="Select option" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="light">Light</SelectItem>
    <SelectItem value="dark">Dark</SelectItem>
    <SelectItem value="system">System</SelectItem>
  </SelectContent>
</Select>;
```

### Checkbox

```tsx
import { Checkbox } from '@/components/ui/Checkbox';
import { Label } from '@/components/ui/Label';

<div className="flex items-center space-x-2">
  <Checkbox id="terms" />
  <Label htmlFor="terms">Accept terms and conditions</Label>
</div>;
```

### Switch

```tsx
import { Switch } from '@/components/ui/Switch';
import { Label } from '@/components/ui/Label';

<div className="flex items-center space-x-2">
  <Switch id="airplane-mode" />
  <Label htmlFor="airplane-mode">Airplane Mode</Label>
</div>;
```

### Card

```tsx
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/Card';

<Card>
  <CardHeader>
    <CardTitle>Card Title</CardTitle>
    <CardDescription>Card description goes here</CardDescription>
  </CardHeader>
  <CardContent>
    <p>Card content area</p>
  </CardContent>
  <CardFooter>
    <Button>Action</Button>
  </CardFooter>
</Card>;
```

### Alert

```tsx
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert';
import { AlertCircle } from 'lucide-react';

<Alert variant="destructive">
  <AlertCircle className="h-4 w-4" />
  <AlertTitle>Error</AlertTitle>
  <AlertDescription>Your session has expired. Please log in again.</AlertDescription>
</Alert>;
```

### Progress

```tsx
import { Progress } from '@/components/ui/Progress';

<Progress value={60} className="w-full" />;
```

### Slider

```tsx
import { Slider } from '@/components/ui/Slider';

<Slider defaultValue={[50]} max={100} step={1} className="w-[60%]" />;
```

### Tabs

```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';

<Tabs defaultValue="account">
  <TabsList>
    <TabsTrigger value="account">Account</TabsTrigger>
    <TabsTrigger value="password">Password</TabsTrigger>
  </TabsList>
  <TabsContent value="account">Account settings content</TabsContent>
  <TabsContent value="password">Password settings content</TabsContent>
</Tabs>;
```

### Toast (Notifications)

```tsx
import { useToast } from '@/hooks/useToast';

function MyComponent() {
  const { toast } = useToast();

  return (
    <button
      onClick={() => {
        toast({
          title: 'Success',
          description: 'Your changes have been saved.',
        });
      }}
    >
      Show Toast
    </button>
  );
}
```

**Variants:**

```tsx
toast({ title: 'Default notification' });

toast({
  title: 'Success',
  description: 'Action completed successfully.',
  variant: 'default',
});

toast({
  title: 'Error',
  description: 'Something went wrong.',
  variant: 'destructive',
});
```

### Spinner

```tsx
import { Spinner } from '@/components/ui/Spinner';

<Spinner size="sm" />
<Spinner size="default" />
<Spinner size="lg" />
<Spinner size="xl" />
```

**With Text:**

```tsx
<div className="flex items-center gap-2">
  <Spinner size="sm" />
  <span>Loading...</span>
</div>
```

### Skeleton

```tsx
import { Skeleton } from '@/components/ui/Skeleton';

<div className="space-y-2">
  <Skeleton className="h-4 w-[250px]" />
  <Skeleton className="h-4 w-[200px]" />
  <Skeleton className="h-32 w-full" />
</div>;
```

---

## Accessibility Standards

### WCAG 2.1 AA Compliance

All components meet WCAG 2.1 Level AA standards.

#### Color Contrast

**Minimum Requirements:**

- Normal text: 4.5:1 contrast ratio
- Large text (18px+): 3:1 contrast ratio
- UI components: 3:1 contrast ratio

**Testing:**

```tsx
/* Good - 7:1 contrast */
<p className="text-gray-900 dark:text-gray-100">High contrast text</p>

/* Bad - 2:1 contrast */
<p className="text-gray-400">Low contrast text</p>
```

**Tools:**

- Chrome DevTools Contrast Checker
- axe DevTools browser extension
- Contrast Checker (online)

#### Keyboard Navigation

All interactive elements must be keyboard accessible.

**Requirements:**

- Tab key navigation
- Enter/Space for activation
- Escape to dismiss modals/menus
- Arrow keys for lists/menus

**Example:**

```tsx
<button
  onClick={handleClick}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  }}
>
  Accessible Button
</button>
```

**Focus Indicators:**

```tsx
<button
  className="focus-visible:outline-hidden focus-visible:ring-2
                   focus-visible:ring-ring focus-visible:ring-offset-2"
>
  Button with visible focus ring
</button>
```

#### Screen Reader Support

**Semantic HTML:**

```tsx
/* Good */
<button>Click me</button>
<nav><ul><li><a href="#">Link</a></li></ul></nav>

/* Bad */
<div onClick={handleClick}>Click me</div>
```

**ARIA Labels:**

```tsx
<button aria-label="Close dialog">
  <X className="h-4 w-4" />
</button>

<input aria-label="Search" placeholder="Search..." />
```

**ARIA Attributes:**

```tsx
<button
  aria-expanded={isOpen}
  aria-controls="menu-content"
  aria-haspopup="true"
>
  Menu
</button>

<div
  id="menu-content"
  role="menu"
  aria-labelledby="menu-button"
>
  Menu items
</div>
```

**Live Regions:**

```tsx
<div role="status" aria-live="polite">
  Loading content...
</div>

<div role="alert" aria-live="assertive">
  Error: Failed to save changes.
</div>
```

#### Motion & Animation

**Respect prefers-reduced-motion:**

```css
@media (prefers-reduced-motion: reduce) {
  .message-bubble {
    animation: none;
  }

  .scroll-smooth {
    scroll-behavior: auto;
  }
}
```

```tsx
<div
  className="transition-transform duration-300
                motion-reduce:transition-none"
>
  Content respects motion preferences
</div>
```

#### Form Accessibility

**Labels:**

```tsx
<div className="space-y-2">
  <Label htmlFor="email">Email address</Label>
  <Input id="email" type="email" aria-required="true" />
</div>
```

**Error Messages:**

```tsx
<div className="space-y-2">
  <Label htmlFor="password">Password</Label>
  <Input id="password" type="password" aria-invalid={hasError} aria-describedby="password-error" />
  {hasError && (
    <p id="password-error" className="text-sm text-destructive">
      Password must be at least 8 characters
    </p>
  )}
</div>
```

**Fieldsets:**

```tsx
<fieldset>
  <legend className="font-medium">Notification preferences</legend>
  <div className="space-y-2">
    <div className="flex items-center space-x-2">
      <Checkbox id="email" />
      <Label htmlFor="email">Email notifications</Label>
    </div>
    <div className="flex items-center space-x-2">
      <Checkbox id="push" />
      <Label htmlFor="push">Push notifications</Label>
    </div>
  </div>
</fieldset>
```

### Accessibility Checklist

- [ ] All interactive elements are keyboard accessible
- [ ] Focus indicators are visible (2px ring)
- [ ] Color contrast meets 4.5:1 minimum
- [ ] Form inputs have associated labels
- [ ] Buttons have descriptive text or aria-label
- [ ] Images have alt text
- [ ] Headings are hierarchical (h1 → h2 → h3)
- [ ] ARIA attributes are used correctly
- [ ] Motion respects prefers-reduced-motion
- [ ] Content is readable at 200% zoom
- [ ] Skip links are provided for navigation
- [ ] Error messages are associated with inputs
- [ ] Dialogs trap focus and return to trigger

---

## Animation & Interaction Guidelines

### Animation Principles

1. **Purposeful** - Every animation serves a functional purpose
2. **Performant** - Use transform and opacity for GPU acceleration
3. **Consistent** - Same timing and easing across similar interactions
4. **Respectful** - Honor prefers-reduced-motion

### Timing Functions

```css
/* Spring animations (Claude Desktop style) */
--ease-spring-bouncy: cubic-bezier(0.16, 1, 0.3, 1);
--ease-spring-smooth: cubic-bezier(0.25, 0.46, 0.45, 0.94);

/* Standard easing */
ease-in:      cubic-bezier(0.4, 0, 1, 1)
ease-out:     cubic-bezier(0, 0, 0.2, 1)
ease-in-out:  cubic-bezier(0.4, 0, 0.2, 1)
```

**Usage:**

```css
.spring-morph {
  transition:
    transform 0.5s cubic-bezier(0.16, 1, 0.3, 1),
    opacity 0.3s ease;
}
```

### Duration Standards

```css
/* Micro-interactions */
duration-75:   75ms    /* Checkbox check, radio select */
duration-100:  100ms   /* Button press */
duration-150:  150ms   /* Hover states */

/* Transitions */
duration-200:  200ms   /* Standard transitions */
duration-300:  300ms   /* Default (sliding, fading) */
duration-500:  500ms   /* Complex animations */

/* Long animations */
duration-700:  700ms   /* Layout changes */
duration-1000: 1000ms  /* Page transitions */
```

### Built-in Animations

#### Fade

```tsx
<div className="animate-fade-in">Fades in smoothly</div>
<div className="animate-fade-out">Fades out smoothly</div>
```

```css
@keyframes fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
```

#### Slide

```tsx
<div className="animate-slide-up">Slides up from below</div>
<div className="animate-slide-down">Slides down from above</div>
```

```css
@keyframes slide-up {
  from {
    transform: translateY(10px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
```

#### Pulse

```tsx
<div className="animate-pulse">Gentle pulsing effect</div>
<div className="animate-pulse-soft">Softer pulse</div>
```

```css
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
```

#### Shimmer (Loading)

```tsx
<div
  className="animate-shimmer bg-gradient-to-r from-transparent
                via-white/10 to-transparent bg-[length:1000px_100%]"
>
  Loading effect
</div>
```

```css
@keyframes shimmer {
  0% {
    background-position: -1000px 0;
  }
  100% {
    background-position: 1000px 0;
  }
}
```

#### Accordion

```tsx
<AccordionContent>Smooth expand/collapse with data-driven height</AccordionContent>
```

```css
@keyframes accordion-down {
  from {
    height: 0;
  }
  to {
    height: var(--radix-accordion-content-height);
  }
}

@keyframes accordion-up {
  from {
    height: var(--radix-accordion-content-height);
  }
  to {
    height: 0;
  }
}
```

### Interaction Patterns

#### Button Press

```tsx
<button
  className="transition-all duration-100
                   active:scale-95 hover:scale-105"
>
  Press me
</button>
```

#### Card Hover

```tsx
<div
  className="transition-all duration-200
                hover:-translate-y-1 hover:shadow-lg"
>
  Hover to lift
</div>
```

#### Glassmorphism Hover

```tsx
<div className="glass-hover">
  <style>{`
    .glass-hover {
      transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1),
                  box-shadow 0.2s ease;
    }
    .glass-hover:hover {
      transform: translateY(-2px);
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.12);
    }
  `}</style>
  Glassmorphic card
</div>
```

#### Focus Ring

```tsx
<button
  className="ring-offset-2 ring-offset-background
                   focus-visible:ring-2 focus-visible:ring-ring
                   transition-shadow duration-150"
>
  Focus me
</button>
```

#### Loading States

```tsx
import { Loader2 } from 'lucide-react';

<button disabled className="opacity-50 cursor-not-allowed">
  <Loader2 className="h-4 w-4 animate-spin" />
  Loading...
</button>;
```

#### Skeleton Loading

```tsx
<div className="animate-pulse">
  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2" />
  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
</div>
```

### Toast Animations

```tsx
/* Enter from bottom */
.toast-enter {
  animation: toast-slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

/* Exit to bottom */
.toast-exit {
  animation: toast-slide-down 0.2s ease-out;
}

@keyframes toast-slide-up {
  from {
    transform: translateY(100%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
```

### Performance Tips

1. **Use GPU-accelerated properties:**
   - `transform` (not `top`/`left`/`margin`)
   - `opacity` (not `color` or `background-color`)

2. **Avoid animating:**
   - `width`/`height` (use `scale` instead)
   - `box-shadow` (pre-render states)
   - Layout properties

3. **Use `will-change` sparingly:**

```tsx
<div className="will-change-transform">Only for complex animations</div>
```

4. **Reduce motion:**

```tsx
<div
  className="transition-transform duration-300
                motion-reduce:transition-none"
>
  Respects user preferences
</div>
```

---

## Responsive Design Breakpoints

### Breakpoint Scale

```css
/* Tailwind default breakpoints */
sm:   640px   /* Mobile landscape, small tablets */
md:   768px   /* Tablets */
lg:   1024px  /* Desktop */
xl:   1280px  /* Large desktop */
2xl:  1536px  /* Extra large desktop */
```

### Mobile-First Approach

Default styles apply to mobile, then override with breakpoints.

```tsx
/* Mobile: full width, Desktop: 50% width */
<div className="w-full lg:w-1/2">
  Responsive container
</div>

/* Mobile: stack, Desktop: grid */
<div className="flex flex-col lg:grid lg:grid-cols-2 gap-4">
  <div>Column 1</div>
  <div>Column 2</div>
</div>
```

### Layout Patterns

#### Responsive Grid

```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
  {items.map((item) => (
    <Card key={item.id}>{item.content}</Card>
  ))}
</div>
```

#### Responsive Padding

```tsx
<div className="p-4 sm:p-6 lg:p-8">Scales padding with screen size</div>
```

#### Responsive Typography

```tsx
<h1 className="text-2xl sm:text-3xl lg:text-4xl">
  Responsive Heading
</h1>

<p className="text-sm sm:text-base lg:text-lg">
  Responsive body text
</p>
```

#### Responsive Sidebar

```tsx
<div className="flex flex-col lg:flex-row">
  {/* Mobile: full width, Desktop: fixed width */}
  <aside className="w-full lg:w-64 border-b lg:border-b-0 lg:border-r">Sidebar</aside>

  <main className="flex-1">Main content</main>
</div>
```

#### Hide/Show Elements

```tsx
/* Show only on mobile */
<div className="block lg:hidden">Mobile menu</div>

/* Show only on desktop */
<div className="hidden lg:block">Desktop navigation</div>

/* Show on tablet and above */
<div className="hidden md:block">Tablet+ content</div>
```

### Container Queries

**Note:** Container queries are supported in Tailwind v4 with the `@container` directive.

```tsx
<div className="@container">
  <div className="grid grid-cols-1 @md:grid-cols-2 @lg:grid-cols-3 gap-4">Container-aware grid</div>
</div>
```

### Testing Responsive Design

1. **Chrome DevTools:**
   - Toggle device toolbar (Cmd+Shift+M)
   - Test common devices (iPhone, iPad, etc.)

2. **Resize Browser:**
   - Drag to different widths
   - Check breakpoint transitions

3. **Real Devices:**
   - Test on physical phones/tablets
   - Check touch interactions

### Responsive Best Practices

#### Do's

- Start with mobile layout first
- Use relative units (rem, %, vh/vw)
- Test on actual devices
- Consider touch targets (min 44x44px)
- Use aspect-ratio for media
- Optimize images for different sizes

#### Don'ts

- Don't rely solely on device detection
- Don't use fixed pixel widths
- Don't hide critical content on mobile
- Don't forget landscape orientation
- Don't ignore tablet sizes

### Common Patterns

#### App Shell (Desktop)

```tsx
<div className="flex flex-col h-screen">
  {/* Title bar */}
  <header className="h-12 border-b">Title Bar</header>

  {/* Main content area */}
  <div className="flex flex-1 overflow-hidden">
    {/* Sidebar - collapsible */}
    <aside className="w-64 border-r overflow-y-auto">Sidebar</aside>

    {/* Main content */}
    <main className="flex-1 overflow-y-auto">Content</main>

    {/* Right panel - optional */}
    <aside className="w-80 border-l overflow-y-auto">Panel</aside>
  </div>

  {/* Status bar */}
  <footer className="h-8 border-t">Status Bar</footer>
</div>
```

#### Responsive Navigation

```tsx
<nav className="flex items-center justify-between p-4">
  <div className="flex items-center gap-2">
    <Logo />
    <span className="hidden sm:inline">AGI Workforce</span>
  </div>

  {/* Desktop nav */}
  <ul className="hidden lg:flex items-center gap-4">
    <li>
      <a href="/home">Home</a>
    </li>
    <li>
      <a href="/about">About</a>
    </li>
    <li>
      <a href="/contact">Contact</a>
    </li>
  </ul>

  {/* Mobile menu button */}
  <button className="lg:hidden">
    <Menu className="h-6 w-6" />
  </button>
</nav>
```

---

## Implementation Examples

### Complete Form

```tsx
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import { Checkbox } from '@/components/ui/Checkbox';

function ContactForm() {
  return (
    <form className="space-y-6 max-w-md mx-auto">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" placeholder="John Doe" required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" placeholder="john@example.com" required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="topic">Topic</Label>
        <Select>
          <SelectTrigger id="topic">
            <SelectValue placeholder="Select a topic" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="general">General Inquiry</SelectItem>
            <SelectItem value="support">Technical Support</SelectItem>
            <SelectItem value="sales">Sales</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="message">Message</Label>
        <Textarea id="message" placeholder="Your message..." rows={5} required />
      </div>

      <div className="flex items-center space-x-2">
        <Checkbox id="newsletter" />
        <Label htmlFor="newsletter" className="font-normal">
          Subscribe to our newsletter
        </Label>
      </div>

      <Button type="submit" className="w-full">
        Send Message
      </Button>
    </form>
  );
}
```

### Loading State Card

```tsx
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';

function LoadingCard() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-1/2 mt-2" />
      </CardHeader>
      <CardContent className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/6" />
      </CardContent>
    </Card>
  );
}
```

### Agent Status Badge

```tsx
import { Badge } from '@/components/ui/Badge';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';

function AgentStatus({ status }: { status: 'thinking' | 'success' | 'error' }) {
  const config = {
    thinking: {
      icon: Loader2,
      label: 'Thinking',
      className: 'bg-agent-thinking/10 text-agent-thinking border-agent-thinking/30',
      iconClass: 'animate-spin',
    },
    success: {
      icon: CheckCircle,
      label: 'Complete',
      className: 'bg-agent-success/10 text-agent-success border-agent-success/30',
      iconClass: '',
    },
    error: {
      icon: AlertCircle,
      label: 'Error',
      className: 'bg-agent-error/10 text-agent-error border-agent-error/30',
      iconClass: '',
    },
  }[status];

  const Icon = config.icon;

  return (
    <Badge variant="outline" className={config.className}>
      <Icon className={`h-3 w-3 ${config.iconClass}`} />
      {config.label}
    </Badge>
  );
}
```

---

## Version History

### v1.0.0 (January 15, 2026)

- Initial design system documentation
- Tailwind CSS v4 migration complete
- Radix UI component catalog
- Accessibility standards (WCAG 2.1 AA)
- Animation guidelines
- Responsive design patterns

---

## Contributing

To contribute to the design system:

1. **Propose changes** via GitHub Issues
2. **Test accessibility** with screen readers and keyboard
3. **Document examples** with code snippets
4. **Update this file** with any additions
5. **Follow conventions** established in existing components

---

## Resources

### Official Documentation

- [Tailwind CSS v4](https://tailwindcss.com/docs)
- [Radix UI](https://www.radix-ui.com/)
- [Lucide Icons](https://lucide.dev/)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)

### Design Inspiration

- [Claude Desktop](https://claude.ai/desktop)
- [Perplexity](https://www.perplexity.ai/)
- [Linear](https://linear.app/)
- [Vercel](https://vercel.com/)

### Tools

- [Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [axe DevTools](https://www.deque.com/axe/devtools/)
- [Lighthouse](https://developers.google.com/web/tools/lighthouse)

---

**Maintained by:** AGI Workforce Design Team
**Last Updated:** January 15, 2026
**Version:** 1.0.0
