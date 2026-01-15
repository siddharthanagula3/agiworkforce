# Styling Guide - Tailwind CSS v4

## Overview

AGI Workforce uses Tailwind CSS v4 with the new CSS-first configuration approach. This guide covers the styling system, theme customization, and best practices.

## Tailwind CSS v4 Setup

### CSS-First Configuration

Unlike previous versions, Tailwind v4 uses CSS files for configuration instead of JavaScript config files.

**Location**: `src/styles/globals.css`

```css
@import 'tailwindcss';

/* Source path for content detection */
@source "../**/*.{js,ts,jsx,tsx}";
@source "../../index.html";

/* Plugin imports */
@plugin "tailwindcss-animate";
```

### Theme Configuration

Theme variables are defined using the `@theme` directive:

```css
@theme {
  /* Font families */
  --font-sans:
    'FK Grotesk', 'Inter', 'Söhne', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  --font-mono: 'Berkeley Mono', 'Söhne Mono', 'Monaco', 'Cascadia Code', 'Consolas', monospace;

  /* Line height */
  --line-height-chat: 1.6;

  /* Custom colors */
  --color-cream-50: #fcfcf9;
  --color-charcoal-900: #1f2121;
  --color-terra-cotta: #da7756;
  --color-teal: #21808d;

  /* Agent status colors */
  --color-agent-thinking: #a855f7;
  --color-agent-active: #3b82f6;
  --color-agent-success: #10b981;
  --color-agent-error: #ef4444;
  --color-agent-warning: #f59e0b;

  /* Surface colors */
  --color-surface-base: #0f0f0f;
  --color-surface-elevated: #1a1a1a;
  --color-surface-overlay: #242424;
  --color-surface-hover: #2e2e2e;
}
```

### No JavaScript Config

Tailwind v4 eliminates the need for `tailwind.config.js`. All configuration is done in CSS.

### PostCSS Configuration

**Location**: `postcss.config.js`

```js
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
```

### Vite Configuration

**Location**: `vite.config.ts`

```ts
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    tailwindcss(),
    // ... other plugins
  ],
});
```

## Color System

### Semantic Colors

The app uses semantic color variables that adapt to light/dark themes:

```css
/* Defined in globals.css with HSL values */
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --card: 0 0% 100%;
  --card-foreground: 222.2 84% 4.9%;
  --popover: 0 0% 100%;
  --popover-foreground: 222.2 84% 4.9%;
  --primary: 222.2 47.4% 11.2%;
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
  --ring: 222.2 84% 4.9%;
}

.dark {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  /* ... dark mode values */
}
```

### Usage in Components

```tsx
// Use semantic colors via Tailwind classes
<div className="bg-background text-foreground">
  <div className="bg-primary text-primary-foreground">Primary</div>
  <div className="bg-secondary text-secondary-foreground">Secondary</div>
  <div className="bg-destructive text-destructive-foreground">Danger</div>
</div>

// Or access via CSS variables
<div style={{ backgroundColor: 'hsl(var(--primary))' }}>
  Custom element
</div>
```

### Custom Colors

```tsx
// Terra cotta palette
<div className="bg-terra-cotta text-white">Brand color</div>
<div className="bg-terra-cotta-100">Light shade</div>
<div className="bg-terra-cotta-900">Dark shade</div>

// Agent status colors
<div className="text-agent-thinking">Thinking...</div>
<div className="text-agent-active">Active</div>
<div className="text-agent-success">Success</div>
<div className="text-agent-error">Error</div>

// Surface colors
<div className="bg-surface-base">Base surface</div>
<div className="bg-surface-elevated">Elevated surface</div>
<div className="bg-surface-overlay">Overlay</div>
```

## Typography

### Font Families

```tsx
// Sans-serif (default)
<p className="font-sans">Regular text</p>

// Monospace
<code className="font-mono">Code snippet</code>
```

### Font Sizes

```tsx
// Text sizes
<p className="text-xs">Extra small</p>
<p className="text-sm">Small</p>
<p className="text-base">Base</p>
<p className="text-lg">Large</p>
<p className="text-xl">Extra large</p>
<p className="text-2xl">2X large</p>
<p className="text-3xl">3X large</p>

// Font weights
<p className="font-light">Light</p>
<p className="font-normal">Normal</p>
<p className="font-medium">Medium</p>
<p className="font-semibold">Semibold</p>
<p className="font-bold">Bold</p>
```

### Line Height

```tsx
// Standard line heights
<p className="leading-none">No line height</p>
<p className="leading-tight">Tight</p>
<p className="leading-normal">Normal</p>
<p className="leading-relaxed">Relaxed</p>

// Chat-specific line height
<p className="leading-[var(--line-height-chat)]">Chat message</p>
```

## Spacing

### Padding and Margin

Tailwind uses a consistent spacing scale (0.25rem increments):

```tsx
// Padding
<div className="p-4">Padding all sides (1rem)</div>
<div className="px-4 py-2">Padding horizontal & vertical</div>
<div className="pt-8">Padding top only</div>

// Margin
<div className="m-4">Margin all sides</div>
<div className="mx-auto">Center horizontally</div>
<div className="mt-8">Margin top only</div>

// Gap (for flexbox/grid)
<div className="flex gap-4">Flex with gap</div>
<div className="grid gap-2">Grid with gap</div>

// Space between children
<div className="space-y-4">Vertical spacing</div>
<div className="space-x-2">Horizontal spacing</div>
```

## Layout

### Flexbox

```tsx
// Basic flex
<div className="flex">
  <div>Item 1</div>
  <div>Item 2</div>
</div>

// Direction
<div className="flex flex-col">Column</div>
<div className="flex flex-row">Row</div>

// Justify
<div className="flex justify-start">Start</div>
<div className="flex justify-center">Center</div>
<div className="flex justify-end">End</div>
<div className="flex justify-between">Space between</div>

// Align
<div className="flex items-start">Align start</div>
<div className="flex items-center">Align center</div>
<div className="flex items-end">Align end</div>

// Flex grow/shrink
<div className="flex-1">Grow to fill</div>
<div className="flex-none">Don't grow</div>
```

### Grid

```tsx
// Grid with columns
<div className="grid grid-cols-3 gap-4">
  <div>Col 1</div>
  <div>Col 2</div>
  <div>Col 3</div>
</div>

// Responsive columns
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {items.map(item => <Card key={item.id} />)}
</div>

// Grid with auto-fit
<div className="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-4">
  {items.map(item => <Card key={item.id} />)}
</div>

// Grid areas
<div className="grid grid-rows-[auto_1fr_auto] h-screen">
  <header>Header</header>
  <main>Main content</main>
  <footer>Footer</footer>
</div>
```

### Positioning

```tsx
// Position types
<div className="relative">Relative</div>
<div className="absolute top-0 right-0">Absolute</div>
<div className="fixed bottom-4 right-4">Fixed</div>
<div className="sticky top-0">Sticky</div>

// Z-index
<div className="z-10">Z-index 10</div>
<div className="z-50">Z-index 50</div>
```

## Responsive Design

### Breakpoints

Tailwind v4 uses standard breakpoints:

- `sm`: 640px
- `md`: 768px
- `lg`: 1024px
- `xl`: 1280px
- `2xl`: 1536px

```tsx
// Mobile-first approach
<div className="text-sm md:text-base lg:text-lg">
  Responsive text
</div>

// Hide/show at breakpoints
<div className="hidden md:block">Desktop only</div>
<div className="block md:hidden">Mobile only</div>

// Responsive layout
<div className="flex flex-col md:flex-row">
  <aside className="w-full md:w-64">Sidebar</aside>
  <main className="flex-1">Content</main>
</div>
```

## Dark Mode

### Theme Toggle

```tsx
import { useThemeContext } from '@/providers/ThemeProvider';

function ThemeToggle() {
  const { theme, setTheme } = useThemeContext();

  return (
    <button
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="p-2 rounded hover:bg-accent"
    >
      {theme === 'dark' ? '🌞' : '🌙'}
    </button>
  );
}
```

### Dark Mode Classes

```tsx
// Different styles for light/dark
<div className="bg-white dark:bg-zinc-900">
  <p className="text-black dark:text-white">Adaptive text</p>
</div>

// Use semantic colors (automatically adapt)
<div className="bg-background text-foreground">
  Automatically themed
</div>
```

## Animations

### Tailwind Animate Plugin

The `tailwindcss-animate` plugin provides pre-built animations:

```tsx
// Fade in
<div className="animate-in fade-in">Fade in</div>

// Slide in
<div className="animate-in slide-in-from-bottom">Slide from bottom</div>
<div className="animate-in slide-in-from-right">Slide from right</div>

// Zoom in
<div className="animate-in zoom-in">Zoom in</div>

// Spin (loading)
<div className="animate-spin">⚙️</div>

// Pulse
<div className="animate-pulse">Pulsing</div>

// Bounce
<div className="animate-bounce">Bouncing</div>
```

### Custom Animations with Framer Motion

```tsx
import { motion } from 'framer-motion';

function AnimatedComponent() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className="bg-white dark:bg-zinc-900 p-4 rounded-lg"
    >
      Content
    </motion.div>
  );
}
```

## Utility Patterns

### Common Patterns

```tsx
// Card
<div className="rounded-lg border bg-card text-card-foreground shadow-sm">
  Card content
</div>

// Button
<button className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
  Button
</button>

// Input
<input className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring" />

// Badge
<span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold">
  Badge
</span>
```

### Truncate Text

```tsx
// Single line truncate
<p className="truncate">Very long text that will be truncated...</p>

// Multi-line truncate (2 lines)
<p className="line-clamp-2">
  Long text that will be clamped to 2 lines with ellipsis...
</p>

// Multi-line truncate (3 lines)
<p className="line-clamp-3">
  Even longer text that will be clamped to 3 lines...
</p>
```

### Scrolling

```tsx
// Vertical scroll
<div className="h-64 overflow-y-auto">
  Long content...
</div>

// Horizontal scroll
<div className="w-full overflow-x-auto">
  Wide content...
</div>

// Hide scrollbar
<div className="overflow-auto scrollbar-hide">
  Content
</div>

// Custom scrollbar (using ScrollArea component)
<ScrollArea className="h-[400px]">
  Content
</ScrollArea>
```

## Utility Function

### cn() Helper

The `cn()` function merges Tailwind classes intelligently:

**Location**: `src/lib/utils.ts`

```tsx
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

**Usage**:

```tsx
import { cn } from '@/lib/utils';

function Button({ className, variant }: ButtonProps) {
  return (
    <button
      className={cn(
        'px-4 py-2 rounded',
        variant === 'primary' && 'bg-primary text-white',
        variant === 'secondary' && 'bg-secondary text-black',
        className, // User can override
      )}
    >
      Click me
    </button>
  );
}

// Usage
<Button className="mt-4" variant="primary" />;
```

## Best Practices

### 1. Use Semantic Colors

```tsx
// Good: Uses semantic colors
<div className="bg-background text-foreground">Content</div>

// Avoid: Hardcoded colors
<div className="bg-white text-black">Content</div>
```

### 2. Compose Utilities

```tsx
// Good: Composed utilities
<button className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90">
  <Icon />
  Button
</button>

// Avoid: Creating custom CSS
<button style={{ display: 'flex', padding: '0.5rem 1rem' }}>
  Button
</button>
```

### 3. Use Responsive Utilities

```tsx
// Good: Mobile-first responsive design
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
  {items.map(item => <Card key={item.id} />)}
</div>

// Avoid: Fixed layouts
<div className="grid grid-cols-3">
  {items.map(item => <Card key={item.id} />)}
</div>
```

### 4. Extract Components

```tsx
// Good: Reusable component with variants
const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground',
        secondary: 'bg-secondary text-secondary-foreground',
      },
    },
  }
);

// Avoid: Duplicating classes
<button className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground">
  Button 1
</button>
<button className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground">
  Button 2
</button>
```

### 5. Use CSS Variables for Dynamic Values

```tsx
// Good: CSS variable for dynamic value
<div
  style={{ '--width': `${progress}%` } as React.CSSProperties}
  className="h-2 bg-primary"
  style={{ width: 'var(--width)' }}
/>

// Or use inline styles for truly dynamic values
<div style={{ width: `${progress}%` }} className="h-2 bg-primary" />
```

## Performance Tips

1. **Purge Unused Styles**: Tailwind automatically purges unused styles in production
2. **Use JIT Mode**: Tailwind v4 uses JIT by default for faster builds
3. **Avoid Arbitrary Values**: Use predefined utilities when possible
4. **Bundle Size**: Keep utility classes small and focused

## Resources

- [Tailwind CSS v4 Documentation](https://tailwindcss.com)
- [Tailwind Play (Playground)](https://play.tailwindcss.com)
- [Headless UI Components](https://headlessui.com)
- [Radix UI Primitives](https://www.radix-ui.com)
