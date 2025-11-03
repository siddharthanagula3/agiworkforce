# UI Component Library

This directory contains the base UI components for the AGI Workforce desktop application, built with:

- **Tailwind CSS** for styling
- **Radix UI** for accessible primitives
- **class-variance-authority** for component variants
- **lucide-react** for icons

## Design System

### Colors

The design system uses CSS variables for theming with light/dark mode support:

- `background` - Main background color
- `foreground` - Main text color
- `primary` - Primary brand color
- `secondary` - Secondary color
- `muted` - Muted backgrounds and text
- `accent` - Accent color for highlights
- `destructive` - Error/danger states
- `border` - Border colors
- `input` - Input field borders
- `ring` - Focus ring colors
- `card` - Card backgrounds
- `popover` - Popover backgrounds

### Components

#### Button

Versatile button component with multiple variants and sizes.

```tsx
import { Button } from '@/components/ui/Button';

<Button variant="default">Click me</Button>
<Button variant="outline" size="sm">Small</Button>
<Button variant="ghost" size="icon"><Icon /></Button>
```

Variants: `default`, `destructive`, `outline`, `secondary`, `ghost`, `link`
Sizes: `default`, `sm`, `lg`, `icon`

#### Input

Text input with consistent styling.

```tsx
import { Input } from '@/components/ui/Input';

<Input type="text" placeholder="Enter text..." />
```

#### Label

Accessible labels for form fields.

```tsx
import { Label } from '@/components/ui/Label';

<Label htmlFor="email">Email</Label>
<Input id="email" type="email" />
```

#### Select

Dropdown select component.

```tsx
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';

<Select>
  <SelectTrigger>
    <SelectValue placeholder="Select option" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="option1">Option 1</SelectItem>
    <SelectItem value="option2">Option 2</SelectItem>
  </SelectContent>
</Select>
```

#### Card

Container component for grouping content.

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
    <CardDescription>Card description</CardDescription>
  </CardHeader>
  <CardContent>Content here</CardContent>
  <CardFooter>Footer content</CardFooter>
</Card>
```

#### Dialog (Modal)

Modal dialog component.

```tsx
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/Dialog';

<Dialog>
  <DialogTrigger asChild>
    <Button>Open Dialog</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Dialog Title</DialogTitle>
      <DialogDescription>Dialog description</DialogDescription>
    </DialogHeader>
    <div>Content</div>
    <DialogFooter>
      <Button>Confirm</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

#### Toast

Toast notifications.

```tsx
import { useToast } from '@/hooks/useToast';

const { toast } = useToast();

toast({
  title: 'Success',
  description: 'Operation completed successfully',
});

// With action
toast({
  title: 'Error',
  description: 'Something went wrong',
  variant: 'destructive',
  action: <Button size="sm">Retry</Button>,
});
```

#### Spinner

Loading spinner with different sizes.

```tsx
import { Spinner } from '@/components/ui/Spinner';

<Spinner />
<Spinner size="sm" />
<Spinner size="lg" />
```

#### Skeleton

Loading placeholder.

```tsx
import { Skeleton } from '@/components/ui/Skeleton';

<Skeleton className="h-4 w-full" />
<Skeleton className="h-8 w-32 rounded-full" />
```

#### Switch

Toggle switch component.

```tsx
import { Switch } from '@/components/ui/Switch';

<Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
```

#### Separator

Visual separator.

```tsx
import { Separator } from '@/components/ui/Separator';

<Separator />
<Separator orientation="vertical" />
```

#### Tooltip

Hover tooltip.

```tsx
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/Tooltip';

<TooltipProvider>
  <Tooltip>
    <TooltipTrigger>Hover me</TooltipTrigger>
    <TooltipContent>
      <p>Tooltip content</p>
    </TooltipContent>
  </Tooltip>
</TooltipProvider>
```

#### Badge

Small badge for labels and status indicators.

```tsx
import { Badge } from '@/components/ui/Badge';

<Badge>Default</Badge>
<Badge variant="secondary">Secondary</Badge>
<Badge variant="destructive">Error</Badge>
<Badge variant="outline">Outline</Badge>
```

#### Textarea

Multi-line text input.

```tsx
import { Textarea } from '@/components/ui/Textarea';

<Textarea placeholder="Enter text..." rows={4} />
```

## Utilities

### cn()

Utility function for merging Tailwind classes with proper conflict resolution.

```tsx
import { cn } from '@/lib/utils';

<div className={cn('base-class', condition && 'conditional-class', className)} />
```

## Theme

### ThemeProvider

Wrap your app with ThemeProvider for theme support.

```tsx
import { ThemeProvider } from '@/providers/ThemeProvider';

<ThemeProvider defaultTheme="dark" storageKey="app-theme">
  <App />
</ThemeProvider>
```

### useTheme Hook

```tsx
import { useTheme } from '@/hooks/useTheme';

const { theme, setTheme, toggleTheme } = useTheme();

// Set theme
setTheme('dark');  // 'light' | 'dark' | 'system'

// Toggle between light and dark
toggleTheme();
```

## Customization

To customize the design system colors, edit the CSS variables in `src/styles/globals.css`:

```css
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  /* ... */
}

.dark {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  /* ... */
}
```

To add new component variants, use `class-variance-authority`:

```tsx
import { cva, type VariantProps } from 'class-variance-authority';

const variants = cva('base-classes', {
  variants: {
    variant: {
      default: 'variant-classes',
      custom: 'custom-classes',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});
```
