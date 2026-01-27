# UI Components Catalog

## Overview

This document catalogs all reusable UI components in the AGI Workforce desktop application. Components are built on Radix UI primitives with Tailwind CSS v4 styling and follow accessibility best practices.

## Component Library

### Base Components (Radix UI + Custom Styling)

#### Button

Versatile button component with multiple variants and sizes.

**Location**: `src/components/ui/Button.tsx`

**Variants**:

- `default` - Primary action button
- `destructive` - Dangerous actions (delete, remove)
- `outline` - Secondary actions
- `ghost` - Minimal styling for tertiary actions
- `link` - Text-only button

**Sizes**: `default`, `sm`, `lg`, `icon`

**Usage**:

```tsx
import { Button } from '@/components/ui/Button';

<Button variant="default" size="lg">Primary Action</Button>
<Button variant="destructive">Delete</Button>
<Button variant="ghost" size="icon">
  <TrashIcon className="h-4 w-4" />
</Button>
```

**Props**:

```tsx
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  asChild?: boolean; // Radix Slot for composition
}
```

---

#### Badge

Small status indicator or label.

**Location**: `src/components/ui/Badge.tsx`

**Variants**: `default`, `secondary`, `destructive`, `outline`

**Usage**:

```tsx
import { Badge } from '@/components/ui/Badge';

<Badge variant="default">New</Badge>
<Badge variant="destructive">Error</Badge>
<Badge variant="outline">Beta</Badge>
```

---

#### Card

Container component for grouped content.

**Location**: `src/components/ui/Card.tsx`

**Sub-components**: `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`

**Usage**:

```tsx
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';

<Card>
  <CardHeader>
    <CardTitle>Card Title</CardTitle>
    <CardDescription>Card description</CardDescription>
  </CardHeader>
  <CardContent>
    <p>Card content goes here</p>
  </CardContent>
  <CardFooter>
    <Button>Action</Button>
  </CardFooter>
</Card>;
```

---

#### Spinner

Loading indicator with configurable sizes.

**Location**: `src/components/ui/Spinner.tsx`

**Sizes**: `sm`, `default`, `lg`, `xl`

**Usage**:

```tsx
import { Spinner } from '@/components/ui/Spinner';

<Spinner size="lg" className="text-primary" />;
```

---

#### Skeleton

Placeholder for loading content.

**Location**: `src/components/ui/Skeleton.tsx`

**Usage**:

```tsx
import { Skeleton } from '@/components/ui/Skeleton';

<div className="space-y-2">
  <Skeleton className="h-4 w-[250px]" />
  <Skeleton className="h-4 w-[200px]" />
</div>;
```

---

### Form Components

#### Input

Text input with consistent styling.

**Location**: `src/components/ui/Input.tsx`

**Usage**:

```tsx
import { Input } from '@/components/ui/Input';

<Input
  type="text"
  placeholder="Enter text"
  value={value}
  onChange={(e) => setValue(e.target.value)}
/>;
```

---

#### Textarea

Multi-line text input.

**Location**: `src/components/ui/Textarea.tsx`

**Usage**:

```tsx
import { Textarea } from '@/components/ui/Textarea';

<Textarea
  placeholder="Enter description"
  rows={4}
  value={value}
  onChange={(e) => setValue(e.target.value)}
/>;
```

---

#### Checkbox

Checkbox input with label support.

**Location**: `src/components/ui/Checkbox.tsx`

**Usage**:

```tsx
import { Checkbox } from '@/components/ui/Checkbox';
import { Label } from '@/components/ui/Label';

<div className="flex items-center space-x-2">
  <Checkbox id="terms" checked={checked} onCheckedChange={setChecked} />
  <Label htmlFor="terms">Accept terms and conditions</Label>
</div>;
```

---

#### Switch

Toggle switch component.

**Location**: `src/components/ui/Switch.tsx`

**Usage**:

```tsx
import { Switch } from '@/components/ui/Switch';
import { Label } from '@/components/ui/Label';

<div className="flex items-center space-x-2">
  <Switch id="notifications" checked={enabled} onCheckedChange={setEnabled} />
  <Label htmlFor="notifications">Enable notifications</Label>
</div>;
```

---

#### Select

Dropdown select component.

**Location**: `src/components/ui/Select.tsx`

**Sub-components**: `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem`, `SelectGroup`, `SelectLabel`

**Usage**:

```tsx
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';

<Select value={value} onValueChange={setValue}>
  <SelectTrigger>
    <SelectValue placeholder="Select option" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="option1">Option 1</SelectItem>
    <SelectItem value="option2">Option 2</SelectItem>
    <SelectItem value="option3">Option 3</SelectItem>
  </SelectContent>
</Select>;
```

---

#### Slider

Range slider input.

**Location**: `src/components/ui/Slider.tsx`

**Usage**:

```tsx
import { Slider } from '@/components/ui/Slider';

<Slider
  value={[value]}
  onValueChange={(values) => setValue(values[0])}
  min={0}
  max={100}
  step={1}
/>;
```

---

### Overlay Components

#### Dialog

Modal dialog component.

**Location**: `src/components/ui/Dialog.tsx`

**Sub-components**: `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`

**Usage**:

```tsx
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/Dialog';

<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Are you sure?</DialogTitle>
      <DialogDescription>This action cannot be undone.</DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <Button variant="outline" onClick={() => setOpen(false)}>
        Cancel
      </Button>
      <Button onClick={handleConfirm}>Confirm</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>;
```

---

#### AlertDialog

Confirmation dialog for critical actions.

**Location**: `src/components/ui/AlertDialog.tsx`

**Usage**:

```tsx
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/AlertDialog';

<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="destructive">Delete Account</Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
      <AlertDialogDescription>
        This action cannot be undone. This will permanently delete your account.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>;
```

---

#### Popover

Floating content container.

**Location**: `src/components/ui/Popover.tsx`

**Usage**:

```tsx
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover';

<Popover>
  <PopoverTrigger asChild>
    <Button variant="outline">Open</Button>
  </PopoverTrigger>
  <PopoverContent>
    <div className="space-y-2">
      <h4>Settings</h4>
      <p>Configure your preferences here.</p>
    </div>
  </PopoverContent>
</Popover>;
```

---

#### Tooltip

Hover tooltip for additional context.

**Location**: `src/components/ui/Tooltip.tsx`

**Usage**:

```tsx
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/Tooltip';

<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <Button variant="ghost" size="icon">
        <InfoIcon className="h-4 w-4" />
      </Button>
    </TooltipTrigger>
    <TooltipContent>
      <p>Additional information</p>
    </TooltipContent>
  </Tooltip>
</TooltipProvider>;
```

---

#### HoverCard

Rich hover card with more content than tooltip.

**Location**: `src/components/ui/HoverCard.tsx`

**Usage**:

```tsx
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/HoverCard';

<HoverCard>
  <HoverCardTrigger asChild>
    <span className="cursor-pointer underline">@username</span>
  </HoverCardTrigger>
  <HoverCardContent className="w-80">
    <div className="flex gap-4">
      <Avatar />
      <div className="space-y-1">
        <h4 className="font-semibold">User Name</h4>
        <p className="text-sm text-muted-foreground">Bio goes here</p>
      </div>
    </div>
  </HoverCardContent>
</HoverCard>;
```

---

### Navigation Components

#### Tabs

Tabbed navigation component.

**Location**: `src/components/ui/Tabs.tsx`

**Sub-components**: `TabsList`, `TabsTrigger`, `TabsContent`

**Usage**:

```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';

<Tabs defaultValue="overview">
  <TabsList>
    <TabsTrigger value="overview">Overview</TabsTrigger>
    <TabsTrigger value="analytics">Analytics</TabsTrigger>
    <TabsTrigger value="settings">Settings</TabsTrigger>
  </TabsList>
  <TabsContent value="overview">
    <p>Overview content</p>
  </TabsContent>
  <TabsContent value="analytics">
    <p>Analytics content</p>
  </TabsContent>
</Tabs>;
```

---

#### Accordion

Collapsible content sections.

**Location**: `src/components/ui/Accordion.tsx`

**Usage**:

```tsx
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/Accordion';

<Accordion type="single" collapsible>
  <AccordionItem value="item-1">
    <AccordionTrigger>Section 1</AccordionTrigger>
    <AccordionContent>Content for section 1</AccordionContent>
  </AccordionItem>
  <AccordionItem value="item-2">
    <AccordionTrigger>Section 2</AccordionTrigger>
    <AccordionContent>Content for section 2</AccordionContent>
  </AccordionItem>
</Accordion>;
```

---

#### DropdownMenu

Contextual menu component.

**Location**: `src/components/ui/DropdownMenu.tsx`

**Usage**:

```tsx
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';

<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="ghost" size="icon">
      <MoreVertical className="h-4 w-4" />
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    <DropdownMenuItem onClick={handleEdit}>
      <Edit className="mr-2 h-4 w-4" />
      Edit
    </DropdownMenuItem>
    <DropdownMenuItem onClick={handleDuplicate}>
      <Copy className="mr-2 h-4 w-4" />
      Duplicate
    </DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuItem onClick={handleDelete} className="text-destructive">
      <Trash className="mr-2 h-4 w-4" />
      Delete
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>;
```

---

### Feedback Components

#### Toast

Notification toast component (using Sonner).

**Location**: `src/components/ui/Toast.tsx`, `src/components/ui/Toaster.tsx`

**Usage**:

```tsx
import { toast } from 'sonner';

// Success toast
toast.success('Operation completed');

// Error toast
toast.error('Something went wrong');

// Loading toast
const toastId = toast.loading('Processing...');
// Later: toast.success('Done!', { id: toastId });

// Custom toast
toast.custom((t) => (
  <div className="flex items-center gap-2">
    <InfoIcon />
    <span>Custom message</span>
  </div>
));
```

---

#### Alert

Static alert component for important messages.

**Location**: `src/components/ui/Alert.tsx`

**Variants**: `default`, `destructive`

**Usage**:

```tsx
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert';
import { AlertCircle } from 'lucide-react';

<Alert variant="destructive">
  <AlertCircle className="h-4 w-4" />
  <AlertTitle>Error</AlertTitle>
  <AlertDescription>Your session has expired. Please log in again.</AlertDescription>
</Alert>;
```

---

#### Progress

Progress bar component.

**Location**: `src/components/ui/Progress.tsx`

**Usage**:

```tsx
import { Progress } from '@/components/ui/Progress';

<Progress value={progress} className="w-full" />;
```

---

### Layout Components

#### ScrollArea

Custom scrollbar component.

**Location**: `src/components/ui/ScrollArea.tsx`

**Usage**:

```tsx
import { ScrollArea } from '@/components/ui/ScrollArea';

<ScrollArea className="h-[300px] w-full">
  <div className="p-4">{longContent}</div>
</ScrollArea>;
```

---

#### Separator

Divider component.

**Location**: `src/components/ui/Separator.tsx`

**Orientations**: `horizontal`, `vertical`

**Usage**:

```tsx
import { Separator } from '@/components/ui/Separator';

<div>
  <p>Section 1</p>
  <Separator className="my-4" />
  <p>Section 2</p>
</div>;
```

---

#### Table

Table component with sub-components.

**Location**: `src/components/ui/Table.tsx`

**Sub-components**: `TableHeader`, `TableBody`, `TableFooter`, `TableRow`, `TableHead`, `TableCell`, `TableCaption`

**Usage**:

```tsx
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table';

<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Name</TableHead>
      <TableHead>Email</TableHead>
      <TableHead>Role</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {users.map((user) => (
      <TableRow key={user.id}>
        <TableCell>{user.name}</TableCell>
        <TableCell>{user.email}</TableCell>
        <TableCell>{user.role}</TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>;
```

---

### Custom Dialog Components

#### ConfirmDialog

Reusable confirmation dialog.

**Location**: `src/components/ui/ConfirmDialog.tsx`

**Usage**:

```tsx
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

<ConfirmDialog
  open={open}
  onOpenChange={setOpen}
  title="Delete File"
  description="Are you sure you want to delete this file?"
  confirmText="Delete"
  cancelText="Cancel"
  onConfirm={handleDelete}
  variant="destructive"
/>;
```

---

#### PromptDialog

Dialog for text input.

**Location**: `src/components/ui/PromptDialog.tsx`

**Usage**:

```tsx
import { PromptDialog } from '@/components/ui/PromptDialog';

<PromptDialog
  open={open}
  onOpenChange={setOpen}
  title="Rename File"
  description="Enter new file name"
  defaultValue={currentName}
  onConfirm={(newName) => handleRename(newName)}
  placeholder="File name"
/>;
```

---

### Specialized Components

#### ResizeHandle

Draggable resize handle for panels.

**Location**: `src/components/ui/ResizeHandle.tsx`

**Usage**:

```tsx
import { ResizeHandle } from '@/components/ui/ResizeHandle';

<div className="flex">
  <div className="flex-1">Left panel</div>
  <ResizeHandle direction="horizontal" onResize={(delta) => updateWidth(delta)} />
  <div className="flex-1">Right panel</div>
</div>;
```

---

#### Collapsible

Collapsible content wrapper.

**Location**: `src/components/ui/Collapsible.tsx`

**Usage**:

```tsx
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/Collapsible';

<Collapsible>
  <CollapsibleTrigger asChild>
    <Button variant="ghost">Toggle Details</Button>
  </CollapsibleTrigger>
  <CollapsibleContent>
    <p>Hidden content that can be revealed</p>
  </CollapsibleContent>
</Collapsible>;
```

---

## Composition Patterns

### Form Example

```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Button } from '@/components/ui/Button';
import { toast } from 'sonner';

const schema = z.object({
  name: z.string().min(2),
  email: z.email(),
});

type FormData = z.infer<typeof schema>;

function UserForm() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    try {
      await saveUser(data);
      toast.success('User saved successfully');
    } catch (error) {
      toast.error('Failed to save user');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <Label htmlFor="name">Name</Label>
        <Input id="name" {...register('name')} />
        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>

      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" {...register('email')} />
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>

      <Button type="submit">Save User</Button>
    </form>
  );
}
```

### Settings Panel Example

```tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Label } from '@/components/ui/Label';
import { Switch } from '@/components/ui/Switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import { Separator } from '@/components/ui/Separator';

function SettingsPanel() {
  const [notifications, setNotifications] = useState(true);
  const [theme, setTheme] = useState('dark');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Settings</CardTitle>
        <CardDescription>Manage your application preferences</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <Label htmlFor="notifications">Enable notifications</Label>
          <Switch id="notifications" checked={notifications} onCheckedChange={setNotifications} />
        </div>

        <Separator />

        <div className="space-y-2">
          <Label htmlFor="theme">Theme</Label>
          <Select value={theme} onValueChange={setTheme}>
            <SelectTrigger id="theme">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
```

## Accessibility Features

All components follow these accessibility guidelines:

1. **Keyboard Navigation**: Full keyboard support (Tab, Enter, Escape, Arrow keys)
2. **ARIA Attributes**: Proper ARIA labels, roles, and states
3. **Focus Management**: Visible focus indicators and logical focus order
4. **Screen Reader Support**: Descriptive labels and announcements
5. **Color Contrast**: WCAG AA compliant color contrast ratios
6. **Reduced Motion**: Respects `prefers-reduced-motion` setting

## Theming

Components use CSS custom properties for theming. Theme variables are defined in `src/styles/globals.css`:

```css
@theme {
  --color-background: hsl(var(--background));
  --color-foreground: hsl(var(--foreground));
  --color-primary: hsl(var(--primary));
  --color-primary-foreground: hsl(var(--primary-foreground));
  /* ... more theme variables */
}
```

Access theme via `useThemeContext()` hook:

```tsx
import { useThemeContext } from '@/providers/ThemeProvider';

function Component() {
  const { theme, setTheme } = useThemeContext();
  // theme: 'light' | 'dark' | 'system'
}
```

## Best Practices

1. **Use Radix Primitives**: Leverage Radix UI for complex interactions
2. **Composition**: Compose components rather than duplicating code
3. **Accessibility First**: Always include proper ARIA attributes
4. **Type Safety**: Define proper TypeScript interfaces
5. **Performance**: Use `memo` for expensive renders
6. **Consistent Styling**: Use Tailwind utility classes
7. **Testing**: Write tests for interactive components
